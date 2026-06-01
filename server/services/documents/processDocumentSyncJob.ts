import { createHash } from 'crypto';
import type { PoolClient } from 'pg';
import { config } from '../../config';
import { getDocumentSyncAccessToken } from './documentSyncAuth';
import {
  renderScribeOutput as renderScribeOutputDefault,
  type RenderErr,
  type RenderOk,
  type ScribeOutputConfigRow,
} from './renderScribeOutput';
import { uploadScribeRenderedFile as uploadScribeRenderedFileDefault } from './uploadScribeRenderedFile';

export type DocumentSyncPipelineDeps = {
  renderScribeOutput: typeof renderScribeOutputDefault;
  uploadScribeRenderedFile: typeof uploadScribeRenderedFileDefault;
  getDocumentSyncAccessToken: typeof getDocumentSyncAccessToken;
};

const defaultPipelineDeps: DocumentSyncPipelineDeps = {
  renderScribeOutput: renderScribeOutputDefault,
  uploadScribeRenderedFile: uploadScribeRenderedFileDefault,
  getDocumentSyncAccessToken,
};

function asRecord(v: unknown): Record<string, unknown> | null {
  if (!v || typeof v !== 'object' || Array.isArray(v)) return null;
  return v as Record<string, unknown>;
}

function asStringMap(v: unknown): Record<string, unknown> {
  const r = asRecord(v);
  return r ?? {};
}

/**
 * Verifies SHA-256 of the exact markdown bytes to be rendered. Throws before any render/upload.
 */
export function verifyFinalMarkdownSha256(finalMarkdown: string, expectedHash: unknown): void {
  if (typeof expectedHash !== 'string' || !/^[a-f0-9]{64}$/i.test(expectedHash)) {
    throw new Error('job_payload.finalMarkdownHash missing or invalid (64 hex SHA-256 required).');
  }
  const actual = createHash('sha256').update(finalMarkdown, 'utf8').digest('hex');
  if (actual.toLowerCase() !== expectedHash.toLowerCase()) {
    throw new Error('finalMarkdownHash mismatch; refusing to render or upload.');
  }
}

async function readFinalMarkdownFromPayload(
  payload: Record<string, unknown>,
  client: PoolClient,
  scribeOutputId: unknown
): Promise<string> {
  const fromPayload =
    typeof payload.finalMarkdown === 'string' && payload.finalMarkdown.trim()
      ? payload.finalMarkdown.trim()
      : '';
  if (fromPayload) return fromPayload;
  const r = await client.query<{ final_markdown: string | null }>(
    `SELECT final_markdown FROM scribe_outputs WHERE id = $1`,
    [scribeOutputId]
  );
  return r.rows[0]?.final_markdown?.trim() ?? '';
}

async function loadTemplateName(
  client: PoolClient,
  templateId: string | null
): Promise<string | null> {
  if (!templateId) return null;
  const r = await client.query<{ name: string }>(
    `SELECT name FROM scribe_templates WHERE id::text = $1 LIMIT 1`,
    [templateId]
  );
  return r.rows[0]?.name?.trim() || null;
}

async function loadOutputConfig(
  client: PoolClient,
  templateId: string | null
): Promise<ScribeOutputConfigRow | null> {
  if (!templateId) return null;
  const r = await client.query<ScribeOutputConfigRow>(
    `
      SELECT output_type, pdf_template_drive_id, pdf_field_mappings_json, docx_template_drive_id
      FROM scribe_output_configs
      WHERE template_id = $1::uuid
      ORDER BY created_at DESC NULLS LAST
      LIMIT 1
    `,
    [templateId]
  );
  return r.rows[0] ?? null;
}

async function markJobFailure(
  client: PoolClient,
  jobId: unknown,
  message: string,
  maxAttempts: number
): Promise<void> {
  const trimmedMessage = message.slice(0, 8000);
  await client.query(
    `
      UPDATE document_sync_jobs
      SET
        error_log = $2,
        status = CASE WHEN attempts >= $3 THEN 'failed' ELSE 'pending' END,
        last_attempted_at = NOW(),
        updated_at = NOW()
      WHERE id = $1::uuid
    `,
    [jobId, trimmedMessage, maxAttempts]
  );
}

function useMockDrivePipeline(): boolean {
  if (process.env.HALO_MOCK_DRIVE_UPLOAD === '1') return true;
  if (config.isProduction) return false;
  return !process.env.DOCUMENT_SYNC_GOOGLE_REFRESH_TOKEN?.trim();
}

/**
 * After a job row is claimed (status=processing), render → Drive upload → update scribe_outputs.
 * On failure: increments attempts, sets failed or re-queues pending; never mutates final_markdown / consultation_events.
 */
export async function processClaimedDocumentSyncJob(
  client: PoolClient,
  job: Record<string, unknown>,
  deps: DocumentSyncPipelineDeps = defaultPipelineDeps
): Promise<void> {
  const jobId = job.id;
  const scribeOutputId = job.scribe_output_id;
  const maxAttempts = Number(process.env.DOCUMENT_SYNC_MAX_ATTEMPTS || 5);

  try {
    const payload = asRecord(job.job_payload);
    if (!payload) {
      await markJobFailure(client, jobId, 'job_payload missing or invalid JSON', maxAttempts);
      return;
    }

    let finalMarkdown: string;
    try {
      finalMarkdown = await readFinalMarkdownFromPayload(payload, client, scribeOutputId);
    } catch (e) {
      await markJobFailure(client, jobId, e instanceof Error ? e.message : String(e), maxAttempts);
      return;
    }

    if (!finalMarkdown) {
      await markJobFailure(client, jobId, 'Scribe output markdown is empty or missing.', maxAttempts);
      return;
    }

    try {
      verifyFinalMarkdownSha256(finalMarkdown, payload.finalMarkdownHash);
    } catch (e) {
      await markJobFailure(client, jobId, e instanceof Error ? e.message : String(e), maxAttempts);
      return;
    }

    const practiceId =
      typeof payload.practiceId === 'string' && payload.practiceId.trim()
        ? payload.practiceId.trim()
        : String(job.practice_id || '').trim();
    const patientId =
      typeof payload.patientId === 'string' && payload.patientId.trim() ? payload.patientId.trim() : '';
    const consultationId =
      typeof payload.consultationId === 'string' && payload.consultationId.trim()
        ? payload.consultationId.trim()
        : '';
    const templateId =
      typeof payload.templateId === 'string' && payload.templateId.trim() ? payload.templateId.trim() : null;
    const jobOutputType = typeof payload.outputType === 'string' ? payload.outputType : 'pdf';

    if (!practiceId || !patientId) {
      await markJobFailure(client, jobId, 'job_payload missing practiceId or patientId.', maxAttempts);
      return;
    }

    let templateConfig: ScribeOutputConfigRow | null;
    try {
      templateConfig = await loadOutputConfig(client, templateId);
    } catch (e) {
      await markJobFailure(client, jobId, e instanceof Error ? e.message : String(e), maxAttempts);
      return;
    }

    let templateName: string | null = null;
    try {
      templateName =
        typeof payload.templateName === 'string' && payload.templateName.trim()
          ? payload.templateName.trim()
          : await loadTemplateName(client, templateId);
    } catch (e) {
      await markJobFailure(client, jobId, e instanceof Error ? e.message : String(e), maxAttempts);
      return;
    }

    const mockPipeline = useMockDrivePipeline();

    let accessToken: string | null = null;
    if (!mockPipeline) {
      try {
        accessToken = await deps.getDocumentSyncAccessToken();
      } catch (e) {
        await markJobFailure(client, jobId, e instanceof Error ? e.message : String(e), maxAttempts);
        return;
      }
      if (!accessToken) {
        await markJobFailure(
          client,
          jobId,
          'DOCUMENT_SYNC_GOOGLE_REFRESH_TOKEN not set (required when not using mock Drive pipeline).',
          maxAttempts
        );
        return;
      }
    }

    const renderInput = {
      finalMarkdown,
      outputType: jobOutputType,
      templateConfig,
      extractedTemplateVariables: asStringMap(payload.extractedTemplateVariables),
      practiceId,
      patientId,
      consultationId,
      templateId,
      templateName,
    };

    let render: RenderOk | RenderErr;
    try {
      render = await deps.renderScribeOutput(renderInput, {
        accessToken: accessToken || '',
        driveParentFolderIdForConversion: patientId,
        mockRenderDocxOnly: mockPipeline,
      });
    } catch (e) {
      await markJobFailure(client, jobId, e instanceof Error ? e.message : String(e), maxAttempts);
      return;
    }

    if (!render.ok) {
      await markJobFailure(client, jobId, `[${render.errorCode}] ${render.errorMessage}`, maxAttempts);
      return;
    }

    let upload;
    try {
      upload = await deps.uploadScribeRenderedFile({
        accessToken,
        patientFolderId: patientId,
        fileName: render.filename,
        mimeType: render.mimeType,
        buffer: render.buffer,
        templateFolderName: templateName,
        useMockUpload: mockPipeline,
      });
    } catch (e) {
      await markJobFailure(client, jobId, e instanceof Error ? e.message : String(e), maxAttempts);
      return;
    }

    try {
      if (render.outputKind === 'pdf_fill') {
        await client.query(
          `
          UPDATE scribe_outputs
          SET pdf_filled_drive_id = $2,
              drive_file_id = $2
          WHERE id = $1::uuid
            AND practice_id::text = $3
        `,
          [scribeOutputId, upload.driveFileId, practiceId]
        );
      } else {
        await client.query(
          `
          UPDATE scribe_outputs
          SET drive_file_id = $2
          WHERE id = $1::uuid
            AND practice_id::text = $3
        `,
          [scribeOutputId, upload.driveFileId, practiceId]
        );
      }

      await client.query(
        `
          INSERT INTO documents (
            patient_id,
            practice_id,
            consultation_id,
            scribe_output_id,
            type,
            drive_file_id,
            drive_url,
            filename,
            mime_type,
            uploaded_at
          )
          SELECT
            $1::uuid,
            $2::uuid,
            $3::uuid,
            $4::uuid,
            $5,
            $6,
            $7,
            $8,
            $9,
            NOW()
          WHERE NOT EXISTS (
            SELECT 1
            FROM documents
            WHERE scribe_output_id = $4::uuid
              AND drive_file_id = $6
          )
        `,
        [
          patientId,
          practiceId,
          consultationId,
          scribeOutputId,
          jobOutputType,
          upload.driveFileId,
          upload.driveViewUrl,
          upload.fileName,
          render.mimeType,
        ]
      );

      await client.query(
        `
        UPDATE document_sync_jobs
        SET status = 'resolved',
            drive_file_id = $2,
            drive_url = $3,
            filename = $4,
            completed_at = NOW(),
            last_attempted_at = NOW(),
            updated_at = NOW(),
            error_log = NULL
        WHERE id = $1::uuid
      `,
        [jobId, upload.driveFileId, upload.driveViewUrl, upload.fileName]
      );
    } catch (e) {
      await markJobFailure(client, jobId, e instanceof Error ? e.message : String(e), maxAttempts);
    }
  } catch (e) {
    await markJobFailure(client, jobId, e instanceof Error ? e.message : String(e), maxAttempts);
  }
}
