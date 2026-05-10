import { getScribePool } from './db';
import { ensureConsultation } from './ensureConsultation';

export type PersistScribeOutputInput = {
  outputId: string;
  consultationId: string;
  templateId: string;
  practiceId: string;
  patientId: string;
  systemFields: Record<string, string | null>;
  conditionalFields: Record<string, string | null>;
  markdown: string;
  latencyMs?: number | null;
  promptTokens?: number | null;
  completionTokens?: number | null;
  costUsd?: number | null;
};

export async function persistScribeOutput(input: PersistScribeOutputInput): Promise<string> {
  const pool = getScribePool();
  const client = await pool.connect();

  try {
    await client.query('BEGIN');

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
          system_fields_json,
          conditional_fields_json,
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
          $6::jsonb,
          $7::jsonb,
          $8,
          $9,
          false,
          $10,
          $11,
          $12,
          $13
        )
        RETURNING id::text AS id
      `,
      [
        input.outputId,
        input.consultationId,
        input.templateId,
        input.practiceId,
        input.patientId,
        JSON.stringify(input.systemFields),
        JSON.stringify(input.conditionalFields),
        input.markdown,
        input.markdown,
        input.promptTokens ?? null,
        input.completionTokens ?? null,
        input.costUsd ?? null,
        input.latencyMs ?? null,
      ]
    );

    const persistedId = result.rows[0]?.id?.trim();
    if (!persistedId) {
      throw new Error('Scribe output inserted but no id was returned.');
    }

    await client.query('COMMIT');
    return persistedId;
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }
}

// TODO: Persist provider usage fields once Gemini streaming helper exposes token/cost metadata.
