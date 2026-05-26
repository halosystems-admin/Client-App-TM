import { getScribePool } from '../services/scribe/db';
import { processClaimedDocumentSyncJob } from '../services/documents/processDocumentSyncJob';

export async function processNextDocumentJob() {
  const pool = getScribePool();
  const client = await pool.connect();

  try {
    await client.query('BEGIN');

    const jobResult = await client.query(`
      UPDATE document_sync_jobs
      SET status = 'processing', updated_at = NOW()
      WHERE id = (
          SELECT id FROM document_sync_jobs
          WHERE status = 'pending'
          ORDER BY created_at ASC
          FOR UPDATE SKIP LOCKED
          LIMIT 1
      ) RETURNING *;
    `);

    if (jobResult.rows.length === 0) {
      await client.query('COMMIT');
      return;
    }

    const job = jobResult.rows[0] as Record<string, unknown>;
    console.log(`[Worker] Picked up document sync job: ${String(job.id)}`);

    await processClaimedDocumentSyncJob(client, job);
    await client.query('COMMIT');
    console.log(`[Worker] Job ${String(job.id)} finished pipeline (see document_sync_jobs.status).`);
  } catch (fatalError) {
    await client.query('ROLLBACK');
    console.error('[Worker] Fatal error in document sync transaction:', fatalError);
  } finally {
    client.release();
  }
}

export function startDocumentSyncWorker() {
  console.log('[Worker] Document Sync Poller started.');
  setInterval(() => {
    processNextDocumentJob().catch(console.error);
  }, 10000);
}
