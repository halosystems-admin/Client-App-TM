import { Router, Request, Response } from 'express';
import { Readable } from 'stream';
import { pipeline } from 'stream/promises';
import { config } from '../config';
import { requireAuth } from '../middleware/requireAuth';

const router = Router();
router.use(requireAuth);

const HOP_BY_HOP_HEADERS = new Set([
  'connection',
  'keep-alive',
  'proxy-authenticate',
  'proxy-authorization',
  'te',
  'trailer',
  'transfer-encoding',
  'upgrade',
  'content-length',
  'host',
]);

const INTERNAL_HEADER_PREFIX = 'x-halo-';
const CANONICAL_UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

type TrustedScribeIdentity = {
  userId: string;
  practiceId: string;
  doctorId: string;
  userEmail: string;
};

function trimString(value: unknown): string {
  return typeof value === 'string' ? value.trim() : '';
}

function isCanonicalUuid(value: string): boolean {
  return CANONICAL_UUID_PATTERN.test(value.trim());
}

function getInternalServiceSecret(): string {
  return trimString(process.env.SCRIBE_INTERNAL_SERVICE_SECRET);
}

function resolveTrustedScribeIdentity(req: Request): TrustedScribeIdentity | null {
  const session = req.session as {
    scribeUserId?: string;
    practiceId?: string;
    userEmail?: string;
    userId?: string;
  };

  const scribeUserId = trimString(session.scribeUserId);
  const practiceId = trimString(session.practiceId);
  const userEmail = trimString(session.userEmail);
  const fallbackUserId = trimString(session.userId);

  if (!scribeUserId || !practiceId || !userEmail) {
    return null;
  }

  const userId = scribeUserId || (isCanonicalUuid(fallbackUserId) ? fallbackUserId : '');
  const doctorId = scribeUserId;

  if (!userId || !doctorId) {
    return null;
  }

  return {
    userId,
    practiceId,
    doctorId,
    userEmail,
  };
}

function getScribeServiceBaseUrl(): string {
  return (config.scribeServiceUrl || '').trim().replace(/\/$/, '');
}

function buildUpstreamUrl(req: Request): string | null {
  const base = getScribeServiceBaseUrl();
  if (!base) return null;
  return new URL(req.originalUrl, `${base}/`).toString();
}

function buildForwardHeaders(req: Request): Record<string, string> {
  const headers: Record<string, string> = {};

  for (const [key, value] of Object.entries(req.headers)) {
    const normalizedKey = key.toLowerCase();
    if (HOP_BY_HOP_HEADERS.has(normalizedKey)) continue;
    if (normalizedKey.startsWith(INTERNAL_HEADER_PREFIX)) continue;
    if (value === undefined || value === null) continue;

    if (Array.isArray(value)) {
      headers[key] = value.join(', ');
      continue;
    }

    headers[key] = String(value);
  }

  const identity = resolveTrustedScribeIdentity(req);
  if (!identity) {
    return headers;
  }

  const internalSecret = getInternalServiceSecret();
  if (internalSecret) {
    headers['x-halo-internal-secret'] = internalSecret;
  }
  headers['x-halo-user-id'] = identity.userId;
  headers['x-halo-practice-id'] = identity.practiceId;
  headers['x-halo-doctor-id'] = identity.doctorId;
  headers['x-halo-user-email'] = identity.userEmail;

  return headers;
}

function copyResponseHeaders(upstreamHeaders: Headers, res: Response): void {
  for (const [key, value] of upstreamHeaders.entries()) {
    const normalizedKey = key.toLowerCase();
    if (HOP_BY_HOP_HEADERS.has(normalizedKey)) continue;
    res.setHeader(key, value);
  }
}

async function proxyScribeRequest(req: Request, res: Response): Promise<void> {
  const upstreamUrl = buildUpstreamUrl(req);
  if (!upstreamUrl) {
    res.status(503).json({ error: 'Scribe service is not configured.' });
    return;
  }

  if ((process.env.NODE_ENV === 'production' || config.isProduction) && !getInternalServiceSecret()) {
    res.status(500).json({ error: 'Scribe service is not configured.' });
    return;
  }

  const identity = resolveTrustedScribeIdentity(req);
  if (!identity) {
    res.status(403).json({ error: 'Forbidden: Scribe session is missing user or practice identity.' });
    return;
  }

  try {
    const upstreamResponse = await fetch(upstreamUrl, {
      method: req.method,
      headers: buildForwardHeaders(req),
      body: req.method === 'GET' || req.method === 'HEAD' ? undefined : JSON.stringify(req.body ?? {}),
    });

    res.status(upstreamResponse.status);
    copyResponseHeaders(upstreamResponse.headers, res);

    if (!upstreamResponse.body) {
      res.end();
      return;
    }

    res.flushHeaders?.();
    await pipeline(Readable.fromWeb(upstreamResponse.body as unknown as ReadableStream<Uint8Array>), res);
  } catch (error) {
    console.error('[scribe-proxy] upstream request failed', {
      path: req.originalUrl,
      message: error instanceof Error ? error.message : String(error),
    });
    if (!res.headersSent) {
      res.status(502).json({ error: 'Scribe service unavailable.' });
      return;
    }
    if (!res.writableEnded) {
      res.end();
    }
  }
}

router.get('/templates', (req: Request, res: Response) => {
  void proxyScribeRequest(req, res);
});

router.get('/patients/:patientId/finalized-notes', (req: Request, res: Response) => {
  void proxyScribeRequest(req, res);
});

router.post('/generate', (req: Request, res: Response) => {
  void proxyScribeRequest(req, res);
});

router.post('/:outputId/finalize', (req: Request, res: Response) => {
  void proxyScribeRequest(req, res);
});

export default router;