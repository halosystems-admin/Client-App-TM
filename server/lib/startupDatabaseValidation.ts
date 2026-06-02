import { config } from '../config';
import { getMainDatabaseTarget } from './databaseTargets';
import {
  assertScribeDatabaseConfigured,
  getScribeDatabaseTarget,
  scribeUsesMainDatabaseUrlInProduction,
} from '../services/scribe/dbConfig';

export type ScribeRouteMode = 'proxy' | 'in-process';

const CANONICAL_SCRIBE_SERVICE_URL = config.defaultScribeServiceUrl;

function isProductionRuntime(): boolean {
  return config.isProduction || process.env.NODE_ENV === 'production';
}

function getConfiguredScribeServiceUrl(): string {
  return (process.env.SCRIBE_SERVICE_URL || '').trim();
}

function normalizeUrlOrigin(value: string): string | null {
  const trimmed = value.trim();
  if (!trimmed) return null;

  try {
    return new URL(trimmed).origin;
  } catch {
    return null;
  }
}

function getPublicAppOrigins(): Set<string> {
  const origins = new Set<string>();

  const add = (value: string | undefined): void => {
    const origin = normalizeUrlOrigin((value || '').trim());
    if (origin) origins.add(origin);
  };

  add(config.productionUrl);
  add(config.clientUrl);
  add(process.env.PRODUCTION_URL);
  add(process.env.FRONTEND_URL);
  add(process.env.CLIENT_URL);
  add(process.env.HEROKU_APP_URL);

  const herokuAppName = (process.env.HEROKU_APP_NAME || '').trim();
  if (herokuAppName) {
    add(`https://${herokuAppName}.herokuapp.com`);
  }

  return origins;
}

function validateScribeServiceUrlOrThrow(): void {
  const upstream = getConfiguredScribeServiceUrl();

  if (!upstream) {
    if (isProductionRuntime()) {
      throw new Error(
        `SCRIBE_SERVICE_URL is required in production and must point to ${CANONICAL_SCRIBE_SERVICE_URL}.`
      );
    }
    return;
  }

  const upstreamOrigin = normalizeUrlOrigin(upstream);
  if (!upstreamOrigin) {
    throw new Error('SCRIBE_SERVICE_URL must be a valid absolute URL.');
  }

  if (getPublicAppOrigins().has(upstreamOrigin)) {
    throw new Error('SCRIBE_SERVICE_URL must not point to the public app itself.');
  }

  if (isProductionRuntime()) {
    const canonicalOrigin = normalizeUrlOrigin(CANONICAL_SCRIBE_SERVICE_URL);
    if (upstreamOrigin !== canonicalOrigin) {
      throw new Error(
        `SCRIBE_SERVICE_URL must be ${CANONICAL_SCRIBE_SERVICE_URL} in production.`
      );
    }
  }
}

function validateScribeInternalServiceSecretOrThrow(): void {
  if (!isProductionRuntime()) {
    return;
  }

  const secret = (process.env.SCRIBE_INTERNAL_SERVICE_SECRET || '').trim();
  if (!secret) {
    throw new Error('SCRIBE_INTERNAL_SERVICE_SECRET is required in production.');
  }
}

/**
 * Public app: browser -> public app backend -> canonical Scribe backend.
 * In development, the app may fall back to in-process Scribe only when no upstream is configured.
 */
export function resolveScribeRouteMode(): ScribeRouteMode {
  const upstream = getConfiguredScribeServiceUrl();
  if (!upstream) {
    if (isProductionRuntime()) {
      throw new Error(
        `SCRIBE_SERVICE_URL is required in production and must point to ${CANONICAL_SCRIBE_SERVICE_URL}.`
      );
    }
    return 'in-process';
  }

  validateScribeServiceUrlOrThrow();
  return 'proxy';
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
    validateScribeServiceUrlOrThrow();
    validateScribeInternalServiceSecretOrThrow();
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    console.error('[startup] Scribe upstream configuration error', { message });

    if (isProductionRuntime()) {
      console.error(
        '[startup] Refusing to start: production must proxy Scribe requests to the canonical backend.'
      );
      process.exit(1);
    }

    console.warn('[startup] Continuing without upstream Scribe in non-production.');
  }

  if (options.scribeRouteMode === 'proxy') {
    console.log('[startup] Scribe upstream routing', {
      configured: Boolean(getConfiguredScribeServiceUrl()),
      upstreamOrigin: normalizeUrlOrigin(getConfiguredScribeServiceUrl()) || 'unavailable',
      canonical: CANONICAL_SCRIBE_SERVICE_URL,
    });
    return;
  }

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

    if (isProductionRuntime()) {
      console.error(
        '[startup] Refusing to start: Scribe identity and templates require SCRIBE_DATABASE_URL when running in-process.'
      );
      process.exit(1);
    }

    console.warn('[startup] Continuing without Scribe DB in non-production.');
  }
}
