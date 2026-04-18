import { Router, Request, Response as ExpressResponse } from 'express';
import { config } from '../config';
import { requireAuth } from '../middleware/requireAuth';
import { getStoredHaloUserId } from '../services/userSettings';
import type {
  GenerateNoteMode,
  NotesGenerateNoteJsonResponse,
  NotesGetTemplatesResponse,
  TemplateSummary,
} from '../../shared/types';

const router = Router();
router.use(requireAuth);

const FALLBACK_NOTES_API = 'https://halo-functions-75316778879.africa-south1.run.app';
const NOTES_API = (config.notesApiUrl || FALLBACK_NOTES_API).replace(/\/$/, '');

if (!NOTES_API) {
  console.warn('NOTES_API_URL not set; /api/notes proxy routes will 503.');
}

type MappingSource = 'stored_settings' | 'missing';

interface MappingContext {
  appUserId: string;
  haloUserId: string | null;
  mappingSource: MappingSource;
}

function logProxyResult(ctx: MappingContext, endpoint: string, status: number): void {
  console.info('[notes-proxy]', {
    endpoint,
    status,
    appUserId: ctx.appUserId,
    haloUserId: ctx.haloUserId,
    mappingSource: ctx.mappingSource,
  });
}

function sanitizeErrorMessage(raw: string): string {
  if (!raw.trim()) return 'Request failed.';
  return raw.slice(0, 500);
}

function parseMaybeJson(text: string): unknown {
  try {
    return JSON.parse(text);
  } catch {
    return null;
  }
}

function normalizeTemplatesPayload(raw: unknown): TemplateSummary[] {
  const str = (v: unknown): string | undefined =>
    v === null || v === undefined ? undefined : String(v);

  const normalizeArray = (arr: unknown[]): TemplateSummary[] =>
    arr
      .map((item) => {
        const row = typeof item === 'object' && item !== null ? (item as Record<string, unknown>) : {};
        const idRaw = row.id;
        const id = typeof idRaw === 'string' ? idRaw.trim() : String(idRaw ?? '').trim();
        if (!id) return null;
        return {
          id,
          name: str(row.name ?? row.label),
          label: str(row.label ?? row.name),
          type: str(row.type),
        } as TemplateSummary;
      })
      .filter((item): item is TemplateSummary => Boolean(item));

  if (Array.isArray(raw)) return normalizeArray(raw);

  if (raw && typeof raw === 'object' && 'templates' in (raw as Record<string, unknown>)) {
    return normalizeTemplatesPayload((raw as { templates: unknown }).templates);
  }
  if (raw && typeof raw === 'object' && 'data' in (raw as Record<string, unknown>)) {
    return normalizeTemplatesPayload((raw as { data: unknown }).data);
  }
  if (raw && typeof raw === 'object' && 'items' in (raw as Record<string, unknown>)) {
    return normalizeTemplatesPayload((raw as { items: unknown }).items);
  }
  if (raw && typeof raw === 'object' && 'results' in (raw as Record<string, unknown>)) {
    return normalizeTemplatesPayload((raw as { results: unknown }).results);
  }

  if (raw && typeof raw === 'object') {
    return Object.entries(raw as Record<string, unknown>)
      .map(([id, value]) => {
        const row = typeof value === 'object' && value !== null ? (value as Record<string, unknown>) : {};
        const cleanId = id.trim();
        if (!cleanId) return null;
        return {
          id: cleanId,
          name: str(row.name ?? row.label) ?? cleanId,
          label: str(row.label ?? row.name) ?? cleanId,
          type: str(row.type),
        } as TemplateSummary;
      })
      .filter((item): item is TemplateSummary => Boolean(item));
  }

  return [];
}

function createTemplatesResponse(templates: TemplateSummary[], needsHaloSetup: boolean): NotesGetTemplatesResponse {
  return {
    templates,
    empty: templates.length === 0,
    needsHaloSetup,
  };
}

function mapGenerateNoteUpstreamStatus(status: number): 400 | 502 {
  if (status === 400 || status === 404) return 400;
  return 502;
}

function shouldTreatAsDocxResponse(returnType: GenerateNoteMode, contentType: string): boolean {
  return (
    returnType === 'docx' &&
    (contentType.includes('octet-stream') || contentType.includes('wordprocessing'))
  );
}

async function resolveMappingContext(req: Request): Promise<MappingContext> {
  const appUserId = (req.session.userId || req.session.userEmail || '').trim();
  const token = req.session.accessToken;
  if (!token) {
    return {
      appUserId,
      haloUserId: null,
      mappingSource: 'missing',
    };
  }

  // Intentionally no fallback to Google identity; only stored HALO mapping is accepted.
  const mapped = await getStoredHaloUserId(token);
  const haloUserId = typeof mapped === 'string' && mapped.trim() ? mapped.trim() : null;

  return {
    appUserId,
    haloUserId,
    mappingSource: haloUserId ? 'stored_settings' : 'missing',
  };
}

function sendNeedsSetup(res: ExpressResponse, status: 424 | 409, message: string): void {
  res.status(status).json({
    error: message,
    ...createTemplatesResponse([], true),
  } satisfies NotesGetTemplatesResponse & { error: string });
}

async function callNotesApi(path: string, payload: Record<string, unknown>): Promise<globalThis.Response> {
  return fetch(`${NOTES_API}${path}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  });
}

function validateGenerateNoteBody(
  rawBody: unknown
): { ok: true; templateId: string; text: string; returnType: GenerateNoteMode } | { ok: false; message: string } {
  const body = rawBody && typeof rawBody === 'object' ? (rawBody as Record<string, unknown>) : {};
  const templateId = typeof body.template_id === 'string' ? body.template_id.trim() : '';
  const text = typeof body.text === 'string' ? body.text.trim() : '';
  const returnTypeRaw = typeof body.return_type === 'string' ? body.return_type.trim().toLowerCase() : 'note';

  if (!templateId) {
    return { ok: false, message: 'template_id is required.' };
  }
  if (!text) {
    return { ok: false, message: 'text is required.' };
  }
  if (returnTypeRaw !== 'note' && returnTypeRaw !== 'docx') {
    return { ok: false, message: "return_type must be 'note' or 'docx'." };
  }

  return {
    ok: true,
    templateId,
    text,
    returnType: returnTypeRaw,
  };
}

async function handleGetTemplates(req: Request, res: ExpressResponse): Promise<void> {
  if (!NOTES_API) {
    res.status(503).json({
      error: 'Notes API not configured.',
      ...createTemplatesResponse([], false),
    } satisfies NotesGetTemplatesResponse & { error: string });
    return;
  }

  const mapping = await resolveMappingContext(req);
  if (!mapping.haloUserId) {
    logProxyResult(mapping, '/get_templates', 424);
    sendNeedsSetup(res, 424, 'HALO user mapping is required. Configure haloUserId in settings.');
    return;
  }

  // Ignore all client-sent keys for this endpoint to avoid authoritative user input from the client.
  const clientBody = req.body && typeof req.body === 'object' ? (req.body as Record<string, unknown>) : null;
  if (clientBody && Object.keys(clientBody).length > 0) {
    console.info('[notes-proxy]', {
      endpoint: '/get_templates',
      appUserId: mapping.appUserId,
      ignoredClientBodyKeys: Object.keys(clientBody),
    });
  }

  try {
    const proxyRes = await callNotesApi('/get_templates', { user_id: mapping.haloUserId });
    const contentType = proxyRes.headers.get('content-type') || '';

    if (!proxyRes.ok) {
      const errorText = await proxyRes.text();
      logProxyResult(mapping, '/get_templates', 502);
      res.status(502).json({
        error: sanitizeErrorMessage(errorText) || 'Templates service unavailable.',
        ...createTemplatesResponse([], false),
      } satisfies NotesGetTemplatesResponse & { error: string });
      return;
    }

    const payload = contentType.includes('application/json')
      ? await proxyRes.json()
      : parseMaybeJson(await proxyRes.text());
    const templates = normalizeTemplatesPayload(payload);
    const result: NotesGetTemplatesResponse = createTemplatesResponse(templates, false);

    logProxyResult(mapping, '/get_templates', 200);
    res.status(200).json(result);
  } catch (err) {
    console.error('Notes get_templates proxy error:', err);
    logProxyResult(mapping, '/get_templates', 502);
    res.status(502).json({
      error: 'Notes service unavailable.',
      ...createTemplatesResponse([], false),
    } satisfies NotesGetTemplatesResponse & { error: string });
  }
}

async function handleGenerateNote(req: Request, res: ExpressResponse): Promise<void> {
  if (!NOTES_API) {
    res.status(503).json({ error: 'Notes API not configured.' });
    return;
  }

  const parsed = validateGenerateNoteBody(req.body);
  if (!parsed.ok) {
    const appUserId = (req.session.userId || req.session.userEmail || '').trim();
    logProxyResult({ appUserId, haloUserId: null, mappingSource: 'missing' }, '/generate_note', 400);
    res.status(400).json({ error: parsed.message });
    return;
  }

  const mapping = await resolveMappingContext(req);
  if (!mapping.haloUserId) {
    logProxyResult(mapping, '/generate_note', 424);
    res.status(424).json({
      error: 'HALO user mapping is required. Configure haloUserId in settings.',
      needsHaloSetup: true,
    });
    return;
  }

  const clientBody = req.body && typeof req.body === 'object' ? (req.body as Record<string, unknown>) : null;
  if (clientBody && 'user_id' in clientBody) {
    console.info('[notes-proxy]', {
      endpoint: '/generate_note',
      appUserId: mapping.appUserId,
      ignoredClientBodyKeys: ['user_id'],
    });
  }

  try {
    const proxyRes = await callNotesApi('/generate_note', {
      user_id: mapping.haloUserId,
      template_id: parsed.templateId,
      text: parsed.text,
      return_type: parsed.returnType,
    });

    const contentType = proxyRes.headers.get('content-type') || '';

    if (!proxyRes.ok) {
      const errorText = await proxyRes.text();
      const parsedError = parseMaybeJson(errorText) as { detail?: string; error?: string } | null;
      const upstreamMessage =
        (parsedError?.detail && String(parsedError.detail)) ||
        (parsedError?.error && String(parsedError.error)) ||
        sanitizeErrorMessage(errorText);

      const mappedStatus = mapGenerateNoteUpstreamStatus(proxyRes.status);
      logProxyResult(mapping, '/generate_note', mappedStatus);
      if (mappedStatus === 400) {
        res.status(400).json({ error: upstreamMessage || 'Invalid template_id or request payload.' });
        return;
      }

      res.status(502).json({ error: upstreamMessage || 'Notes service unavailable.' });
      return;
    }

    if (shouldTreatAsDocxResponse(parsed.returnType, contentType)) {
      const blob = await proxyRes.arrayBuffer();
      const disposition = proxyRes.headers.get('content-disposition') || 'attachment; filename=note.docx';
      res.setHeader('Content-Type', contentType || 'application/vnd.openxmlformats-officedocument.wordprocessingml.document');
      res.setHeader('Content-Disposition', disposition);
      logProxyResult(mapping, '/generate_note', 200);
      res.status(200).send(Buffer.from(blob));
      return;
    }

    const notePayload = contentType.includes('application/json')
      ? await proxyRes.json()
      : parseMaybeJson(await proxyRes.text());
    const result: NotesGenerateNoteJsonResponse = {
      mode: 'note',
      note: notePayload,
    };

    logProxyResult(mapping, '/generate_note', 200);
    res.status(200).json(result);
  } catch (err) {
    console.error('Notes generate_note proxy error:', err);
    logProxyResult(mapping, '/generate_note', 502);
    res.status(502).json({ error: 'Notes service unavailable.' });
  }
}

/** POST /api/notes/get_templates — body is ignored for identity; user_id resolved server-side. */
router.post('/get_templates', (req: Request, res: ExpressResponse) => {
  handleGetTemplates(req, res);
});

/** POST /api/notes/generate_note — validates payload and resolves user_id server-side. */
router.post('/generate_note', (req: Request, res: ExpressResponse) => {
  handleGenerateNote(req, res);
});

export const __test__notesProxy = {
  normalizeTemplatesPayload,
  createTemplatesResponse,
  validateGenerateNoteBody,
  mapGenerateNoteUpstreamStatus,
  shouldTreatAsDocxResponse,
};

export default router;