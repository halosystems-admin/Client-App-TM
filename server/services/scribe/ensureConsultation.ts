import type { Pool, PoolClient } from 'pg';

export type EnsureConsultationParams = {
  consultationId: string;
  patientId: string;
  practiceId: string;
  /** Defaults to `rooms` to match seeded dev data / app convention */
  consultationType?: string;
};

type Db = Pool | PoolClient;

function idsEqual(a: string, b: string): boolean {
  return a.trim().toLowerCase() === b.trim().toLowerCase();
}

export type EnsureConsultationOptions = {
  /** When false and no row exists, throws instead of inserting (finalize in production). */
  createIfMissing: boolean;
};

/**
 * Ensures `consultations` has a row for the given id before Scribe writes or events.
 * When the row exists, verifies `patient_id` and `practice_id` match the Scribe context.
 */
export async function ensureConsultation(
  db: Db,
  params: EnsureConsultationParams,
  options: EnsureConsultationOptions
): Promise<void> {
  const consultationType = params.consultationType ?? 'rooms';

  const existing = await db.query<{ patient_id: string; practice_id: string }>(
    `
      SELECT patient_id::text AS patient_id, practice_id::text AS practice_id
      FROM consultations
      WHERE id::text = $1
    `,
    [params.consultationId]
  );

  if (existing.rows.length > 0) {
    const row = existing.rows[0];
    if (!idsEqual(row.patient_id, params.patientId) || !idsEqual(row.practice_id, params.practiceId)) {
      console.warn('[ensureConsultation] consultation row conflicts with Scribe context', {
        consultationId: params.consultationId,
        expectedPatientId: params.patientId,
        rowPatientId: row.patient_id,
        expectedPracticeId: params.practiceId,
        rowPracticeId: row.practice_id,
      });
      throw new Error('Consultation exists but does not match this patient or practice.');
    }
    console.log('[ensureConsultation] consultation ok (existing row)', {
      consultationId: params.consultationId,
    });
    return;
  }

  if (!options.createIfMissing) {
    console.error('[ensureConsultation] missing consultation and createIfMissing=false', {
      consultationId: params.consultationId,
      patientId: params.patientId,
      practiceId: params.practiceId,
    });
    throw new Error('Consultation not found for this scribe output.');
  }

  console.log('[ensureConsultation] creating consultation row', {
    consultationId: params.consultationId,
    patientId: params.patientId,
    practiceId: params.practiceId,
    consultationType,
  });

  try {
    await db.query(
      `
        INSERT INTO consultations (
          id,
          patient_id,
          practice_id,
          consultation_date,
          consultation_type
        )
        VALUES ($1::uuid, $2::uuid, $3::uuid, CURRENT_DATE, $4)
      `,
      [params.consultationId, params.patientId, params.practiceId, consultationType]
    );
  } catch (err) {
    console.error('[ensureConsultation] INSERT into consultations failed', {
      consultationId: params.consultationId,
      code: err && typeof err === 'object' && 'code' in err ? (err as { code?: string }).code : undefined,
      detail: err && typeof err === 'object' && 'detail' in err ? (err as { detail?: string }).detail : undefined,
      message: err instanceof Error ? err.message : String(err),
    });
    throw err;
  }

  console.log('[ensureConsultation] consultation created', { consultationId: params.consultationId });
}
