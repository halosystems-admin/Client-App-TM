import { Router, Request, Response } from 'express';
import crypto from 'crypto';
import { config } from '../config';
import { getScribePool } from '../services/scribe/db';
import {
  APPROVED_PRODUCTION_FAKE_E2E_PRACTICE_ID,
  PRODUCTION_FAKE_E2E_SESSION_HEADER,
  PRODUCTION_FAKE_E2E_TOKEN_HEADER,
  evaluateProductionFakeE2eSessionAllow,
  rehearsalSessionIdentity,
} from '../lib/productionFakeE2eSession';

const router = Router();

// Canonical callback (must match Google Cloud "Authorized redirect URIs").
const PRODUCTION_CALLBACK = 'https://api.halo.africa/api/auth/callback';
const DEV_CALLBACK = 'http://localhost:3000/api/auth/callback';

// Normalize env typos like .../api/auth/callback/google → .../api/auth/callback
function canonicalGoogleCallbackBase(): string {
  if (config.isProduction || process.env.NODE_ENV === 'production') {
    const raw = (config.googleCallbackUrl || PRODUCTION_CALLBACK).replace(/\/+$/, '');
    return raw.replace(/\/callback\/google\/?$/i, '/callback');
  }
  return DEV_CALLBACK;
}

/** redirect_uri for authorize + token exchange (must match exactly for each flow). */
const getRedirectUri = (req: Request): string => {
  const base = canonicalGoogleCallbackBase();
  // Legacy: Google may still redirect to /callback/google if that URI was authorized before.
  if (req.baseUrl === '/api/auth' && req.path === '/callback/google') {
    return `${base}/google`;
  }
  return base;
};

function startGoogleOAuth(
  req: Request,
  res: Response,
  onReady: (authUrl: string) => void
): void {
  if (!config.googleClientId) {
    res.status(500).json({ error: 'Server misconfigured: missing Google Client ID.' });
    return;
  }

  const scopes = [
    'https://www.googleapis.com/auth/drive',
    'https://www.googleapis.com/auth/calendar.events',
    'openid',
    'email',
    'profile',
  ].join(' ');

  const redirectUri = getRedirectUri(req);

  const state = crypto.randomBytes(16).toString('hex');
  (req.session as any).oauthState = state;

  const authUrl =
    'https://accounts.google.com/o/oauth2/v2/auth?' +
    `client_id=${config.googleClientId}` +
    `&redirect_uri=${encodeURIComponent(redirectUri)}` +
    `&response_type=code` +
    `&scope=${encodeURIComponent(scopes)}` +
    `&access_type=offline` +
    `&state=${encodeURIComponent(state)}`;

  req.session.save((err) => {
    if (err) {
      console.error('Session save error (google OAuth):', err);
      res.status(500).json({ error: 'Could not start sign-in. Please try again.' });
      return;
    }
    onReady(authUrl);
  });
}

router.get('/login-url', (req: Request, res: Response) => {
  startGoogleOAuth(req, res, (authUrl) => res.json({ url: authUrl }));
});

/** Browser redirect entry (mounted at /auth); callback stays at /api/auth/callback. */
export const authBrowserEntryRouter = Router();
authBrowserEntryRouter.get('/google', (req: Request, res: Response) => {
  startGoogleOAuth(req, res, (authUrl) => res.redirect(authUrl));
});

async function handleGoogleOAuthCallback(req: Request, res: Response): Promise<void> {
  const code = req.query.code as string | undefined;

  const state = req.query.state as string | undefined;
  const sessionState = (req.session as any).oauthState as string | undefined;

  if (!state || typeof state !== 'string' || !sessionState || state !== sessionState) {
    res.status(400).json({ error: 'Invalid OAuth state.' });
    return;
  }

  (req.session as any).oauthState = undefined;

  if (!code || typeof code !== 'string') {
    res.status(400).json({ error: 'Missing or invalid authorization code.' });
    return;
  }

  try {
    const redirectUri = getRedirectUri(req);

    const tokenResponse = await fetch('https://oauth2.googleapis.com/token', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        code,
        client_id: config.googleClientId,
        client_secret: config.googleClientSecret,
        redirect_uri: redirectUri,
        grant_type: 'authorization_code',
      }),
    });

    const tokens = (await tokenResponse.json()) as {
      access_token?: string;
      refresh_token?: string;
      expires_in?: number;
      error?: string;
      error_description?: string;
    };

    if (tokens.error || !tokens.access_token) {
      console.error('Token exchange error:', tokens);
      res.status(400).json({ error: tokens.error_description || 'Token exchange failed.' });
      return;
    }

    // Store tokens in session
    req.session.accessToken = tokens.access_token;
    if (tokens.refresh_token) {
      req.session.refreshToken = tokens.refresh_token;
    }
    req.session.tokenExpiry = Date.now() + (tokens.expires_in ?? 3600) * 1000;

    // Fetch user info
    const userInfoRes = await fetch('https://www.googleapis.com/oauth2/v2/userinfo', {
      headers: { Authorization: `Bearer ${tokens.access_token}` },
    });
    const user = (await userInfoRes.json()) as { email?: string; id?: string };
    req.session.userEmail = user.email;
    // Stable user_id for Notes API / Firebase: prefer id, fallback to email
    req.session.userId = user.id || user.email || '';

    console.log(`User signed in: ${user.email}`);

    // Fallback to '/' just in case config.clientUrl is empty in Heroku
    res.redirect(config.clientUrl || '/');
  } catch (err) {
    console.error('Auth callback error:', err);
    res.status(500).json({ error: 'Authentication failed. Please try again.' });
  }
}

router.get('/callback', handleGoogleOAuthCallback);
router.get('/callback/google', handleGoogleOAuthCallback);

router.get('/me', (req: Request, res: Response) => {
  if (req.session.accessToken) {
    const googleUserId = req.session.userId || '';
    const appUserId = req.session.userId || req.session.userEmail || '';
    void (async () => {
      let practiceId: string | undefined;
      try {
        const pool = getScribePool();

        const defaultResult = await pool.query<{ practice_id: string }>(
          `
            SELECT practice_id::text AS practice_id
            FROM scribe_templates
            WHERE is_default = true
            ORDER BY updated_at DESC
            LIMIT 1
          `
        );

        const defaultPracticeId = defaultResult.rows[0]?.practice_id?.trim();
        if (defaultPracticeId) {
          practiceId = defaultPracticeId;
        } else {
          const distinctResult = await pool.query<{ practice_id: string }>(
            `
              SELECT DISTINCT practice_id::text AS practice_id
              FROM scribe_templates
              WHERE practice_id IS NOT NULL
              LIMIT 2
            `
          );

          if (distinctResult.rows.length === 1) {
            const onlyPracticeId = distinctResult.rows[0]?.practice_id?.trim();
            if (onlyPracticeId) {
              practiceId = onlyPracticeId;
            }
          }
        }
      } catch {
        // Best-effort only; auth/me remains available even if scribe DB is not ready.
      }

      if (!practiceId) {
        const configuredPracticeId = config.scribePracticeId.trim();
        if (configuredPracticeId) {
          practiceId = configuredPracticeId;
        }
      }

      if (practiceId) {
        req.session.practiceId = practiceId;
        req.session.practice_id = practiceId;
      } else {
        req.session.practiceId = undefined;
        req.session.practice_id = undefined;
      }

      res.json({
        signedIn: true,
        email: req.session.userEmail,
        googleUserId,
        appUserId,
        practiceId,
        // Backward-compatible alias consumed by existing clients.
        user_id: appUserId,
        notesApiAvailable: !!config.notesApiUrl,
      });
      console.log('[auth/me] response built', {
        hasPracticeId: Boolean(practiceId),
        practiceId,
      });
    })();
  } else {
    res.json({ signedIn: false });
  }
});

router.post('/logout', (req: Request, res: Response) => {
  req.session.destroy(() => {
    res.json({ success: true });
  });
});

const LOCAL_E2E_DEFAULT_PRACTICE_ID = '44444444-4444-4444-4444-444444444444';

function isPostgresUuid(value: string): boolean {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(value.trim());
}

/**
 * BC-6E production fake-patient E2E only — disabled unless Ops enables server gates.
 * Not a login bypass; fixed pilot practice; requires session token header match.
 */
router.post('/production-fake-e2e/verify-session', (req: Request, res: Response) => {
  const isProductionRuntime = process.env.NODE_ENV === 'production' || config.isProduction;
  if (!isProductionRuntime) {
    res.status(404).json({ error: 'Not found.' });
    return;
  }

  const body = req.body && typeof req.body === 'object' ? (req.body as Record<string, unknown>) : {};
  const practiceId =
    typeof body.practiceId === 'string' && body.practiceId.trim() ? body.practiceId.trim() : '';

  const gateErrors = evaluateProductionFakeE2eSessionAllow(
    process.env,
    {
      practiceId,
      sessionHeader: String(req.get(PRODUCTION_FAKE_E2E_SESSION_HEADER) || '').trim(),
      tokenHeader: String(req.get(PRODUCTION_FAKE_E2E_TOKEN_HEADER) || '').trim(),
    },
    { isProductionRuntime: true }
  );

  if (gateErrors.length > 0) {
    console.warn('[auth/production-fake-e2e/verify-session] refused', {
      reasonCount: gateErrors.length,
    });
    res.status(403).json({ error: 'Forbidden.' });
    return;
  }

  const identity = rehearsalSessionIdentity(APPROVED_PRODUCTION_FAKE_E2E_PRACTICE_ID);
  req.session.accessToken = 'production-fake-e2e-access-token';
  req.session.userEmail = identity.email;
  req.session.userId = identity.userId;
  req.session.practiceId = identity.practiceId;
  req.session.practice_id = identity.practiceId;
  req.session.tokenExpiry = Date.now() + 60 * 60 * 1000;

  req.session.save((err) => {
    if (err) {
      console.error('[auth/production-fake-e2e/verify-session] session save failed', err);
      res.status(500).json({ error: 'Failed to save verification session.' });
      return;
    }
    res.status(200).json({ ok: true, practiceId: identity.practiceId });
  });
});

/** Local/staging E2E only: establish session (HALO_VERIFY_SCRIBE_E2E=1). Returns 404 in production. */
router.post('/dev/verify-session', (req: Request, res: Response) => {
  if (process.env.NODE_ENV === 'production' || config.isProduction) {
    res.status(404).json({ error: 'Not found.' });
    return;
  }

  if (process.env.HALO_VERIFY_SCRIBE_E2E !== '1') {
    res.status(403).json({ error: 'Forbidden.' });
    return;
  }

  const body = req.body && typeof req.body === 'object' ? (req.body as Record<string, unknown>) : {};
  const rawPracticeId =
    typeof body.practiceId === 'string' && body.practiceId.trim()
      ? body.practiceId.trim()
      : LOCAL_E2E_DEFAULT_PRACTICE_ID;

  if (!isPostgresUuid(rawPracticeId)) {
    res.status(400).json({ error: 'practiceId must be a valid Postgres UUID.' });
    return;
  }

  const email =
    typeof body.email === 'string' && body.email.trim()
      ? body.email.trim()
      : 'local-scribe-e2e@halo.local';
  const userId =
    typeof body.userId === 'string' && body.userId.trim() ? body.userId.trim() : 'local-scribe-e2e';

  req.session.accessToken = 'local-e2e-access-token';
  req.session.userEmail = email;
  req.session.userId = userId;
  req.session.practiceId = rawPracticeId;
  req.session.practice_id = rawPracticeId;
  req.session.tokenExpiry = Date.now() + 60 * 60 * 1000;

  req.session.save((err) => {
    if (err) {
      console.error('[auth/dev/verify-session] session save failed', err);
      res.status(500).json({ error: 'Failed to save verification session.' });
      return;
    }
    res.status(200).json({ ok: true, practiceId: rawPracticeId });
  });
});

export default router;
