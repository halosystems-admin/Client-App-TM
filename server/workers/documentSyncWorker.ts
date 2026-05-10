import { getScribePool } from '../services/scribe/db'; // Adjust this path if your db export is located elsewhere

export async function processNextDocumentJob() {
  const pool = getScribePool();
  const client = await pool.connect();

  try {
    await client.query('BEGIN');

    // 1. Claim the oldest pending job safely
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

    // If no jobs are pending, exit silently
    if (jobResult.rows.length === 0) {
      await client.query('COMMIT');
      return;
    }

    const job = jobResult.rows[0];
    console.log(`[Worker] Picked up document sync job: ${job.id}`);

    try {
      // 2. Fetch the actual markdown we need to convert
      const outputResult = await client.query(
        `SELECT final_markdown FROM scribe_outputs WHERE id = $1`,
        [job.scribe_output_id]
      );
      
      const finalMarkdown = outputResult.rows[0]?.final_markdown;
      if (!finalMarkdown) throw new Error('Scribe output markdown is empty or missing.');

      // 3. TODO: Execute the downstream tasks (FastAPI & Google Drive)
      // For now, we simulate the delay of a PDF render & upload
      console.log(`[Worker] Generating PDF and sending to Drive for Output ID: ${job.scribe_output_id}...`);
      await new Promise(resolve => setTimeout(resolve, 2000)); 

      // 4. Mark the job as completed
      await client.query(
        `UPDATE document_sync_jobs SET status = 'completed', updated_at = NOW() WHERE id = $1`,
        [job.id]
      );
      console.log(`[Worker] Job ${job.id} completed successfully.`);
      
      await client.query('COMMIT');

    } catch (jobError) {
      // If generation/upload fails, log it to the dead-letter queue
      console.error(`[Worker] Job ${job.id} failed:`, jobError);
      
      await client.query(
        `
          UPDATE document_sync_jobs 
          SET status = 'failed', 
              attempts = attempts + 1, 
              error_log = $2, 
              updated_at = NOW() 
          WHERE id = $1
        `,
        [job.id, jobError instanceof Error ? jobError.message : String(jobError)]
      );
      
      await client.query('COMMIT');
    }
  } catch (fatalError) {
    await client.query('ROLLBACK');
    console.error('[Worker] Fatal error connecting to queue:', fatalError);
  } finally {
    client.release();
  }
}

// Start the polling loop (runs every 10 seconds)
export function startDocumentSyncWorker() {
  console.log('[Worker] Document Sync Poller started.');
  setInterval(() => {
    processNextDocumentJob().catch(console.error);
  }, 10000); 
}