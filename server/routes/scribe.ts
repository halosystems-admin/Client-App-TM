import express, { Request, Response } from 'express';
import { createHash, randomUUID } from 'crypto';
import { buildScribePrompt, GenerateScribeRequest } from '../services/scribe/buildPrompt';
import { generateTextStream } from '../services/gemini';
import { getScribePool } from '../services/scribe/db';
import { persistScribeOutput } from '../services/scribe/persistOutput';
import {
  finalizeScribeOutput,
  validateFinalizeScribeRequest,
  serializePgErrorForDebug,
} from '../services/scribe/finalizeOutput';

const router = express.Router();

function canWriteSse(res: Response): boolean {
  return !res.writableEnded && !res.destroyed;
}

function writeSseEvent(res: Response, payload: Record<string, unknown>): void {
  res.write(`data: ${JSON.stringify(payload)}\n\n`);
}

function validateGenerateScribeBody(
  rawBody: unknown
): { ok: true; data: GenerateScribeRequestInput } | { ok: false; message: string } {
  const body = rawBody && typeof rawBody === 'object' ? (rawBody as Record<string, unknown>) : {};

  const practiceId = typeof body.practiceId === 'string' ? body.practiceId.trim() : '';
  const patientId = typeof body.patientId === 'string' ? body.patientId.trim() : '';
  const consultationId = typeof body.consultationId === 'string' ? body.consultationId.trim() : '';
  const templateId = typeof body.templateId === 'string' ? body.templateId.trim() : '';
  const rawTranscript = typeof body.rawTranscript === 'string' ? body.rawTranscript.trim() : '';

  if (!patientId) {
    return { ok: false, message: 'patientId is required.' };
  }

  if (!consultationId) {
    return { ok: false, message: 'consultationId is required.' };
  }

  if (!templateId) {
    return { ok: false, message: 'templateId is required.' };
  }

  if (!rawTranscript) {
    return { ok: false, message: 'rawTranscript is required.' };
  }

  return {
    ok: true,
    data: {
      practiceId: practiceId || undefined,
      patientId,
      consultationId,
      templateId,
      rawTranscript,
    },
  };
}

type GenerateScribeRequestInput = Omit<GenerateScribeRequest, 'practiceId'> & {
  practiceId?: string;
};

async function resolvePracticeId(inputPracticeId?: string): Promise<string> {
  const bodyPracticeId = typeof inputPracticeId === 'string' ? inputPracticeId.trim() : '';

  // req.body.practiceId is local/E2E convenience only; production must not trust it.
  if (process.env.NODE_ENV !== 'production' && bodyPracticeId) {
    return bodyPracticeId;
  }

  const pool = getScribePool();

  const result = await pool.query<{ practice_id: string | null }>(
    `
      SELECT nullif(current_setting('app.practice_id', true), '')::text AS practice_id
    `
  );

  const resolved = result.rows[0]?.practice_id?.trim() || '';

  if (!resolved) {
    throw new Error('practiceId is required or app.practice_id must be configured.');
  }

  return resolved;
}

function isUuid(value: string): boolean {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(
    value
  );
}

/** Postgres UUID text form (includes IDs that fail strict RFC variant checks, e.g. local dev dummy practice). */
function isPostgresUuid(value: string): boolean {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(value.trim());
}

/** Same dummy used when session/auth practice is missing in non-production; matches typical dev scribe_outputs rows. */
const LOCAL_DEV_FALLBACK_PRACTICE_ID = '44444444-4444-4444-4444-444444444444';

function extractTrustedPracticeIdFromRequest(req: Request): string | null {
  const rawPracticeId =
    (req as unknown as { user?: { practiceId?: unknown; practice_id?: unknown } }).user?.practiceId ??
    (req as unknown as { user?: { practiceId?: unknown; practice_id?: unknown } }).user?.practice_id ??
    (req as unknown as { auth?: { practiceId?: unknown; practice_id?: unknown } }).auth?.practiceId ??
    (req as unknown as { auth?: { practiceId?: unknown; practice_id?: unknown } }).auth?.practice_id ??
    (req as unknown as { session?: { practiceId?: unknown; practice_id?: unknown } }).session?.practiceId ??
    (req as unknown as { session?: { practiceId?: unknown; practice_id?: unknown } }).session?.practice_id ??
    '';

  const practiceId = typeof rawPracticeId === 'string' ? rawPracticeId.trim() : '';
  return practiceId && isPostgresUuid(practiceId) ? practiceId : null;
}

/**
 * Resolves practice for finalize/save (never reads req.body / req.query practiceId).
 * Order matches generate’s trusted sources: session/auth → DB app.practice_id (resolvePracticeId) → non-prod dummy.
 */
async function resolvePracticeContextForFinalize(req: Request): Promise<
  { ok: true; practiceId: string } | { ok: false }
> {
  const fromSession = extractTrustedPracticeIdFromRequest(req);
  if (fromSession) {
    return { ok: true, practiceId: fromSession };
  }

  try {
    const fromDbSetting = await resolvePracticeId(undefined);
    if (fromDbSetting && isPostgresUuid(fromDbSetting)) {
      return { ok: true, practiceId: fromDbSetting };
    }
  } catch {
    // Missing app.practice_id or pool — fall through to dev dummy or 403
  }

  if (process.env.NODE_ENV !== 'production') {
    console.warn('⚠️ [scribe] Local Dev: Missing auth context, using dummy practiceId for testing.');
    return { ok: true, practiceId: LOCAL_DEV_FALLBACK_PRACTICE_ID };
  }

  return { ok: false };
}

/**
 * Practice scope for GET /templates. Never trusts req.query in production.
 * Order: session/auth → DB app.practice_id → (non-prod only) valid query param → non-prod dummy.
 */
async function resolvePracticeContextForTemplates(req: Request): Promise<
  { ok: true; practiceId: string } | { ok: false }
> {
  const fromSession = extractTrustedPracticeIdFromRequest(req);
  if (fromSession) {
    return { ok: true, practiceId: fromSession };
  }

  try {
    const fromDbSetting = await resolvePracticeId(undefined);
    if (fromDbSetting && isPostgresUuid(fromDbSetting)) {
      return { ok: true, practiceId: fromDbSetting };
    }
  } catch {
    // fall through
  }

  if (process.env.NODE_ENV !== 'production') {
    const q = req.query?.practiceId;
    const queryId =
      typeof q === 'string'
        ? q.trim()
        : Array.isArray(q) && typeof q[0] === 'string'
          ? q[0].trim()
          : '';
    if (queryId && isPostgresUuid(queryId)) {
      console.log('[scribe/templates] non-production: using practiceId from query string', {
        practiceId: queryId,
      });
      return { ok: true, practiceId: queryId };
    }

    console.warn('⚠️ [scribe/templates] Local Dev: Missing auth context, using dummy practiceId for testing.');
    return { ok: true, practiceId: LOCAL_DEV_FALLBACK_PRACTICE_ID };
  }

  return { ok: false };
}

function normalizePatientId(value: string): string {
  const trimmed = value.trim();

  if (isUuid(trimmed)) {
    return trimmed;
  }

  const hash = createHash('sha1').update(trimmed).digest('hex');

  const segment1 = hash.slice(0, 8);
  const segment2 = hash.slice(8, 12);
  const segment3 = `5${hash.slice(13, 16)}`;
  const segment4 = `a${hash.slice(17, 20)}`;
  const segment5 = hash.slice(20, 32);

  return `${segment1}-${segment2}-${segment3}-${segment4}-${segment5}`;
}

// POST /api/scribe/generate
router.post('/generate', async (req: Request, res: Response) => {
  console.log('[scribe] request received');

  const parsed = validateGenerateScribeBody(req.body);

  if (!parsed.ok) {
    res.status(400).json({ error: parsed.message });
    return;
  }

  console.log('[scribe] request validated');

  // Mandatory SSE headers
  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache');
  res.setHeader('Connection', 'keep-alive');

  // Helpful when running behind some proxies
  res.flushHeaders?.();

  let clientDisconnected = false;
  let streamIterator: AsyncIterator<string> | null = null;

  req.on('close', () => {
    clientDisconnected = true;

    if (streamIterator?.return) {
      void streamIterator.return();
    }
  });

  try {
    console.log('[scribe] prompt build started');

    console.log('[scribe] incoming practiceId', {
      hasPracticeId: Boolean(req.body?.practiceId),
      practiceId: req.body?.practiceId,
    });

    const practiceId = await resolvePracticeId(parsed.data.practiceId);
    const normalizedPatientId = normalizePatientId(parsed.data.patientId);
    const outputId = randomUUID();

    const prompt = await buildScribePrompt({
      ...parsed.data,
      practiceId,
      patientId: normalizedPatientId,
    });

    console.log('[scribe] prompt build succeeded');

    console.log('[scribe] prompt assembled', {
      practiceScoped: Boolean(practiceId),
      systemLength: prompt.system.length,
      userLength: prompt.user.length,
      systemFieldCount: Object.keys(prompt.systemFields).length,
      conditionalFieldCount: Object.keys(prompt.conditionalFields).length,
    });

    const llmPrompt = [
      'System instructions:',
      prompt.system,
      '',
      'User input:',
      prompt.user,
    ].join('\n');

    // Local testing bypass:
    // Windows PowerShell/curl can sometimes trigger close early.
    if (clientDisconnected || res.writableEnded) {
      console.log(
        '[scribe] WARNING: Express thought the client disconnected, but bypassing it for local testing.',
        {
          clientDisconnected,
          writableEnded: res.writableEnded,
        }
      );

      clientDisconnected = false;
    }

    const stream = generateTextStream(
      llmPrompt,
      req.session.userEmail ?? req.session.userId ?? 'unknown-user',
      'Gemini-Scribe-Generate',
      false
    );

    console.log('[scribe] Gemini stream started');

    streamIterator = stream[Symbol.asyncIterator]();

    const generationStartMs = Date.now();
    let generatedMarkdown = '';
    let completedNormally = false;

    try {
      while (true) {
        if (clientDisconnected || !canWriteSse(res)) {
          break;
        }

        const { value, done } = await streamIterator.next();

        if (done) {
          completedNormally = true;
          break;
        }

        if (!value) {
          continue;
        }

        if (!canWriteSse(res)) {
          break;
        }

        generatedMarkdown += value;

        writeSseEvent(res, {
          type: 'chunk',
          text: value,
        });
      }
    } finally {
      if (streamIterator?.return) {
        await streamIterator.return();
      }

      streamIterator = null;
    }

    if (!clientDisconnected && canWriteSse(res)) {
      if (completedNormally && generatedMarkdown.trim()) {
        const resolvedTemplateId = prompt.systemFields.template_id;

        if (!resolvedTemplateId) {
          console.error('[scribe] output persistence skipped: resolved template_id missing');
        } else {
          const latencyMs = Date.now() - generationStartMs;

          try {
            console.log('[scribe] persistence started');

            const persistedOutputId = await persistScribeOutput({
              outputId,
              consultationId: parsed.data.consultationId,
              templateId: resolvedTemplateId,
              practiceId,
              patientId: normalizedPatientId,
              systemFields: prompt.systemFields,
              conditionalFields: prompt.conditionalFields,
              markdown: generatedMarkdown,
              latencyMs,
              promptTokens: null,
              completionTokens: null,
              costUsd: null,
            });

            console.log('[scribe] persistence succeeded');

            console.log('[scribe] persist succeeded', {
              requestedOutputId: outputId,
              persistedOutputId,
            });

            if (canWriteSse(res)) {
              const metaPayload = {
                type: 'meta',
                outputId: persistedOutputId,
              };

              writeSseEvent(res, metaPayload);

              console.log('[scribe] meta event written', {
                outputId: persistedOutputId,
                payloadShape: Object.keys(metaPayload),
              });
            }
          } catch (persistError) {
            console.error('[scribe] output persistence failed', {
              error: persistError instanceof Error ? persistError.message : String(persistError),
              requestedOutputId: outputId,
            });

            if (canWriteSse(res)) {
              writeSseEvent(res, {
                type: 'warning',
                message: 'Generated note streamed successfully, but persistence failed.',
              });
            }
          }
        }
      }

      console.log('[scribe] stream completed');

      writeSseEvent(res, {
        type: 'done',
      });

      console.log('[scribe] done event written');

      res.end();
    }
  } catch (error) {
    console.error('[scribe] generation failed', {
      error,
      stack: error instanceof Error ? error.stack : undefined,
    });

    if (canWriteSse(res)) {
      writeSseEvent(res, {
        type: 'error',
        error: 'Generation failed',
      });

      res.end();
    }
  }
});

// POST /api/scribe/:outputId/finalize
router.post('/:outputId/finalize', async (req: Request, res: Response) => {
  const isNonProd = process.env.NODE_ENV !== 'production';
  const outputId = typeof req.params.outputId === 'string' ? req.params.outputId.trim() : '';

  if (isNonProd) {
    console.log('[scribe] finalize route entered', {
      outputId,
      bodyKeys:
        req.body && typeof req.body === 'object' ? Object.keys(req.body as Record<string, unknown>) : [],
    });
  }

  if (!outputId || !isUuid(outputId)) {
    res.status(400).json({ error: 'outputId must be a valid UUID.' });
    return;
  }

  const parsed = validateFinalizeScribeRequest(req.body);

  if (!parsed.ok) {
    res.status(400).json({ error: parsed.message });
    return;
  }

  if (isNonProd) {
    console.log('[scribe] finalize body validated', {
      outputId,
      finalMarkdownLength: parsed.data.finalMarkdown.length,
      doctorEdited: parsed.data.doctorEdited,
    });
  }

  const resolvedPractice = await resolvePracticeContextForFinalize(req);

  if (!resolvedPractice.ok) {
    res.status(403).json({ error: 'Forbidden: authenticated practice context is missing.' });
    return;
  }

  if (isNonProd) {
    console.log('[scribe] finalize resolved practiceId', {
      outputId,
      practiceId: resolvedPractice.practiceId,
    });
  }

  try {
    const result = await finalizeScribeOutput(outputId, resolvedPractice.practiceId, parsed.data);

    res.status(200).json({
      ok: true,
      ...result,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Failed to finalize scribe output.';

    if (message === 'Scribe output not found.') {
      res.status(404).json({ error: message });
      return;
    }

    if (message === 'Forbidden: output belongs to another practice.') {
      res.status(403).json({ error: message });
      return;
    }

    if (
      message === 'Consultation not found for this scribe output.' ||
      message === 'Consultation exists but does not match this patient or practice.'
    ) {
      res.status(409).json({ error: message });
      return;
    }

    const dbg = serializePgErrorForDebug(error);
    console.error('[scribe] finalize failed', {
      outputId,
      resolvedPracticeId: resolvedPractice.practiceId,
      ...dbg,
    });

    if (isNonProd) {
      res.status(500).json({
        error: 'Failed to finalize scribe output.',
        debug: {
          message: dbg.message,
          code: dbg.code,
          detail: dbg.detail,
          constraint: dbg.constraint,
          table: dbg.table,
          column: dbg.column,
          stack: dbg.stack,
        },
      });
      return;
    }

    res.status(500).json({
      error: 'Failed to finalize scribe output.',
    });
  }
});

// GET /api/scribe/templates
router.get('/templates', async (req: Request, res: Response) => {
  try {
    const resolved = await resolvePracticeContextForTemplates(req);

    if (!resolved.ok) {
      res.status(403).json({ error: 'Forbidden: authenticated practice context is missing.' });
      return;
    }

    const practiceId = resolved.practiceId;

    const pool = getScribePool();

    // Query scribe_templates for this practice
    const templatesResult = await pool.query<{
      id: string;
      name: string;
      specialty: string | null;
      is_default: boolean;
      firebase_template_id: string | null;
      output_format: string | null;
    }>(
      `
        SELECT
          id::text,
          name,
          specialty,
          is_default,
          firebase_template_id,
          output_format
        FROM scribe_templates
        WHERE practice_id::text = $1
        ORDER BY is_default DESC, updated_at DESC
      `,
      [practiceId]
    );

    // For each template, check if it has a streamable style prompt
    const templates = await Promise.all(
      templatesResult.rows.map(async (template) => {
        const promptResult = await pool.query<{ has_prompt: boolean }>(
          `
            SELECT 
              (system_prompt_md IS NOT NULL AND system_prompt_md != '')::boolean as has_prompt
            FROM scribe_style_prompts
            WHERE template_id::text = $1
            ORDER BY 
              CASE WHEN is_active = true THEN 0 ELSE 1 END,
              version DESC NULLS LAST,
              created_at DESC
            LIMIT 1
          `,
          [template.id]
        );

        const hasPrompt = promptResult.rows[0]?.has_prompt ?? false;

        return {
          id: template.id,
          name: template.name,
          specialty: template.specialty,
          is_default: template.is_default,
          firebase_template_id: template.firebase_template_id,
          output_format: template.output_format,
          is_streamable: hasPrompt,
        };
      })
    );

    res.status(200).json({ templates });
  } catch (error) {
    console.error('[scribe/templates] error', {
      error: error instanceof Error ? error.message : String(error),
    });

    res.status(500).json({
      error: 'Failed to load scribe templates.',
    });
  }
});

export default router;