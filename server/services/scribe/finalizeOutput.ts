import { getScribePool } from './db';
import { ensureConsultation } from './ensureConsultation';

const isNonProduction = (): boolean => process.env.NODE_ENV !== 'production';

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
  final_markdown: string | null;
  doctor_edited: boolean;
};

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
  input: FinalizeScribeRequest
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

    const currentResult = await client.query<ScribeOutputRow>(
      `
        SELECT consultation_id::text, patient_id::text, practice_id::text, final_markdown, doctor_edited
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

    if (dev) {
      console.log('[finalizeOutput] UPDATE scribe_outputs start', {
        outputId,
        finalMarkdownLength: input.finalMarkdown.length,
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
      [outputId, input.finalMarkdown, input.doctorEdited, rowPracticeId]
    );
    if (dev) {
      console.log('[finalizeOutput] UPDATE scribe_outputs ok', { outputId });
    }

    const eventPayload = {
      content_md: input.finalMarkdown,
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
          'scribe_output',
          JSON.stringify(eventPayload),
        ]
      );
      if (dev) {
        console.log('[finalizeOutput] INSERT consultation_events ok', {
          consultationId: currentRow.consultation_id,
        });
      }
    } catch (eventErr) {
      console.error('[finalizeOutput] consultation_events INSERT failed', {
        outputId,
        consultationId: currentRow.consultation_id,
        ...serializePgErrorForDebug(eventErr),
      });
      throw eventErr;
    }

    if (dev) {
      console.log('[finalizeOutput] INSERT document_sync_jobs start', { outputId, practiceId: rowPracticeId });
    }
    try {
      await client.query(
        `
          INSERT INTO document_sync_jobs (scribe_output_id, practice_id)
          VALUES ($1::uuid, $2::uuid)
        `,
        [outputId, rowPracticeId]
      );
      if (dev) {
        console.log('[finalizeOutput] INSERT document_sync_jobs ok', { outputId });
      }
    } catch (jobErr) {
      console.error('[finalizeOutput] document_sync_jobs INSERT failed', {
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