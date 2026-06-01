import { normalizeScribeMarkdownDates } from '../../utils/scribeMarkdownNormalize';
import { getScribePool } from './db';
import { ensureConsultation } from './ensureConsultation';
import { serializePgErrorForDebug } from './finalizeOutput';
import { setScribePracticeRlsContext } from './practiceRlsContext';

export type PersistScribeOutputInput = {
  outputId: string;
  consultationId: string;
  templateId: string;
  practiceId: string;
  patientId: string;
  rawTranscript: string;
  transcriptSource?: string;
  transcriptLanguage?: string;
  transcriptDurationSeconds?: number | null;
  transcriptConfidence?: number | null;
  transcriptMetadata?: Record<string, unknown>;
  systemFields: Record<string, string | null>;
  conditionalFields: Record<string, string | null>;
  /** From transcript requirement validation (see scribe_template_requirements). */
  extractedTemplateVariables?: Record<string, string> | null;
  markdown: string;
  latencyMs?: number | null;
  promptTokens?: number | null;
  completionTokens?: number | null;
  costUsd?: number | null;
};

export class ScribePersistenceError extends Error {
  readonly pgDebug: ReturnType<typeof serializePgErrorForDebug>;

  constructor(message: string, cause: unknown) {
    super(message);
    this.name = 'ScribePersistenceError';
    this.pgDebug = serializePgErrorForDebug(cause);
  }
}

/**
 * Persists draft markdown to `scribe_outputs` after SSE generation.
 * Does not insert `consultation_events` (finalize only) or `document_sync_jobs`.
 */
export async function persistScribeOutput(input: PersistScribeOutputInput): Promise<string> {
  const markdown = normalizeScribeMarkdownDates(input.markdown, {
    systemFields: input.systemFields,
    extractedTemplateVariables: input.extractedTemplateVariables ?? undefined,
  });
  const rawTranscript = String(input.rawTranscript || '').trim();
  const transcriptSource = String(input.transcriptSource || '').trim() || 'unknown';
  const transcriptLanguage = String(input.transcriptLanguage || '').trim() || 'unknown';
  const transcriptDurationSeconds =
    typeof input.transcriptDurationSeconds === 'number' && Number.isFinite(input.transcriptDurationSeconds)
      ? input.transcriptDurationSeconds
      : null;
  const transcriptConfidence =
    typeof input.transcriptConfidence === 'number' && Number.isFinite(input.transcriptConfidence)
      ? input.transcriptConfidence
      : null;
  const transcriptMetadata =
    input.transcriptMetadata && typeof input.transcriptMetadata === 'object' && !Array.isArray(input.transcriptMetadata)
      ? input.transcriptMetadata
      : {};

  const pool = getScribePool();
  const client = await pool.connect();

  try {
    await client.query('BEGIN');
    await setScribePracticeRlsContext(client, input.practiceId);

    await ensureConsultation(
      client,
      {
        consultationId: input.consultationId,
        patientId: input.patientId,
        practiceId: input.practiceId,
      },
      { createIfMissing: true }
    );

    const result = await client.query<{ id: string }>(
      `
        INSERT INTO scribe_outputs (
          id,
          consultation_id,
          template_id,
          practice_id,
          patient_id,
          raw_transcript,
          transcript_source,
          transcript_language,
          transcript_duration_seconds,
          transcript_confidence,
          transcript_metadata_json,
          system_fields_json,
          conditional_fields_json,
          extracted_template_variables_json,
          raw_markdown,
          final_markdown,
          doctor_edited,
          prompt_tokens,
          completion_tokens,
          cost_usd,
          latency_ms
        )
        VALUES (
          $1::uuid,
          $2::uuid,
          $3::uuid,
          $4::uuid,
          $5::uuid,
          $6,
          $7,
          $8,
          $9,
          $10,
          $11::jsonb,
          $12::jsonb,
          $13::jsonb,
          $14::jsonb,
          $15,
          $16,
          false,
          $17,
          $18,
          $19,
          $20
        )
        RETURNING id::text AS id
      `,
      [
        input.outputId,
        input.consultationId,
        input.templateId,
        input.practiceId,
        input.patientId,
        rawTranscript,
        transcriptSource,
        transcriptLanguage,
        transcriptDurationSeconds,
        transcriptConfidence,
        JSON.stringify(transcriptMetadata),
        JSON.stringify(input.systemFields),
        JSON.stringify(input.conditionalFields),
        input.extractedTemplateVariables && Object.keys(input.extractedTemplateVariables).length > 0
          ? JSON.stringify(input.extractedTemplateVariables)
          : null,
        markdown,
        markdown,
        input.promptTokens ?? null,
        input.completionTokens ?? null,
        input.costUsd ?? null,
        input.latencyMs ?? null,
      ]
    );

    const persistedId = result.rows[0]?.id?.trim();
    if (!persistedId) {
      throw new ScribePersistenceError('Scribe output inserted but no id was returned.', new Error('empty RETURNING'));
    }

    await client.query('COMMIT');
    return persistedId;
  } catch (err) {
    await client.query('ROLLBACK');
    if (err instanceof ScribePersistenceError) {
      throw err;
    }
    const pgDebug = serializePgErrorForDebug(err);
    const hint =
      pgDebug.code === '42501'
        ? 'Scribe RLS rejected the insert; practice context may be missing on the DB session.'
        : 'Scribe output persistence failed.';
    throw new ScribePersistenceError(hint, err);
  } finally {
    client.release();
  }
}

// TODO: Persist provider usage fields once Gemini streaming helper exposes token/cost metadata.
