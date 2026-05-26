/**
 * BC-6G — Fail-closed guards for document_sync_jobs enqueue and worker startup.
 * Never logs secrets or clinical content.
 */

import {
  PRODUCTION_FAKE_E2E_SESSION_HEADER,
} from './productionFakeE2eSession';

export type DocumentSyncSkipContext = {
  env?: NodeJS.ProcessEnv;
  headers?: Record<string, string | string[] | undefined>;
  /** Route/query explicit skip (e.g. adSkipDocumentJobs=1). */
  skipFromRouteOption?: boolean;
};

function envFlagEnabled(env: NodeJS.ProcessEnv, name: string): boolean {
  return String(env[name] || '').trim() === '1';
}

function headerIsOne(
  headers: Record<string, string | string[] | undefined> | undefined,
  name: string
): boolean {
  if (!headers) return false;
  const lower = name.toLowerCase();
  const raw = headers[lower] ?? headers[name];
  const value = Array.isArray(raw) ? raw[0] : raw;
  return String(value || '').trim() === '1';
}

/** Local/dev-only opt-in for the full document sync pipeline. Never honored in production. */
export function isLocalDocumentSyncPipelineOverrideEnabled(
  env: NodeJS.ProcessEnv = process.env
): boolean {
  if (env.NODE_ENV === 'production') {
    return false;
  }
  return envFlagEnabled(env, 'HALO_SCRIBE_ENABLE_DOCUMENT_SYNC_PIPELINE');
}

/** HALO_DOCUMENT_SYNC_DISABLED / HALO_SCRIBE_SKIP_DOCUMENT_OUTPUT — all runtimes. */
export function shouldSkipDocumentSyncJobsForGlobalDisable(env: NodeJS.ProcessEnv = process.env): boolean {
  return (
    envFlagEnabled(env, 'HALO_DOCUMENT_SYNC_DISABLED') ||
    envFlagEnabled(env, 'HALO_SCRIBE_SKIP_DOCUMENT_OUTPUT')
  );
}

/** Production pilot document output explicitly disabled (BC-6 / BC-6E). */
export function shouldSkipDocumentSyncJobsForProductionDocumentOutputDisabled(
  env: NodeJS.ProcessEnv = process.env
): boolean {
  if (env.NODE_ENV !== 'production') {
    return false;
  }
  return envFlagEnabled(env, 'HALO_SCRIBE_PRODUCTION_DOCUMENT_OUTPUT_DISABLED');
}

/**
 * Any request identifying as production fake E2E (header fail-closed in production).
 */
export function shouldSkipDocumentSyncJobsForProductionFakeE2eRequest(
  headers: Record<string, string | string[] | undefined> | undefined,
  env: NodeJS.ProcessEnv = process.env
): boolean {
  if (env.NODE_ENV !== 'production') {
    return false;
  }
  return headerIsOne(headers, PRODUCTION_FAKE_E2E_SESSION_HEADER);
}

/** Client skip headers — honored in all environments. */
export function shouldSkipDocumentSyncJobsForSkipDocumentOutputHeaders(
  headers: Record<string, string | string[] | undefined> | undefined
): boolean {
  return (
    headerIsOne(headers, 'x-halo-scribe-skip-document-output') ||
    headerIsOne(headers, 'x-halo-scribe-ad-skip-document-jobs')
  );
}

/** Phase AD local/dev only. */
export function shouldSkipDocumentSyncJobsForAdLocalDev(env: NodeJS.ProcessEnv = process.env): boolean {
  if (isLocalDocumentSyncPipelineOverrideEnabled(env)) {
    return false;
  }
  if (env.NODE_ENV === 'production') {
    return false;
  }
  if (!envFlagEnabled(env, 'HALO_SCRIBE_ACTIVATE_LOCAL_DEV')) {
    return false;
  }
  if (!envFlagEnabled(env, 'HALO_SCRIBE_AD_SKIP_DOCUMENT_JOBS')) {
    return false;
  }
  return true;
}

/** Local Supabase rebuild only. */
export function shouldSkipDocumentSyncJobsForLocalSupabase(env: NodeJS.ProcessEnv = process.env): boolean {
  if (isLocalDocumentSyncPipelineOverrideEnabled(env)) {
    return false;
  }
  if (env.NODE_ENV === 'production') {
    return false;
  }
  const databaseUrl = (env.DATABASE_URL || '').toLowerCase();
  const localHints = ['127.0.0.1', 'localhost', '54322'];
  const matched = localHints.filter((hint) => databaseUrl.includes(hint));
  return matched.length >= 2;
}

/** Staging rehearsal skip flags (non-production only). */
export function shouldSkipDocumentSyncJobsForStagingEnv(env: NodeJS.ProcessEnv = process.env): boolean {
  if (isLocalDocumentSyncPipelineOverrideEnabled(env)) {
    return false;
  }
  if (env.NODE_ENV === 'production') {
    return false;
  }
  return (
    envFlagEnabled(env, 'HALO_SCRIBE_SKIP_DOCUMENT_OUTPUT') ||
    envFlagEnabled(env, 'HALO_DOCUMENT_SYNC_DISABLED') ||
    envFlagEnabled(env, 'HALO_SCRIBE_STAGING_SKIP_DOCUMENT_JOBS')
  );
}

function databaseUrlLooksLikeCloudStaging(env: NodeJS.ProcessEnv): boolean {
  const databaseUrl = (env.DATABASE_URL || env.HALO_STAGING_DATABASE_URL || '').toLowerCase();
  if (!databaseUrl) return false;
  const localHints = ['127.0.0.1', 'localhost', '54322'];
  if (localHints.some((hint) => databaseUrl.includes(hint))) {
    return false;
  }
  return databaseUrl.includes('supabase.co');
}

/** Cloud staging without explicit document output write gate. */
export function shouldSkipDocumentSyncJobsForStagingMissingWriteGate(
  env: NodeJS.ProcessEnv = process.env
): boolean {
  if (isLocalDocumentSyncPipelineOverrideEnabled(env)) {
    return false;
  }
  if (env.NODE_ENV === 'production') {
    return false;
  }
  if (env.NODE_ENV !== 'staging') {
    return false;
  }
  if (!databaseUrlLooksLikeCloudStaging(env)) {
    return false;
  }
  if (shouldSkipDocumentSyncJobsForStagingEnv(env)) {
    return false;
  }
  return !envFlagEnabled(env, 'HALO_SCRIBE_STAGING_DOCUMENT_OUTPUT_WRITE');
}

/**
 * Central skip decision for finalize INSERT into document_sync_jobs.
 */
export function resolveShouldSkipDocumentSyncJobs(ctx: DocumentSyncSkipContext = {}): boolean {
  const env = ctx.env ?? process.env;
  const headers = ctx.headers;

  if (isLocalDocumentSyncPipelineOverrideEnabled(env)) {
    return false;
  }

  if (ctx.skipFromRouteOption === true) {
    return true;
  }
  if (shouldSkipDocumentSyncJobsForGlobalDisable(env)) {
    return true;
  }
  if (shouldSkipDocumentSyncJobsForSkipDocumentOutputHeaders(headers)) {
    return true;
  }
  if (shouldSkipDocumentSyncJobsForProductionFakeE2eRequest(headers, env)) {
    return true;
  }
  if (shouldSkipDocumentSyncJobsForProductionDocumentOutputDisabled(env)) {
    return true;
  }
  if (shouldSkipDocumentSyncJobsForAdLocalDev(env)) {
    return true;
  }
  if (shouldSkipDocumentSyncJobsForLocalSupabase(env)) {
    return true;
  }
  if (shouldSkipDocumentSyncJobsForStagingEnv(env)) {
    return true;
  }
  if (shouldSkipDocumentSyncJobsForStagingMissingWriteGate(env)) {
    return true;
  }
  return false;
}

/** Whether document sync worker poller may start at process boot. */
export function shouldStartDocumentSyncWorker(env: NodeJS.ProcessEnv = process.env): boolean {
  if (isLocalDocumentSyncPipelineOverrideEnabled(env)) {
    return true;
  }
  if (shouldSkipDocumentSyncJobsForGlobalDisable(env)) {
    return false;
  }
  if (shouldSkipDocumentSyncJobsForAdLocalDev(env)) {
    return false;
  }
  if (shouldSkipDocumentSyncJobsForLocalSupabase(env)) {
    return false;
  }
  if (shouldSkipDocumentSyncJobsForStagingEnv(env)) {
    return false;
  }
  if (shouldSkipDocumentSyncJobsForStagingMissingWriteGate(env)) {
    return false;
  }
  return true;
}
