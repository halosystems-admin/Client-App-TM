import { Router, Request, Response } from 'express';
import { config } from '../config';
import { requireAuth } from '../middleware/requireAuth';
import { getStoredHaloUserId } from '../services/userSettings';

const router = Router();
router.use(requireAuth);
const FALLBACK_NOTES_API = 'https://halo-functions-75316778879.africa-south1.run.app';
const NOTES_API = (config.notesApiUrl || FALLBACK_NOTES_API).replace(/\/$/, '');
const FALLBACK_TEMPLATE_USER_ID = config.haloUserId;

if (!NOTES_API) {
  console.warn('NOTES_API_URL not set; /api/notes proxy routes will 503.');
}

async function proxyPost(
  req: Request,
  res: Response,
  path: string,
  sendUserIdFromSession: boolean
): Promise<void> {
  if (!NOTES_API) {
    res.status(503).json({ error: 'Notes API not configured.' });
    return;
  }

  let body: Record<string, unknown> = req.body && typeof req.body === 'object' ? { ...req.body } : {};

  if (sendUserIdFromSession) {
    try {
      const token = req.session.accessToken;
      const fallbackId = req.session.userId || req.session.userEmail;

      if (token) {
        const sessionUserId = await getStoredHaloUserId(token, fallbackId);
        if (sessionUserId) {
          body = { ...body, user_id: sessionUserId };
        }
      } else if (fallbackId) {
        body = { ...body, user_id: fallbackId };
      } else {
        res.status(401).json({ error: 'Not authenticated for notes templates.' });
        return;
      }
    } catch (err) {
      console.error('Notes user mapping error:', err);
      const fallbackId = req.session.userId || req.session.userEmail;
      if (fallbackId) {
        body = { ...body, user_id: fallbackId };
      }
    }
  }

  try {
    const callNotesApi = async (payload: Record<string, unknown>) => {
      const response = await fetch(`${NOTES_API}${path}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });

      const contentType = response.headers.get('content-type') || '';
      return { response, contentType };
    };

    let outboundBody = body;
    let { response: proxyRes, contentType } = await callNotesApi(outboundBody);

    if (path === '/get_templates' && proxyRes.ok && contentType.includes('application/json')) {
      const data = await proxyRes.json();
      const isEmptyTemplatesPayload =
        data === null ||
        (typeof data === 'string' && data.trim().toLowerCase() === 'null') ||
        (typeof data === 'object' && data !== null && Object.keys(data as Record<string, unknown>).length === 0);

      if (isEmptyTemplatesPayload && FALLBACK_TEMPLATE_USER_ID && outboundBody.user_id !== FALLBACK_TEMPLATE_USER_ID) {
        outboundBody = { ...outboundBody, user_id: FALLBACK_TEMPLATE_USER_ID };
        const retried = await callNotesApi(outboundBody);
        proxyRes = retried.response;
        contentType = retried.contentType;
      } else {
        res.status(proxyRes.status).json(data);
        return;
      }
    }

    if (contentType.includes('application/json')) {
      const data = await proxyRes.json();
      res.status(proxyRes.status).json(data);
    } else if (proxyRes.ok && (contentType.includes('octet-stream') || contentType.includes('wordprocessing'))) {
      const blob = await proxyRes.arrayBuffer();
      const disposition = proxyRes.headers.get('content-disposition') || 'attachment; filename=note.docx';
      res.setHeader('Content-Type', contentType);
      res.setHeader('Content-Disposition', disposition);
      res.status(200).send(Buffer.from(blob));
    } else {
      const text = await proxyRes.text();
      res.status(proxyRes.status).send(text);
    }
  } catch (err) {
    console.error('Notes proxy error:', err);
    res.status(502).json({ error: 'Notes service unavailable.' });
  }
}

/** POST /api/notes/get_templates — body may include user_id; session user_id is used if not sent */
router.post('/get_templates', (req: Request, res: Response) => {
  proxyPost(req, res, '/get_templates', true);
});

/** POST /api/notes/generate_note — forwards body to FastAPI */
router.post('/generate_note', (req: Request, res: Response) => {
  proxyPost(req, res, '/generate_note', true);
});

export default router;
