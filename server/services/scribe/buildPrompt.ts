import pg from 'pg';
import { formatClinicalDate, formatClinicalTime } from '../../utils/clinicalDate';
import { getScribePool } from './db';

export type GenerateScribeRequest = {
  practiceId: string;
  patientId: string;
  consultationId: string;
  templateId: string;
  rawTranscript: string;
  /** Values extracted from transcript validation (template requirements); injected into user prompt only. */
  extractedTemplateVariables?: Record<string, string>;
};

export type BuildScribePromptResult = {
  system: string;
  user: string;
  systemFields: Record<string, string | null>;
  conditionalFields: Record<string, string | null>;
};

type TemplateRow = {
  id: string;
  practice_id: string;
  firebase_template_id: string | null;
  name: string;
  specialty: string | null;
  output_format: string | null;
  version: number | null;
};

type StylePromptRow = {
  system_prompt_md: string;
  version: number | null;
};

type ActiveStylePromptRow = {
  system_prompt_md: string | null;
  version: number | null;
};

export type TemplateStreamabilityStatus = {
  isStreamable: boolean;
};

type SystemFieldRow = {
  key: string;
  source: string | null;
  default_value: string | null;
  date_format: string | null;
};

type ConditionalFieldRow = {
  key: string;
  source_table: string | null;
  source_column: string | null;
};

type OutputContextRow = {
  consultation_id: string | null;
  created_at: string;
  system_fields_json: unknown;
  conditional_fields_json: unknown;
  final_markdown: string | null;
  raw_markdown: string | null;
};

const MAX_TRANSCRIPT_CHARS = 20000;

let pool: pg.Pool | null = null;

function getPool(): pg.Pool {
  if (pool) return pool;
  pool = getScribePool();

  return pool;
}

function asRecord(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return {};
  return value as Record<string, unknown>;
}

function readScalarField(obj: Record<string, unknown>, key: string): string | null {
  const value = obj[key];
  if (value === null || value === undefined) return null;
  const rendered =
    typeof value === 'string' || typeof value === 'number' || typeof value === 'boolean'
      ? String(value)
      : null;
  if (!rendered) return null;
  const trimmed = rendered.trim();
  return trimmed ? trimmed : null;
}

function truncate(value: string, maxLength: number): string {
  if (value.length <= maxLength) return value;
  return `${value.slice(0, maxLength)}...`;
}

async function loadTemplate(poolRef: pg.Pool, input: GenerateScribeRequest): Promise<TemplateRow> {
  const result = await poolRef.query<TemplateRow>(
    `
      SELECT
        id::text,
        practice_id::text,
        firebase_template_id,
        name,
        specialty,
        output_format,
        version
      FROM scribe_templates
      WHERE practice_id::text = $1
        AND (id::text = $2 OR firebase_template_id = $2)
      ORDER BY updated_at DESC
      LIMIT 1
    `,
    [input.practiceId, input.templateId]
  );

  if (result.rows.length === 0) {
    throw new Error('No matching scribe template found for practiceId/templateId.');
  }

  return result.rows[0];
}

async function fetchActiveStylePromptRows(
  poolRef: pg.Pool,
  templateDbId: string
): Promise<ActiveStylePromptRow[]> {
  const activeResult = await poolRef.query<ActiveStylePromptRow>(
    `
      SELECT system_prompt_md, version
      FROM scribe_style_prompts
      WHERE template_id::text = $1 AND is_active = true
      ORDER BY version DESC NULLS LAST, created_at DESC
    `,
    [templateDbId]
  );

  return activeResult.rows;
}

export async function resolveTemplateStreamabilityStatus(
  poolRef: pg.Pool,
  templateDbId: string
): Promise<TemplateStreamabilityStatus> {
  const rows = await fetchActiveStylePromptRows(poolRef, templateDbId);

  if (rows.length !== 1) {
    return { isStreamable: false };
  }

  const prompt = rows[0].system_prompt_md?.trim();
  return { isStreamable: Boolean(prompt) };
}

export async function loadActiveStylePrompt(
  poolRef: pg.Pool,
  templateDbId: string
): Promise<StylePromptRow> {
  const rows = await fetchActiveStylePromptRows(poolRef, templateDbId);

  if (rows.length === 0) {
    throw new Error('No active style prompt configured for template.');
  }

  if (rows.length > 1) {
    throw new Error('Multiple active style prompts configured for template.');
  }

  const row = rows[0];
  const prompt = row.system_prompt_md?.trim();
  if (!prompt) {
    throw new Error('Active style prompt is empty for template.');
  }

  return { system_prompt_md: prompt, version: row.version };
}

async function loadSystemFieldRows(poolRef: pg.Pool, templateDbId: string): Promise<SystemFieldRow[]> {
  const result = await poolRef.query<SystemFieldRow>(
    `
      SELECT key, source, default_value, date_format
      FROM scribe_system_fields
      WHERE template_id::text = $1
      ORDER BY field_order ASC NULLS LAST, created_at ASC
    `,
    [templateDbId]
  );
  return result.rows;
}

async function loadConditionalFieldRows(poolRef: pg.Pool, templateDbId: string): Promise<ConditionalFieldRow[]> {
  const result = await poolRef.query<ConditionalFieldRow>(
    `
      SELECT key, source_table, source_column
      FROM scribe_conditional_fields
      WHERE template_id::text = $1
      ORDER BY field_order ASC NULLS LAST, created_at ASC
    `,
    [templateDbId]
  );
  return result.rows;
}

async function loadLatestOutputContext(poolRef: pg.Pool, input: GenerateScribeRequest): Promise<OutputContextRow | null> {
  const result = await poolRef.query<OutputContextRow>(
    `
      SELECT
        consultation_id::text,
        created_at::text,
        system_fields_json,
        conditional_fields_json,
        final_markdown,
        raw_markdown
      FROM scribe_outputs
      WHERE practice_id::text = $1
        AND template_id::text = $2
        AND (
          consultation_id::text = $3
          OR patient_id::text = $4
        )
      ORDER BY
        CASE WHEN consultation_id::text = $3 THEN 0 ELSE 1 END,
        created_at DESC
      LIMIT 1
    `,
    [input.practiceId, input.templateId, input.consultationId, input.patientId]
  );

  return result.rows[0] ?? null;
}

async function loadRecentPatientOutputs(
  poolRef: pg.Pool,
  input: GenerateScribeRequest,
  limit: number = 5
): Promise<OutputContextRow[]> {
  const result = await poolRef.query<OutputContextRow>(
    `
      SELECT
        consultation_id::text,
        created_at::text,
        system_fields_json,
        conditional_fields_json,
        final_markdown,
        raw_markdown
      FROM scribe_outputs
      WHERE practice_id::text = $1
        AND patient_id::text = $2
        AND template_id::text = $3
      ORDER BY
        CASE WHEN consultation_id::text = $4 THEN 0 ELSE 1 END,
        created_at DESC
      LIMIT $5
    `,
    [input.practiceId, input.patientId, input.templateId, input.consultationId, limit]
  );

  return result.rows;
}

function pickBestMarkdown(row: OutputContextRow | null | undefined): string | null {
  if (!row) return null;
  const finalText = row.final_markdown?.trim();
  if (finalText) return finalText;
  const rawText = row.raw_markdown?.trim();
  return rawText || null;
}

function resolveFieldFromOutputRecords(
  key: string,
  records: Array<Record<string, unknown>>
): string | null {
  for (const record of records) {
    const value = readScalarField(record, key);
    if (value) return value;
  }
  return null;
}

function buildRecentConsultationContext(rows: OutputContextRow[], currentConsultationId: string): string | null {
  const snippets = rows
    .filter((row) => row.consultation_id && row.consultation_id !== currentConsultationId)
    .slice(0, 2)
    .map((row) => {
      const markdown = pickBestMarkdown(row);
      if (!markdown || !row.consultation_id) return null;
      return `- consultation ${row.consultation_id}: ${truncate(markdown, 500)}`;
    })
    .filter((value): value is string => Boolean(value));

  if (snippets.length === 0) return null;
  return snippets.join('\n');
}

function formatNonNullFields(fields: Record<string, string | null>): string {
  const entries = Object.entries(fields).filter(([, value]) => value !== null);
  if (entries.length === 0) {
    return '- none';
  }

  return entries.map(([key, value]) => `- ${key}: ${value}`).join('\n');
}

export async function buildScribePrompt(input: GenerateScribeRequest): Promise<BuildScribePromptResult> {
  // --- TEMPORARY BYPASS FOR SSE TESTING ---
  if (input.templateId === 'test') {
    return {
      system: 'You are HALO Scribe, a medical documentation assistant. Format the transcript into a standard clinical note suitable for a South African hospital setting, prioritizing local STGs and EDL where appropriate.',
      user: `Dictation transcript:\n${input.rawTranscript}`,
      systemFields: { 
        practice_id: input.practiceId, 
        patient_id: input.patientId, 
        consultation_id: input.consultationId, 
        template_id: 'test' 
      },
      conditionalFields: {},
    };
  }
  // ----------------------------------------

  const transcript = input.rawTranscript.trim();
  const transcriptForPrompt = truncate(transcript, MAX_TRANSCRIPT_CHARS);

  const poolRef = getPool();
  const template = await loadTemplate(poolRef, input);

  const [stylePrompt, systemFieldRows, conditionalFieldRows, latestOutput, recentPatientOutputs] = await Promise.all([
    loadActiveStylePrompt(poolRef, template.id),
    loadSystemFieldRows(poolRef, template.id),
    loadConditionalFieldRows(poolRef, template.id),
    loadLatestOutputContext(poolRef, {
      ...input,
      templateId: template.id,
    }),
    loadRecentPatientOutputs(poolRef, {
      ...input,
      templateId: template.id,
    }),
  ]);

  const systemFieldSources: Array<Record<string, unknown>> = [
    asRecord(latestOutput?.system_fields_json),
    ...recentPatientOutputs.map((row) => asRecord(row.system_fields_json)),
  ];

  const conditionalFieldSources: Array<Record<string, unknown>> = [
    asRecord(latestOutput?.conditional_fields_json),
    ...recentPatientOutputs.map((row) => asRecord(row.conditional_fields_json)),
  ];

  const systemFields: Record<string, string | null> = {
    practice_id: input.practiceId,
    patient_id: input.patientId,
    consultation_id: input.consultationId,
    template_id: template.id,
  };

  for (const field of systemFieldRows) {
    const fromOutput = resolveFieldFromOutputRecords(field.key, systemFieldSources);
    if (fromOutput) {
      systemFields[field.key] = fromOutput;
      continue;
    }

    if (field.default_value && field.default_value.trim()) {
      systemFields[field.key] = field.default_value.trim();
      continue;
    }

    if (field.source === 'practice_id') {
      systemFields[field.key] = input.practiceId;
      continue;
    }
    if (field.source === 'patient_id') {
      systemFields[field.key] = input.patientId;
      continue;
    }
    if (field.source === 'consultation_id') {
      systemFields[field.key] = input.consultationId;
      continue;
    }

    if (field.source === 'system_clock') {
      const now = new Date();
      if (field.key === 'time' || field.key.endsWith('_time')) {
        systemFields[field.key] = formatClinicalTime(now);
      } else {
        systemFields[field.key] = formatClinicalDate(now, field.date_format);
      }
      continue;
    }

    systemFields[field.key] = null;
  }

  const extractedDate = input.extractedTemplateVariables?.date?.trim();
  if (extractedDate && !systemFields.date?.trim()) {
    systemFields.date = extractedDate;
  }
  if (!systemFields.date?.trim()) {
    systemFields.date = formatClinicalDate(new Date(), 'YYYY-MM-DD');
  }

  // Keep canonical identifiers stable even if a template defines overlapping system field keys.
  systemFields.practice_id = input.practiceId;
  systemFields.patient_id = input.patientId;
  systemFields.consultation_id = input.consultationId;
  systemFields.template_id = template.id;

  const conditionalFields: Record<string, string | null> = {};
  for (const field of conditionalFieldRows) {
    const fromOutput = resolveFieldFromOutputRecords(field.key, conditionalFieldSources);
    if (fromOutput) {
      conditionalFields[field.key] = fromOutput;
      continue;
    }

    const sourceTable = field.source_table?.trim().toLowerCase() || null;
    const sourceColumn = field.source_column?.trim().toLowerCase() || null;

    if (sourceTable === 'scribe_outputs' && sourceColumn === 'consultation_id') {
      conditionalFields[field.key] = input.consultationId;
      continue;
    }
    if (sourceTable === 'scribe_outputs' && sourceColumn === 'patient_id') {
      conditionalFields[field.key] = input.patientId;
      continue;
    }

    conditionalFields[field.key] = null;
  }

  const patientContextFromOutput =
    pickBestMarkdown(latestOutput) ||
    recentPatientOutputs.map((row) => pickBestMarkdown(row)).find((value): value is string => Boolean(value)) ||
    null;

  const recentConsultationContext = buildRecentConsultationContext(recentPatientOutputs, input.consultationId);

  // TODO: Add dedicated patient demographics lookup when a canonical patient table is available server-side.
  const patientContext = {
    displayName: `Patient ${input.patientId}`,
    specialty: template.specialty,
    recentClinicalContext: patientContextFromOutput,
  };

  const system = [
    'You are HALO Scribe, a medical documentation assistant.',
    stylePrompt.system_prompt_md,
    'Do not invent facts that are not present in the provided context or transcript.',
  ].join('\n');

  const extractedVars = input.extractedTemplateVariables;
  const extractedBlock =
    extractedVars && Object.keys(extractedVars).length > 0
      ? [
          '',
          'TEMPLATE-SPECIFIC REQUIRED VARIABLES:',
          ...Object.entries(extractedVars).map(([k, v]) => `${k}: ${v}`),
          '',
          'Use these exact values. Do not invent missing values.',
        ].join('\n')
      : '';

  const dateInstruction = systemFields.date?.trim()
    ? `For the "### Date" section, use exactly this date on its own line: ${systemFields.date}. Do not write "Today" or other relative date words.`
    : null;

  const user = [
    'Patient context:',
    `- name: ${patientContext.displayName}`,
    `- specialty: ${patientContext.specialty ?? 'unspecified'}`,
    `- recent_context: ${patientContext.recentClinicalContext ? truncate(patientContext.recentClinicalContext, 1200) : 'not available'}`,
    `- recent_consultations: ${recentConsultationContext ?? 'not available'}`,
    '',
    'Template metadata:',
    `- template_name: ${template.name}`,
    `- template_version: ${template.version ?? stylePrompt.version ?? 'unknown'}`,
    `- output_format: ${template.output_format ?? 'markdown'}`,
    '',
    'Resolved system fields:',
    formatNonNullFields(systemFields),
    ...(dateInstruction ? ['', dateInstruction] : []),
    '',
    'Conditional fields (if present):',
    formatNonNullFields(conditionalFields),
    extractedBlock,
    '',
    'Dictation transcript:',
    transcriptForPrompt,
  ].join('\n');

  return {
    system,
    user,
    systemFields,
    conditionalFields,
  };
}
