import pg from 'pg';
import path from 'path';
import { config } from '../../config';

let scribePool: pg.Pool | null = null;

export function getScribePool(): pg.Pool {
  if (scribePool) return scribePool;

  const connectionString = (
    process.env.SCRIBE_DATABASE_URL ||
    process.env.HALO_PRODUCTION_DATABASE_URL ||
    process.env.DATABASE_URL ||
    ''
  ).trim();
  if (!connectionString) {
    throw new Error(
      `SCRIBE_DATABASE_URL or DATABASE_URL is required for scribe database access. ` +
      `Expected in ${path.resolve(__dirname, '../../../.env')} or process env. ` +
      `Current cwd: ${process.cwd()}`
    );
  }

  scribePool = new pg.Pool({
    connectionString,
    ssl: config.isProduction ? { rejectUnauthorized: false } : undefined,
  });

  // TODO: Move to a single shared server DB helper if additional SQL-backed services are added.
  return scribePool;
}
