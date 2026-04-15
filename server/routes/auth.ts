import { Router, Request, Response } from 'express';
import crypto from 'crypto';
import { config } from '../config';

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
    res.json({
      signedIn: true,
      email: req.session.userEmail,
      user_id: req.session.userId || req.session.userEmail || '',
      notesApiAvailable: !!config.notesApiUrl,
    });
  } else {
    res.json({ signedIn: false });
  }
});

router.post('/logout', (req: Request, res: Response) => {
  req.session.destroy(() => {
    res.json({ success: true });
  });
});

export default router;