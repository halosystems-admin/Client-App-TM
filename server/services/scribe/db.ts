import pg from 'pg';
import { config } from '../../config';
import { resolveScribeDatabaseConnectionString } from './dbConfig';

let scribePool: pg.Pool | null = null;

/**
 * Dedicated Postgres pool for halo-core Scribe tables only.
 * Never use for express-session, OAuth, or main app auth storage.
 */
export function getScribePool(): pg.Pool {
  if (scribePool) return scribePool;

  const connectionString = resolveScribeDatabaseConnectionString();

  const needsSsl =
    connectionString.includes('supabase') ||
    connectionString.includes('rds.amazonaws.com') ||
    config.isProduction;

  scribePool = new pg.Pool({
    connectionString,
    ssl: needsSsl ? { rejectUnauthorized: false } : undefined,
  });

  return scribePool;
}

/** Test-only: reset singleton between tests. */
export function resetScribePoolForTests(): void {
  if (scribePool) {
    void scribePool.end().catch(() => {});
  }
  scribePool = null;
}
