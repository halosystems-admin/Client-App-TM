import type { Request } from 'express';
import {
  applyResolvedScribeIdentityToSession,
  resolveScribeIdentityFromRequest,
  type ResolvedScribeIdentity,
} from './resolveScribeIdentity';
import { getScribePool } from './db';

const LOCAL_DEV_FALLBACK_PRACTICE_ID = '44444444-4444-4444-4444-444444444444';

function isPostgresUuid(value: string): boolean {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(value.trim());
}

function extractTrustedPracticeIdFromRequest(req: Request): string | null {
  const rawPracticeId =
    req.session?.practiceId ??
    req.session?.practice_id ??
    (req as unknown as { user?: { practiceId?: unknown; practice_id?: unknown } }).user?.practiceId ??
    (req as unknown as { user?: { practiceId?: unknown; practice_id?: unknown } }).user?.practice_id ??
    (req as unknown as { auth?: { practiceId?: unknown; practice_id?: unknown } }).auth?.practiceId ??
    (req as unknown as { auth?: { practiceId?: unknown; practice_id?: unknown } }).auth?.practice_id ??
    '';

  const practiceId = typeof rawPracticeId === 'string' ? rawPracticeId.trim() : '';
  return practiceId && isPostgresUuid(practiceId) ? practiceId : null;
}

async function resolvePracticeIdFromDbSetting(): Promise<string | null> {
  const pool = getScribePool();
  const result = await pool.query<{ practice_id: string | null }>(
    `
      SELECT nullif(current_setting('app.practice_id', true), '')::text AS practice_id
    `
  );
  const resolved = result.rows[0]?.practice_id?.trim() || '';
  return resolved && isPostgresUuid(resolved) ? resolved : null;
}

export type ScribePracticeContext = {
  practiceId: string;
  identity: ResolvedScribeIdentity | null;
};

/**
 * Ensures session practice scope comes from halo-core users when possible.
 * Returns practiceId for Scribe routes; never trusts caller-supplied practiceId in production.
 */
export async function resolveScribePracticeContext(
  req: Request,
  options?: {
    allowQueryPracticeId?: boolean;
    allowBodyPracticeId?: string;
  }
): Promise<ScribePracticeContext | null> {
  let identity: ResolvedScribeIdentity | null = null;

  try {
    identity = await resolveScribeIdentityFromRequest(req);
    if (identity) {
      applyResolvedScribeIdentityToSession(req, identity);
      return { practiceId: identity.practiceId, identity };
    }
  } catch (err) {
    console.error('[scribe] identity resolution failed', {
      error: err instanceof Error ? err.message : String(err),
    });
    if (process.env.NODE_ENV === 'production') {
      return null;
    }
  }

  const fromSession = extractTrustedPracticeIdFromRequest(req);
  if (fromSession) {
    return { practiceId: fromSession, identity: null };
  }

  try {
    const fromDbSetting = await resolvePracticeIdFromDbSetting();
    if (fromDbSetting) {
      return { practiceId: fromDbSetting, identity: null };
    }
  } catch {
    // fall through
  }

  if (process.env.NODE_ENV !== 'production') {
    const bodyId = typeof options?.allowBodyPracticeId === 'string' ? options.allowBodyPracticeId.trim() : '';
    if (bodyId && isPostgresUuid(bodyId)) {
      return { practiceId: bodyId, identity: null };
    }

    if (options?.allowQueryPracticeId) {
      const q = req.query?.practiceId;
      const queryId =
        typeof q === 'string'
          ? q.trim()
          : Array.isArray(q) && typeof q[0] === 'string'
            ? q[0].trim()
            : '';
      if (queryId && isPostgresUuid(queryId)) {
        return { practiceId: queryId, identity: null };
      }
    }

    return { practiceId: LOCAL_DEV_FALLBACK_PRACTICE_ID, identity: null };
  }

  return null;
}
