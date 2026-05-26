import type { PoolClient } from 'pg';

/**
 * Aligns pooled connections with Supabase Scribe RLS (`practice_isolation` policies).
 * Transaction-local (`true`) so the setting does not leak across pool check-ins.
 */
export async function setScribePracticeRlsContext(
  client: PoolClient,
  practiceId: string
): Promise<void> {
  const trimmed = practiceId.trim();
  if (!trimmed) {
    throw new Error('practiceId is required for Scribe RLS context.');
  }
  await client.query(`SELECT set_config('app.practice_id', $1, true)`, [trimmed]);
}
