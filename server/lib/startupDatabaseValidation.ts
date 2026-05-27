import { config } from '../config';
import { getMainDatabaseTarget } from './databaseTargets';
import {
  assertScribeDatabaseConfigured,
  getScribeDatabaseTarget,
  scribeUsesMainDatabaseUrlInProduction,
} from '../services/scribe/dbConfig';

export type ScribeRouteMode = 'proxy' | 'in-process';

export function resolveScribeRouteMode(): ScribeRouteMode {
  return (config.scribeServiceUrl || '').trim() ? 'proxy' : 'in-process';
}

/**
 * Logs safe DB ownership labels and validates Scribe config before accepting traffic.
 * Main session/auth always uses DATABASE_URL (AWS RDS on halo-main) — unchanged.
 */
export function validateAndLogDatabaseTargets(options: {
  scribeRouteMode: ScribeRouteMode;
}): void {
  const main = getMainDatabaseTarget();
  console.log('[startup] Database targets', {
    mainDbConfigured: main.configured,
    mainDbLabel: main.label,
    scribeRouteMode: options.scribeRouteMode,
  });

  try {
    assertScribeDatabaseConfigured();
    const scribe = getScribeDatabaseTarget();
    console.log('[startup] Database targets', {
      scribeDbConfigured: scribe.configured,
      scribeDbLabel: scribe.label,
      scribeUsesDedicatedSupabaseUrl: scribeUsesMainDatabaseUrlInProduction(),
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    console.error('[startup] Scribe database configuration error', { message });

    if (config.isProduction) {
      console.error(
        '[startup] Refusing to start: Scribe identity and templates require SCRIBE_DATABASE_URL on halo-main.'
      );
      process.exit(1);
    }

    console.warn('[startup] Continuing without Scribe DB in non-production.');
  }
}
