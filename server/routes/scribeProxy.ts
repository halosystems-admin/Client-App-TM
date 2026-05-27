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
    if (value === undefined || value === null) continue;

    if (Array.isArray(value)) {
      headers[key] = value.join(', ');
      continue;
    }

    headers[key] = String(value);
  }

  if (req.headers.cookie) {
    headers.cookie = req.headers.cookie;
  }

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

router.all('*', (req: Request, res: Response) => {
  void proxyScribeRequest(req, res);
});

export default router;