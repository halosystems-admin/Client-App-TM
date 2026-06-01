import { createHash } from 'crypto';
import type { PoolClient } from 'pg';
import { normalizeScribeMarkdownDates } from '../../utils/scribeMarkdownNormalize';
import { resolveShouldSkipDocumentSyncJobs } from '../../lib/documentSyncJobGuards';
import { getScribePool } from './db';
import { ensureConsultation } from './ensureConsultation';
import { setScribePracticeRlsContext } from './practiceRlsContext';

const isNonProduction = (): boolean => process.env.NODE_ENV !== 'production';

function envFlagEnabled(name: string): boolean {
  return String(process.env[name] || '').trim() === '1';
}

export {
  shouldSkipDocumentSyncJobsForAdLocalDev,
  shouldSkipDocumentSyncJobsForLocalSupabase,
  shouldSkipDocumentSyncJobsForStagingEnv,
  shouldSkipDocumentSyncJobsForStagingMissingWriteGate,
  shouldSkipDocumentSyncJobsForGlobalDisable,
  shouldSkipDocumentSyncJobsForProductionDocumentOutputDisabled,
  shouldSkipDocumentSyncJobsForProductionFakeE2eRequest,
  shouldSkipDocumentSyncJobsForSkipDocumentOutputHeaders,
  resolveShouldSkipDocumentSyncJobs,
} from '../../lib/documentSyncJobGuards';

export type FinalizeScribeOptions = {
  skipDocumentSyncJobs?: boolean;
  requestHeaders?: Record<string, string | string[] | undefined>;
};

export type FinalizeScribeRequest = {
  finalMarkdown: string;
  doctorEdited: boolean;
};

export type FinalizeScribeResult = {
  outputId: string;
  consultationId: string;
  patientId: string;
  practiceId: string;
};

type ScribeOutputRow = {
  consultation_id: string;
  patient_id: string;
  practice_id: string;
  template_id: string | null;
  final_markdown: string | null;
  doctor_edited: boolean;
  prompt_tokens: number | null;
  completion_tokens: number | null;
  cost_usd: string | number | null;
  latency_ms: number | null;
  system_fields_json: unknown;
  extracted_template_variables_json: unknown;
};

function asStringRecord(value: unknown): Record<string, string | null> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return {};
  const out: Record<string, string | null> = {};
  for (const [k, v] of Object.entries(value as Record<string, unknown>)) {
    if (v === null || v === undefined) {
      out[k] = null;
    } else if (typeof v === 'string' || typeof v === 'number' || typeof v === 'boolean') {
      out[k] = String(v);
    }
  }
  return out;
}

function asExtractedRecord(value: unknown): Record<string, string> | null {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
  const out: Record<string, string> = {};
  for (const [k, v] of Object.entries(value as Record<string, unknown>)) {
    if (typeof v === 'string' && v.trim()) {
      out[k] = v.trim();
    }
  }
  return Object.keys(out).length > 0 ? out : null;
}

function isUuid(value: string): boolean {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value);
}

/** Matches Postgres uuid text (includes practice_ids that are not RFC-variant-valid). */
function isPostgresUuid(value: string): boolean {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(value.trim());
}

function practiceIdsEqual(a: string, b: string): boolean {
  return a.trim().toLowerCase() === b.trim().toLowerCase();
}

function pickFinalMarkdown(body: Record<string, unknown>): string {
  const keys = ['finalMarkdown', 'final_markdown', 'markdown'] as const;
  for (const key of keys) {
    const v = body[key];
    if (typeof v === 'string' && v.trim()) {
      return v.trim();
    }
  }
  return '';
}

function pickDoctorEdited(body: Record<string, unknown>): boolean {
  if (typeof body.doctorEdited === 'boolean') return body.doctorEdited;
  if (typeof body.doctor_edited === 'boolean') return body.doctor_edited;
  return false;
}

function sanitizeFilenamePart(value: string): string {
  const cleaned = value
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '');
  return cleaned || 'unknown';
}

function normalizeJobOutputType(value: string | null | undefined): 'pdf' | 'docx' | 'pdf_fill' {
  const normalized = String(value || '')
    .trim()
    .toLowerCase();
  if (normalized === 'docx') return 'docx';
  if (normalized === 'pdf_fill') return 'pdf_fill';
  return 'pdf';
}

function buildDocumentSyncFilename(
  patientId: string,
  templateName: string | null,
  outputType: 'pdf' | 'docx' | 'pdf_fill'
): string {
  const datePart = new Date().toISOString().slice(0, 10);
  const extension = outputType === 'docx' ? 'docx' : 'pdf';
  const patientPart = sanitizeFilenamePart(patientId);
  const templatePart = sanitizeFilenamePart(templateName || 'scribe_note');
  return `${patientPart}_${templatePart}_${datePart}.${extension}`;
}

async function columnExists(client: PoolClient, tableName: string, columnName: string): Promise<boolean> {
  const result = await client.query<{ exists: boolean }>(
    `
      SELECT EXISTS(
        SELECT 1
        FROM information_schema.columns
        WHERE table_schema = 'public'
          AND table_name = $1
          AND column_name = $2
      ) AS exists
    `,
    [tableName, columnName]
  );
  return Boolean(result.rows[0]?.exists);
}

/** For non-production 500 responses and logs (Postgres `DatabaseError` fields). */
export function serializePgErrorForDebug(err: unknown): {
  message: string;
  code?: string;
  detail?: string;
  constraint?: string;
  table?: string;
  column?: string;
  stack?: string;
} {
  const message = err instanceof Error ? err.message : String(err);
  const stack = err instanceof Error ? err.stack : undefined;
  if (!err || typeof err !== 'object') {
    return { message, stack };
  }
  const o = err as Record<string, unknown>;
  return {
    message,
    stack,
    code: typeof o.code === 'string' ? o.code : undefined,
    detail: typeof o.detail === 'string' ? o.detail : undefined,
    constraint: typeof o.constraint === 'string' ? o.constraint : undefined,
    table: typeof o.table === 'string' ? o.table : undefined,
    column: typeof o.column === 'string' ? o.column : undefined,
  };
}

export function validateFinalizeScribeRequest(
  rawBody: unknown
): { ok: true; data: FinalizeScribeRequest } | { ok: false; message: string } {
  const body = rawBody && typeof rawBody === 'object' ? (rawBody as Record<string, unknown>) : {};
  const finalMarkdown = pickFinalMarkdown(body);
  const doctorEdited = pickDoctorEdited(body);

  if (!finalMarkdown) {
    return {
      ok: false,
      message:
        'Provide non-empty note text using finalMarkdown, final_markdown, or markdown.',
    };
  }

  return {
    ok: true,
    data: {
      finalMarkdown,
      doctorEdited,
    },
  };
}

export async function finalizeScribeOutput(
  outputId: string,
  practiceId: string,
  input: FinalizeScribeRequest,
  options: FinalizeScribeOptions = {}
): Promise<FinalizeScribeResult> {
  if (!isUuid(outputId)) {
    throw new Error('Invalid outputId.');
  }
  if (!isPostgresUuid(practiceId)) {
    throw new Error('Invalid practiceId.');
  }

  const pool = getScribePool();
  const client = await pool.connect();
  const dev = isNonProduction();

  try {
    if (dev) {
      console.log('[finalizeOutput] BEGIN transaction', { outputId, resolvedPracticeId: practiceId });
    }
    await client.query('BEGIN');
    await setScribePracticeRlsContext(client, practiceId);

    const currentResult = await client.query<ScribeOutputRow>(
      `
        SELECT consultation_id::text,
               patient_id::text,
               practice_id::text,
               template_id::text,
               final_markdown,
               doctor_edited,
               prompt_tokens,
               completion_tokens,
               cost_usd,
               latency_ms,
               system_fields_json,
               extracted_template_variables_json
        FROM scribe_outputs
        WHERE id::text = $1
        FOR UPDATE
      `,
      [outputId]
    );

    if (currentResult.rows.length === 0) {
      throw new Error('Scribe output not found.');
    }

    const currentRow = currentResult.rows[0];

    if (dev) {
      console.log('[finalizeOutput] selected scribe_outputs row', {
        outputId,
        consultation_id: currentRow.consultation_id,
        patient_id: currentRow.patient_id,
        practice_id: currentRow.practice_id,
        final_markdown_length: currentRow.final_markdown?.length ?? 0,
        doctor_edited: currentRow.doctor_edited,
      });
    }

    const ownershipOk = practiceIdsEqual(currentRow.practice_id, practiceId);
    if (dev) {
      console.log('[finalizeOutput] practice ownership check', {
        outputId,
        ok: ownershipOk,
        rowPracticeId: currentRow.practice_id,
        resolvedPracticeId: practiceId,
      });
    }

    if (!ownershipOk) {
      throw new Error('Forbidden: output belongs to another practice.');
    }

    const rowPracticeId = currentRow.practice_id.trim();

    const createIfMissingConsultation = process.env.NODE_ENV !== 'production';
    if (dev) {
      console.log('[finalizeOutput] ensureConsultation start', {
        consultationId: currentRow.consultation_id,
        createIfMissing: createIfMissingConsultation,
      });
    }
    try {
      await ensureConsultation(
        client,
        {
          consultationId: currentRow.consultation_id,
          patientId: currentRow.patient_id,
          practiceId: rowPracticeId,
        },
        { createIfMissing: createIfMissingConsultation }
      );
      if (dev) {
        console.log('[finalizeOutput] ensureConsultation ok', {
          consultationId: currentRow.consultation_id,
        });
      }
    } catch (e) {
      console.error('[finalizeOutput] ensureConsultation failed', {
        outputId,
        consultationId: currentRow.consultation_id,
        createIfMissingConsultation,
        ...serializePgErrorForDebug(e),
      });
      throw e;
    }

    // NOTE: The "Early Exit" block has been deliberately removed here so jobs ALWAYS queue!

    const normalizedFinalMarkdown = normalizeScribeMarkdownDates(input.finalMarkdown, {
      systemFields: asStringRecord(currentRow.system_fields_json),
      extractedTemplateVariables: asExtractedRecord(currentRow.extracted_template_variables_json),
    });

    if (dev) {
      console.log('[finalizeOutput] UPDATE scribe_outputs start', {
        outputId,
        finalMarkdownLength: normalizedFinalMarkdown.length,
        doctorEdited: input.doctorEdited,
      });
    }
    await client.query(
      `
        UPDATE scribe_outputs
        SET final_markdown = $2,
            doctor_edited = $3
        WHERE id::text = $1
          AND practice_id::text = $4
      `,
      [outputId, normalizedFinalMarkdown, input.doctorEdited, rowPracticeId]
    );
    if (dev) {
      console.log('[finalizeOutput] UPDATE scribe_outputs ok', { outputId });
    }

    const hasStatusColumn = await columnExists(client, 'scribe_outputs', 'status');
    if (hasStatusColumn) {
      await client.query(
        `
          UPDATE scribe_outputs
          SET status = 'finalized'
          WHERE id::text = $1
            AND practice_id::text = $2
        `,
        [outputId, rowPracticeId]
      );
      if (dev) {
        console.log('[finalizeOutput] UPDATE scribe_outputs status=finalized ok', { outputId });
      }
    } else if (dev) {
      console.log('[finalizeOutput] scribe_outputs.status column not present; finalized state recorded via event trail', {
        outputId,
      });
    }

    const eventPayload = {
      content_md: normalizedFinalMarkdown,
      scribe_output_id: outputId,
      doctor_edited: input.doctorEdited,
    };

    if (dev) {
      console.log('[finalizeOutput] INSERT consultation_events start', {
        consultationId: currentRow.consultation_id,
        eventType: 'scribe_output',
        scribeOutputId: outputId,
        eventDataKeys: Object.keys(eventPayload),
        content_md_length: eventPayload.content_md.length,
      });
    }

    try {
      const existingScribeEvents = await client.query<{ id: string }>(
        `
          SELECT id::text AS id
          FROM consultation_events
          WHERE event_type = 'scribe_output'
            AND practice_id::text = $1
            AND event_data->>'scribe_output_id' = $2
          ORDER BY created_at ASC, id ASC
        `,
        [rowPracticeId, outputId]
      );

      if (existingScribeEvents.rows.length === 0) {
        await client.query(
          `
            INSERT INTO consultation_events (
              consultation_id,
              patient_id,
              practice_id,
              event_type,
              content_md,
              event_data
            )
            VALUES (
              $1::uuid,
              $2::uuid,
              $3::uuid,
              $4,
              $5,
              $6::jsonb
            )
          `,
          [
            currentRow.consultation_id,
            currentRow.patient_id,
            rowPracticeId,
            'scribe_output',
            normalizedFinalMarkdown,
            JSON.stringify(eventPayload),
          ]
        );
      } else {
        const primaryId = existingScribeEvents.rows[0].id;
        await client.query(
          `
            UPDATE consultation_events
            SET consultation_id = $2::uuid,
                patient_id = $3::uuid,
                practice_id = $4::uuid,
                event_type = 'scribe_output',
                content_md = $5,
                event_data = $6::jsonb
            WHERE id = $1::uuid
          `,
          [
            primaryId,
            currentRow.consultation_id,
            currentRow.patient_id,
            rowPracticeId,
            normalizedFinalMarkdown,
            JSON.stringify(eventPayload),
          ]
        );

        for (const dup of existingScribeEvents.rows.slice(1)) {
          await client.query(`DELETE FROM consultation_events WHERE id = $1::uuid`, [dup.id]);
        }
      }

      if (dev) {
        console.log('[finalizeOutput] consultation_events scribe_output row ensured', {
          consultationId: currentRow.consultation_id,
          existingRows: existingScribeEvents.rows.length,
        });
      }
    } catch (eventErr) {
      console.error('[finalizeOutput] consultation_events upsert/dedupe failed', {
        outputId,
        consultationId: currentRow.consultation_id,
        ...serializePgErrorForDebug(eventErr),
      });
      throw eventErr;
    }

    const usageTelemetryPayload = {
      scribe_output_id: outputId,
      consultation_id: currentRow.consultation_id,
      patient_id: currentRow.patient_id,
      practice_id: rowPracticeId,
      template_id: currentRow.template_id,
      prompt_tokens: currentRow.prompt_tokens,
      completion_tokens: currentRow.completion_tokens,
      cost_usd: currentRow.cost_usd,
      latency_ms: currentRow.latency_ms,
      finalized: true,
    };

    try {
      await client.query(
        `
          INSERT INTO consultation_events (
            consultation_id,
            patient_id,
            practice_id,
            event_type,
            event_data
          )
          VALUES (
            $1::uuid,
            $2::uuid,
            $3::uuid,
            $4,
            $5::jsonb
          )
        `,
        [
          currentRow.consultation_id,
          currentRow.patient_id,
          rowPracticeId,
          'scribe_usage_telemetry',
          JSON.stringify(usageTelemetryPayload),
        ]
      );
      if (dev) {
        console.log('[finalizeOutput] INSERT usage telemetry ok', {
          consultationId: currentRow.consultation_id,
          outputId,
        });
      }
    } catch (telemetryErr) {
      console.error('[finalizeOutput] usage telemetry INSERT failed', {
        outputId,
        consultationId: currentRow.consultation_id,
        ...serializePgErrorForDebug(telemetryErr),
      });
      throw telemetryErr;
    }

    const finalMarkdownHash = createHash('sha256').update(normalizedFinalMarkdown, 'utf8').digest('hex');

    const extractedVars =
      currentRow.extracted_template_variables_json &&
      typeof currentRow.extracted_template_variables_json === 'object' &&
      !Array.isArray(currentRow.extracted_template_variables_json)
        ? (currentRow.extracted_template_variables_json as Record<string, unknown>)
        : {};

    const skipDocumentSyncJobs = resolveShouldSkipDocumentSyncJobs({
      env: process.env,
      headers: options.requestHeaders,
      skipFromRouteOption: options.skipDocumentSyncJobs === true,
    });

    if (dev) {
      console.log('[finalizeOutput] document_sync_jobs skip decision', {
        outputId,
        skipDocumentSyncJobs,
        skipFromOptions: options.skipDocumentSyncJobs === true,
        activateLocalDev: envFlagEnabled('HALO_SCRIBE_ACTIVATE_LOCAL_DEV'),
        adSkipDocumentJobs: envFlagEnabled('HALO_SCRIBE_AD_SKIP_DOCUMENT_JOBS'),
      });
    }

    if (skipDocumentSyncJobs && dev) {
      console.log('[finalizeOutput] document_sync_jobs skip request ignored to preserve finalize/job consistency', {
        outputId,
      });
    }

    // Resolve template metadata for folder and filename in document sync pipeline.
    let templateNameForJob: string | null = null;
    if (currentRow.template_id) {
      try {
        const tnResult = await client.query<{ name: string }>(
          `SELECT name FROM scribe_templates WHERE id = $1::uuid LIMIT 1`,
          [currentRow.template_id]
        );
        templateNameForJob = tnResult.rows[0]?.name?.trim() || null;
      } catch (_) {
        // non-fatal: pipeline will fall back to no-folder mode
      }
    }

    let selectedOutputType: 'pdf' | 'docx' | 'pdf_fill' = 'pdf';
    if (currentRow.template_id) {
      try {
        const outputConfig = await client.query<{ output_type: string | null }>(
          `
            SELECT output_type
            FROM scribe_output_configs
            WHERE template_id = $1::uuid
            ORDER BY created_at DESC NULLS LAST
            LIMIT 1
          `,
          [currentRow.template_id]
        );
        selectedOutputType = normalizeJobOutputType(outputConfig.rows[0]?.output_type);
      } catch (_) {
        selectedOutputType = 'pdf';
      }
    }

    const filenameForJob = buildDocumentSyncFilename(
      currentRow.patient_id,
      templateNameForJob,
      selectedOutputType
    );

    const documentJobPayload = {
      sourceType: 'scribe_output',
      sourceId: outputId,
      outputId,
      output_id: outputId,
      outputType: selectedOutputType,
      practiceId: rowPracticeId,
      patientId: currentRow.patient_id,
      consultationId: currentRow.consultation_id,
      templateId: currentRow.template_id,
      templateName: templateNameForJob,
      finalMarkdown: normalizedFinalMarkdown,
      finalMarkdownHash,
      extractedTemplateVariables: extractedVars,
    };

    if (dev) {
      console.log('[finalizeOutput] ensure document_sync_jobs row', {
        outputId,
        practiceId: rowPracticeId,
        selectedOutputType,
        filenameForJob,
      });
    }

    try {
      const existingJob = await client.query<{ id: string }>(
        `
          SELECT id::text AS id
          FROM document_sync_jobs
          WHERE scribe_output_id = $1::uuid
            AND practice_id::text = $2
          ORDER BY created_at ASC
          LIMIT 1
          FOR UPDATE
        `,
        [outputId, rowPracticeId]
      );

      if (existingJob.rows.length === 0) {
        await client.query(
          `
            INSERT INTO document_sync_jobs (
              scribe_output_id,
              practice_id,
              status,
              attempts,
              output_type,
              filename,
              job_payload
            )
            VALUES (
              $1::uuid,
              $2::uuid,
              'pending',
              0,
              $3,
              $4,
              $5::jsonb
            )
          `,
          [outputId, rowPracticeId, selectedOutputType, filenameForJob, JSON.stringify(documentJobPayload)]
        );
      }

      if (dev) {
        console.log('[finalizeOutput] document_sync_jobs row ensured', {
          outputId,
          existed: existingJob.rows.length > 0,
        });
      }
    } catch (jobErr) {
      console.error('[finalizeOutput] document_sync_jobs ensure failed', {
        outputId,
        ...serializePgErrorForDebug(jobErr),
      });
      throw jobErr;
    }

    await client.query('COMMIT');
    if (dev) {
      console.log('[finalizeOutput] COMMIT ok', { outputId });
    }

    return {
      outputId,
      consultationId: currentRow.consultation_id,
      patientId: currentRow.patient_id,
      practiceId: currentRow.practice_id,
    };
  } catch (error) {
    try {
      await client.query('ROLLBACK');
    } catch (rollbackErr) {
      console.error('[finalizeOutput] ROLLBACK failed', serializePgErrorForDebug(rollbackErr));
    }
    console.error('[finalizeOutput] transaction FAILED', serializePgErrorForDebug(error));
    throw error;
  } finally {
    client.release();
  }
}