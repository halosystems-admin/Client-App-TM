import express, { Request, Response } from 'express';
import { createHash, randomUUID } from 'crypto';
import {
  buildScribePrompt,
  GenerateScribeRequest,
  resolveTemplateStreamabilityStatus,
} from '../services/scribe/buildPrompt';
import { generateTextStream } from '../services/gemini';
import { getScribePool } from '../services/scribe/db';
import { persistScribeOutput, ScribePersistenceError } from '../services/scribe/persistOutput';
import {
  finalizeScribeOutput,
  validateFinalizeScribeRequest,
  serializePgErrorForDebug,
} from '../services/scribe/finalizeOutput';
import {
  getTemplateRequirements,
  validateTranscriptAgainstRequirements,
  parseValidationRuleJson,
  type TemplateRequirementRecord,
} from '../services/scribe/templateRequirements';
import { listFinalizedScribeNotesForPatient } from '../services/scribe/listFinalizedNotes';
import { resolveScribePracticeContext } from '../services/scribe/sessionPracticeContext';

const router = express.Router();

function canWriteSse(res: Response): boolean {
  return !res.writableEnded && !res.destroyed;
}

function writeSseEvent(res: Response, payload: Record<string, unknown>): void {
  res.write(`data: ${JSON.stringify(payload)}\n\n`);
}

type ScribeRehearsalMode = 'none' | 'mock' | 'real';

function hasRehearsalRequestHeader(req: Request): boolean {
  const header = req.headers['x-halo-scribe-rehearsal'];
  const headerValue = Array.isArray(header) ? header[0] : header;
  return String(headerValue || '').trim() === '1';
}

/** Local/dev rehearsal only. Mock and real modes are mutually exclusive. */
function getScribeRehearsalMode(req: Request): ScribeRehearsalMode {
  if (process.env.NODE_ENV === 'production') {
    return 'none';
  }
  if (process.env.HALO_SCRIBE_ACTIVATION_REHEARSAL !== '1') {
    return 'none';
  }
  if (!hasRehearsalRequestHeader(req)) {
    return 'none';
  }

  const mockEnabled = process.env.HALO_SCRIBE_MOCK_LLM === '1';
  const realEnabled = process.env.HALO_SCRIBE_ALLOW_REAL_LLM === '1';

  if (mockEnabled && realEnabled) {
    console.warn('[scribe] rehearsal mode disabled: mock and real LLM flags are both set');
    return 'none';
  }
  if (mockEnabled) {
    return 'mock';
  }
  if (realEnabled) {
    return 'real';
  }
  return 'none';
}

async function* createRehearsalMockTextStream(): AsyncGenerator<string> {
  const chunks = [
    '## Rehearsal Mock Note\n\n',
    '- Status: REHEARSAL ONLY. No PHI.\n',
    '- Purpose: mock SSE generation rehearsal.\n',
  ];
  for (const chunk of chunks) {
    yield chunk;
  }
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

function isUuid(value: string): boolean {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(
    value
  );
}

/** Postgres UUID text form (includes IDs that fail strict RFC variant checks, e.g. local dev dummy practice). */
function isPostgresUuid(value: string): boolean {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(value.trim());
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

// GET /api/scribe/patients/:patientId/finalized-notes
router.get('/patients/:patientId/finalized-notes', async (req: Request, res: Response) => {
  const rawPatientId = typeof req.params.patientId === 'string' ? req.params.patientId.trim() : '';
  if (!rawPatientId) {
    res.status(400).json({ error: 'patientId is required.' });
    return;
  }

  try {
    const resolved = await resolveScribePracticeContext(req, { allowQueryPracticeId: true });
    if (!resolved) {
      res.status(403).json({ error: 'Forbidden: authenticated practice context is missing.' });
      return;
    }

    const patientId = normalizePatientId(rawPatientId);
    const notes = await listFinalizedScribeNotesForPatient(resolved.practiceId, patientId);

    res.status(200).json({ notes });
  } catch (error) {
    console.error('[scribe/finalized-notes] error', {
      error: error instanceof Error ? error.message : String(error),
    });
    res.status(500).json({ error: 'Failed to load finalized Scribe notes.' });
  }
});

// POST /api/scribe/generate
router.post('/generate', async (req: Request, res: Response) => {
  console.log('[scribe] request received');

  const parsed = validateGenerateScribeBody(req.body);

  if (!parsed.ok) {
    res.status(400).json({ error: parsed.message });
    return;
  }

  console.log('[scribe] request validated');

  const resolvedPractice = await resolveScribePracticeContext(req, {
    allowBodyPracticeId: parsed.data.practiceId,
  });

  if (!resolvedPractice) {
    res.status(403).json({ error: 'Forbidden: authenticated practice context is missing.' });
    return;
  }

  const practiceId = resolvedPractice.practiceId;
  const identity = resolvedPractice.identity;

  console.log('[scribe/generate] resolved context', {
    email: req.session?.userEmail ?? identity?.email ?? null,
    userId: identity?.userId ?? req.session?.scribeUserId ?? null,
    practiceId,
    templateId: parsed.data.templateId,
  });

  const normalizedPatientId = normalizePatientId(parsed.data.patientId);
  const pool = getScribePool();

  let extractedTemplateVariables: Record<string, string> | undefined;
  let requirementRows: TemplateRequirementRecord[] = [];

  if (parsed.data.templateId !== 'test') {
    let resolvedRequirements: { resolvedTemplateId: string; requirements: TemplateRequirementRecord[] };
    try {
      resolvedRequirements = await getTemplateRequirements(pool, practiceId, parsed.data.templateId);
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      if (message.includes('No matching scribe template')) {
        res.status(404).json({ error: 'No matching scribe template found for this practice.' });
        return;
      }
      console.error('[scribe] template requirements load failed', { message });
      res.status(500).json({ error: 'Failed to load template requirements.' });
      return;
    }

    requirementRows = resolvedRequirements.requirements;

    if (requirementRows.length > 0) {
      const validation = validateTranscriptAgainstRequirements({
        transcript: parsed.data.rawTranscript,
        requirements: requirementRows,
      });

      console.log('[scribe] extracted_template_variables_json (MVP)', validation.detected);

      if (!validation.ok) {
        res.status(422).json({
          ok: false,
          status: 'missing_required_inputs',
          templateId: resolvedRequirements.resolvedTemplateId,
          missing: validation.missing,
          detected: validation.detected,
        });
        return;
      }

      if (Object.keys(validation.detected).length > 0) {
        extractedTemplateVariables = validation.detected;
      }
    }
  }

  // Mandatory SSE headers (only after pre-generation validation passes)
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

    const outputId = randomUUID();

    const prompt = await buildScribePrompt({
      ...parsed.data,
      practiceId,
      patientId: normalizedPatientId,
      extractedTemplateVariables,
    });

    console.log('[scribe] prompt build succeeded');

    console.log('[scribe] prompt assembled', {
      practiceScoped: Boolean(practiceId),
      systemLength: prompt.system.length,
      userLength: prompt.user.length,
      systemFieldCount: Object.keys(prompt.systemFields).length,
      conditionalFieldCount: Object.keys(prompt.conditionalFields).length,
    });

    const rehearsalMode = getScribeRehearsalMode(req);
    const rehearsalSkipPersist = rehearsalMode === 'mock' || rehearsalMode === 'real';

    const generationStartMs = Date.now();
    let firstTokenLatencyMs: number | null = null;

    if (rehearsalMode === 'mock') {
      console.log('[scribe] REHEARSAL MOCK stream started (no provider call)');
      streamIterator = createRehearsalMockTextStream()[Symbol.asyncIterator]();
    } else {
      if (process.env.NODE_ENV === 'staging') {
        const stagingLlmAllowed =
          process.env.HALO_SCRIBE_ALLOW_STAGING_LLM === '1' ||
          process.env.HALO_SCRIBE_STAGING_ALLOW_REAL_LLM === '1';
        if (!stagingLlmAllowed) {
          writeSseEvent(res, {
            type: 'error',
            message: 'Staging LLM generation is not approved on this server.',
          });
          res.end();
          return;
        }
      }

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

      if (rehearsalMode === 'real') {
        console.log('[scribe] REHEARSAL REAL LLM stream started (provider call, persistence skipped)');
      }

      const stream = generateTextStream(
        llmPrompt,
        req.session.userEmail ?? req.session.userId ?? 'unknown-user',
        'Gemini-Scribe-Generate',
        false
      );

      console.log('[scribe] Gemini stream started');

      streamIterator = stream[Symbol.asyncIterator]();
    }

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

        if (firstTokenLatencyMs === null) {
          firstTokenLatencyMs = Date.now() - generationStartMs;
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
        if (rehearsalSkipPersist) {
          const totalLatencyMs = Date.now() - generationStartMs;
          const rehearsalMeta: Record<string, unknown> = {
            type: 'rehearsal_meta',
            persisted: false,
            totalLatencyMs,
          };

          if (rehearsalMode === 'mock') {
            rehearsalMeta.mockLlm = true;
            rehearsalMeta.realLlm = false;
          } else {
            rehearsalMeta.realLlm = true;
            rehearsalMeta.mockLlm = false;
            if (firstTokenLatencyMs !== null) {
              rehearsalMeta.firstTokenLatencyMs = firstTokenLatencyMs;
            }
          }

          writeSseEvent(res, rehearsalMeta);

          console.log('[scribe] rehearsal meta event written (persistence skipped)', {
            rehearsalMode,
            totalLatencyMs,
            firstTokenLatencyMs,
            generatedMarkdownLength: generatedMarkdown.length,
          });
        } else {
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
                extractedTemplateVariables: extractedTemplateVariables ?? null,
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
              const pgDebug =
                persistError instanceof ScribePersistenceError
                  ? persistError.pgDebug
                  : serializePgErrorForDebug(persistError);

              console.error('[scribe] output persistence failed', {
                error: persistError instanceof Error ? persistError.message : String(persistError),
                requestedOutputId: outputId,
                pgCode: pgDebug.code,
                pgTable: pgDebug.table,
                pgConstraint: pgDebug.constraint,
              });

              if (canWriteSse(res)) {
                writeSseEvent(res, {
                  type: 'warning',
                  message: 'Generated note streamed successfully, but persistence failed.',
                  persistenceFailed: true,
                  ...(pgDebug.code ? { persistenceErrorCode: pgDebug.code } : {}),
                });
              }
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

  const resolvedPractice = await resolveScribePracticeContext(req);

  if (!resolvedPractice) {
    res.status(403).json({ error: 'Forbidden: authenticated practice context is missing.' });
    return;
  }

  console.log('[scribe] finalize resolved context', {
    outputId,
    practiceId: resolvedPractice.practiceId,
    userId: resolvedPractice.identity?.userId ?? req.session?.scribeUserId ?? null,
    email: req.session?.userEmail ?? resolvedPractice.identity?.email ?? null,
  });

  try {
    const skipQuery =
      typeof req.query.adSkipDocumentJobs === 'string' &&
      req.query.adSkipDocumentJobs.trim() === '1';
    const skipHeader = String(req.get('x-halo-scribe-ad-skip-document-jobs') || '').trim() === '1';

    const result = await finalizeScribeOutput(outputId, resolvedPractice.practiceId, parsed.data, {
      skipDocumentSyncJobs: skipQuery || skipHeader,
      requestHeaders: req.headers,
    });

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
    const resolved = await resolveScribePracticeContext(req, { allowQueryPracticeId: true });

    if (!resolved) {
      res.status(403).json({ error: 'Forbidden: authenticated practice context is missing.' });
      return;
    }

    const practiceId = resolved.practiceId;
    const identity = resolved.identity;

    const pool = getScribePool();

    // Query scribe_templates for this practice
    const templatesResult = await pool.query<{
      id: string;
      name: string;
      specialty: string | null;
      is_default: boolean;
      firebase_template_id: string | null;
      output_format: string | null;
      version: number | null;
    }>(
      `
        SELECT
          id::text,
          name,
          specialty,
          is_default,
          firebase_template_id,
          output_format,
          version
        FROM scribe_templates
        WHERE practice_id::text = $1
        ORDER BY is_default DESC, updated_at DESC
      `,
      [practiceId]
    );

    const templateIds = templatesResult.rows.map((row) => row.id);

    type ReqRow = {
      template_id: string;
      key: string;
      display_label: string;
      type: string;
      required: boolean;
      doctor_hint: string | null;
      example_phrase: string | null;
      field_order: number;
      validation_rule_json: unknown;
    };

    const reqsByTemplate = new Map<
      string,
      Array<{
        key: string;
        displayLabel: string;
        type: string;
        required: boolean;
        doctorHint: string | null;
        examplePhrase: string | null;
        fieldOrder: number;
        options?: string[];
        synonyms?: Record<string, string[]>;
      }>
    >();

    if (templateIds.length > 0) {
      const reqResult = await pool.query<ReqRow>(
        `
          SELECT
            template_id::text AS template_id,
            key,
            display_label,
            type,
            required,
            doctor_hint,
            example_phrase,
            field_order,
            validation_rule_json
          FROM scribe_template_requirements
          WHERE template_id = ANY($1::uuid[])
          ORDER BY template_id, field_order ASC NULLS LAST, created_at ASC
        `,
        [templateIds]
      );

      for (const row of reqResult.rows) {
        const list = reqsByTemplate.get(row.template_id) ?? [];
        const parsed = parseValidationRuleJson(row.validation_rule_json);
        list.push({
          key: row.key,
          displayLabel: row.display_label,
          type: row.type,
          required: row.required,
          doctorHint: row.doctor_hint,
          examplePhrase: row.example_phrase,
          fieldOrder: row.field_order,
          ...(parsed.options.length > 0 ? { options: parsed.options } : {}),
          ...(Object.keys(parsed.synonyms).length > 0 ? { synonyms: parsed.synonyms } : {}),
        });
        reqsByTemplate.set(row.template_id, list);
      }
    }

    // For each template, resolve streamability with the same active-prompt rules as generate.
    const templatesWithMeta = await Promise.all(
      templatesResult.rows.map(async (template) => {
        const outputFormat = (template.output_format || '').trim().toLowerCase();
        const { isStreamable } = await resolveTemplateStreamabilityStatus(pool, template.id);
        const markdownReady = outputFormat === 'markdown' && isStreamable;

        return {
          id: template.id,
          name: template.name,
          specialty: template.specialty,
          is_default: template.is_default,
          firebase_template_id: template.firebase_template_id,
          output_format: template.output_format,
          version: template.version,
          is_streamable: markdownReady,
          has_active_prompt: isStreamable,
          requirements: reqsByTemplate.get(template.id) ?? [],
        };
      })
    );

    const templates = templatesWithMeta.filter((t) => t.is_streamable);

    console.log('[scribe/templates] loaded', {
      email: req.session?.userEmail ?? identity?.email ?? null,
      userId: identity?.userId ?? req.session?.scribeUserId ?? null,
      practiceId,
      totalRows: templatesResult.rows.length,
      streamableCount: templates.length,
      templateIds: templates.map((t) => t.id),
    });

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