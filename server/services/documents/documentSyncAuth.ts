import { config } from '../../config';

/**
 * OAuth access token for headless document-sync / Drive uploads.
 * Set DOCUMENT_SYNC_GOOGLE_REFRESH_TOKEN in server env (service or delegated user).
 */
export async function getDocumentSyncAccessToken(): Promise<string | null> {
  const refreshToken = process.env.DOCUMENT_SYNC_GOOGLE_REFRESH_TOKEN?.trim();
  if (!refreshToken) {
    return null;
  }

  const res = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      client_id: config.googleClientId,
      client_secret: config.googleClientSecret,
      refresh_token: refreshToken,
      grant_type: 'refresh_token',
    }),
  });

  if (!res.ok) {
    const errBody = await res.text().catch(() => '');
    throw new Error(`Document-sync token refresh failed (${res.status}): ${errBody}`);
  }

  const data = (await res.json()) as { access_token?: string; error?: string };
  if (data.error || !data.access_token) {
    throw new Error(`Document-sync token refresh error: ${data.error || 'no access_token'}`);
  }

  return data.access_token;
}
