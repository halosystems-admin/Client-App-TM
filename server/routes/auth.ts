import { Router, Request, Response } from 'express';
import crypto from 'crypto';
import { config } from '../config';

const router = Router();

const getRedirectUri = (): string => {
  if (config.isProduction) {
    return `${config.productionUrl}/api/auth/callback`;
  }
  return 'http://localhost:3000/api/auth/callback';
};

router.get('/login-url', (req: Request, res: Response) => {
  if (!config.googleClientId) {
    res.status(500).json({ error: 'Server misconfigured: missing Google Client ID.' });
    return;
  }

  const scopes = [
    'https://www.googleapis.com/auth/drive',
    'https://www.googleapis.com/auth/calendar',
    'openid',
    'email',
    'profile',
  ].join(' ');

  const redirectUri = getRedirectUri();

  const state = crypto.randomBytes(16).toString('hex');
  (req.session as any).oauthState = state;

  const url =
    'https://accounts.google.com/o/oauth2/v2/auth?' +
    `client_id=${config.googleClientId}` +
    `&redirect_uri=${encodeURIComponent(redirectUri)}` +
    `&response_type=code` +
    `&scope=${encodeURIComponent(scopes)}` +
    `&access_type=offline` +
    `&prompt=consent` +
    `&state=${encodeURIComponent(state)}`;

  // Persist session before sending URL so callback can read oauthState
  req.session.save((err) => {
    if (err) {
      console.error('Session save error (login-url):', err);
      res.status(500).json({ error: 'Could not start sign-in. Please try again.' });
      return;
    }
    res.json({ url });
  });
});

router.get('/callback', async (req: Request, res: Response) => {
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
    const redirectUri = getRedirectUri();

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

    res.redirect(config.clientUrl);
  } catch (err) {
    console.error('Auth callback error:', err);
    res.status(500).json({ error: 'Authentication failed. Please try again.' });
  }
});

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
