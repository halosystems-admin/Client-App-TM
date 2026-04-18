import { getHaloRootFolder, driveRequest } from './drive';

const SETTINGS_FILE_NAME = 'halo_user_settings.json';

export interface StoredUserSettings {
  haloUserId?: string;
  [key: string]: unknown;
}

export function extractStoredHaloUserId(settings: StoredUserSettings | null | undefined): string | undefined {
  const storedId = settings?.haloUserId;
  if (typeof storedId === 'string' && storedId.trim()) {
    return storedId.trim();
  }
  return undefined;
}

async function findSettingsFile(token: string, rootId: string): Promise<string | null> {
  const query = encodeURIComponent(
    `'${rootId}' in parents and name='${SETTINGS_FILE_NAME}' and mimeType='application/json' and trashed=false`
  );
  const data = await driveRequest(token, `/files?q=${query}&fields=files(id)`);
  return data.files && data.files.length > 0 ? data.files[0].id : null;
}

export async function loadStoredUserSettings(token: string): Promise<StoredUserSettings | null> {
  const rootId = await getHaloRootFolder(token);
  const fileId = await findSettingsFile(token, rootId);
  if (!fileId) return null;

  const response = await fetch(
    `https://www.googleapis.com/drive/v3/files/${fileId}?alt=media`,
    {
      headers: { Authorization: `Bearer ${token}` },
    }
  );

  if (!response.ok) {
    throw new Error(`Failed to load settings (${response.status}).`);
  }

  return (await response.json()) as StoredUserSettings;
}

export async function getStoredHaloUserId(token: string): Promise<string | undefined> {
  try {
    const settings = await loadStoredUserSettings(token);
    return extractStoredHaloUserId(settings);
  } catch {
    // The caller decides how to handle missing or unreadable settings.
  }

  return undefined;
}