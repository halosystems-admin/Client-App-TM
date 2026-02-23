import { Router, Request, Response } from 'express';
import { config } from '../config';
import { requireAuth } from '../middleware/requireAuth';

const router = Router();
router.use(requireAuth);
const NOTES_API = config.notesApiUrl?.replace(/\/$/, '');

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
  if (sendUserIdFromSession && req.session.userId) {
    body = { ...body, user_id: req.session.userId };
  }

  try {
    const proxyRes = await fetch(`${NOTES_API}${path}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });

    const contentType = proxyRes.headers.get('content-type') || '';
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
  proxyPost(req, res, '/generate_note', false);
});

export default router;
