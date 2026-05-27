import type { Request } from 'express';
import { getScribePool } from './db';

export type ResolvedScribeIdentity = {
  userId: string;
  practiceId: string;
  email: string | null;
  googleUid: string | null;
  role: string | null;
};

type UsersRow = {
  id: string;
  practice_id: string;
  email: string | null;
  google_uid: string | null;
  role: string | null;
};

function normalizeEmail(value: string | undefined): string | null {
  const trimmed = typeof value === 'string' ? value.trim().toLowerCase() : '';
  return trimmed || null;
}

function normalizeGoogleUid(value: string | undefined): string | null {
  const trimmed = typeof value === 'string' ? value.trim() : '';
  return trimmed || null;
}

async function usersTableExists(): Promise<boolean> {
  const pool = getScribePool();
  const result = await pool.query<{ exists: boolean }>(
    `
      SELECT EXISTS (
        SELECT 1
        FROM information_schema.tables
        WHERE table_schema = 'public'
          AND table_name = 'users'
      ) AS exists
    `
  );
  return Boolean(result.rows[0]?.exists);
}

async function queryUserByGoogleUid(googleUid: string): Promise<UsersRow | null> {
  const pool = getScribePool();
  const result = await pool.query<UsersRow>(
    `
      SELECT
        id::text AS id,
        practice_id::text AS practice_id,
        email,
        google_uid,
        role
      FROM users
      WHERE google_uid = $1
      LIMIT 2
    `,
    [googleUid]
  );

  if (result.rows.length > 1) {
    throw new Error(`Multiple users rows matched google_uid=${googleUid}.`);
  }

  return result.rows[0] ?? null;
}

async function queryUserByEmail(email: string): Promise<UsersRow | null> {
  const pool = getScribePool();
  const result = await pool.query<UsersRow>(
    `
      SELECT
        id::text AS id,
        practice_id::text AS practice_id,
        email,
        google_uid,
        role
      FROM users
      WHERE lower(email) = lower($1)
      LIMIT 2
    `,
    [email]
  );

  if (result.rows.length > 1) {
    throw new Error(`Multiple users rows matched email=${email}.`);
  }

  return result.rows[0] ?? null;
}

/**
 * Resolve halo-core user + practice from authenticated session (google uid, then email).
 * Does not trust client-supplied practice_id or user_id.
 */
export async function resolveScribeIdentityFromRequest(
  req: Request
): Promise<ResolvedScribeIdentity | null> {
  const googleUid = normalizeGoogleUid(req.session?.userId);
  const email = normalizeEmail(req.session?.userEmail);

  if (!googleUid && !email) {
    return null;
  }

  if (!(await usersTableExists())) {
    return null;
  }

  let row: UsersRow | null = null;

  if (googleUid) {
    row = await queryUserByGoogleUid(googleUid);
  }

  if (!row && email) {
    row = await queryUserByEmail(email);
  }

  if (!row?.id || !row.practice_id) {
    return null;
  }

  return {
    userId: row.id.trim(),
    practiceId: row.practice_id.trim(),
    email: row.email,
    googleUid: row.google_uid,
    role: row.role,
  };
}

export function applyResolvedScribeIdentityToSession(
  req: Request,
  identity: ResolvedScribeIdentity
): void {
  req.session.practiceId = identity.practiceId;
  req.session.practice_id = identity.practiceId;
  req.session.scribeUserId = identity.userId;
  req.session.scribe_user_id = identity.userId;
}
