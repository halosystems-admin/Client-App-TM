import { config } from '../../config';
import { describeDatabaseTarget, type DatabaseTargetSummary } from '../../lib/databaseTargets';

export class ScribeDatabaseConfigError extends Error {
  readonly code = 'SCRIBE_DATABASE_NOT_CONFIGURED';

  constructor(message: string) {
    super(message);
    this.name = 'ScribeDatabaseConfigError';
  }
}

function isProductionRuntime(): boolean {
  return config.isProduction || process.env.NODE_ENV === 'production';
}

function isSupabaseConnectionString(connectionString: string): boolean {
  return describeDatabaseTarget(connectionString).hostKind === 'supabase';
}

/**
 * Connection string for halo-core Scribe tables only.
 *
 * Production bridge (halo-main): SCRIBE_DATABASE_URL → Supabase halo-core.
 * Production dedicated scribe app: DATABASE_URL may point at halo-core Supabase when
 * SCRIBE_DATABASE_URL is unset — never use AWS RDS for Scribe.
 *
 * Local dev: SCRIBE_DATABASE_URL preferred; DATABASE_URL fallback for single-DB dev.
 */
export function resolveScribeDatabaseConnectionString(): string {
  const explicit = (process.env.SCRIBE_DATABASE_URL || '').trim();
  if (explicit) {
    return explicit;
  }

  if (isProductionRuntime()) {
    const mainUrl = (process.env.DATABASE_URL || '').trim();
    if (mainUrl && isSupabaseConnectionString(mainUrl)) {
      // Dedicated scribe Heroku app: DATABASE_URL is halo-core Supabase.
      return mainUrl;
    }

    throw new ScribeDatabaseConfigError(
      'SCRIBE_DATABASE_URL is required in production when the main DATABASE_URL is not halo-core Supabase. ' +
        'Set SCRIBE_DATABASE_URL to the halo-core connection on halo-main (bridge mode). ' +
        'Do not point Scribe template or identity queries at the AWS RDS session database.'
    );
  }

  const scriptUrl = (process.env.HALO_PRODUCTION_DATABASE_URL || '').trim();
  if (scriptUrl) {
    return scriptUrl;
  }

  const devFallback = (process.env.DATABASE_URL || '').trim();
  if (devFallback) {
    return devFallback;
  }

  throw new ScribeDatabaseConfigError(
    'SCRIBE_DATABASE_URL (or DATABASE_URL in local development) is required for Scribe database access.'
  );
}

export function getScribeDatabaseTarget(): DatabaseTargetSummary {
  try {
    return describeDatabaseTarget(resolveScribeDatabaseConnectionString());
  } catch {
    return describeDatabaseTarget(undefined);
  }
}

export function assertScribeDatabaseConfigured(): void {
  resolveScribeDatabaseConnectionString();
}

export function scribeUsesMainDatabaseUrlInProduction(): boolean {
  if (!isProductionRuntime()) return false;
  const explicit = (process.env.SCRIBE_DATABASE_URL || '').trim();
  if (explicit) return false;
  const mainUrl = (process.env.DATABASE_URL || '').trim();
  return Boolean(mainUrl && isSupabaseConnectionString(mainUrl));
}
