import assert from 'node:assert/strict';
import { describeDatabaseTarget } from '../lib/databaseTargets';
import { resolveScribeRouteMode } from '../lib/startupDatabaseValidation';
import {
  resolveScribeDatabaseConnectionString,
  ScribeDatabaseConfigError,
} from '../services/scribe/dbConfig';
import { resetScribePoolForTests } from '../services/scribe/db';

const SUPABASE_URL =
  'postgresql://user:secret@aws-0-eu-west-1.pooler.supabase.com:5432/postgres';
const RDS_URL =
  'postgresql://user:secret@caccrius79qj6q.cluster-czz5s0kz4scl.eu-west-1.rds.amazonaws.com:5432/de2dai6vtjpe6o';

function withEnv(
  overrides: Record<string, string | undefined>,
  fn: () => void
): void {
  const prior: Record<string, string | undefined> = {};
  for (const key of Object.keys(overrides)) {
    prior[key] = process.env[key];
    const value = overrides[key];
    if (value === undefined) {
      delete process.env[key];
    } else {
      process.env[key] = value;
    }
  }
  resetScribePoolForTests();
  try {
    fn();
  } finally {
    for (const key of Object.keys(overrides)) {
      const value = prior[key];
      if (value === undefined) {
        delete process.env[key];
      } else {
        process.env[key] = value;
      }
    }
    resetScribePoolForTests();
  }
}

function testDescribeDatabaseTarget() {
  const supabase = describeDatabaseTarget(SUPABASE_URL);
  assert.equal(supabase.hostKind, 'supabase');
  assert.equal(supabase.configured, true);
  assert.ok(!supabase.label.includes('secret'));

  const rds = describeDatabaseTarget(RDS_URL);
  assert.equal(rds.hostKind, 'aws-rds');
  assert.ok(rds.label.includes('aws-rds'));
}

function testProductionRequiresScribeUrlWhenMainIsRds() {
  withEnv(
    {
      NODE_ENV: 'production',
      DATABASE_URL: RDS_URL,
      SCRIBE_DATABASE_URL: undefined,
      HALO_PRODUCTION_DATABASE_URL: undefined,
    },
    () => {
      assert.throws(
        () => resolveScribeDatabaseConnectionString(),
        (err: unknown) => err instanceof ScribeDatabaseConfigError
      );
    }
  );
}

function testProductionBridgeUsesScribeUrl() {
  withEnv(
    {
      NODE_ENV: 'production',
      DATABASE_URL: RDS_URL,
      SCRIBE_DATABASE_URL: SUPABASE_URL,
    },
    () => {
      const resolved = resolveScribeDatabaseConnectionString();
      assert.equal(resolved, SUPABASE_URL);
      assert.equal(describeDatabaseTarget(resolved).hostKind, 'supabase');
    }
  );
}

function testDedicatedScribeAppMayUseSupabaseDatabaseUrl() {
  withEnv(
    {
      NODE_ENV: 'production',
      DATABASE_URL: SUPABASE_URL,
      SCRIBE_DATABASE_URL: undefined,
    },
    () => {
      const resolved = resolveScribeDatabaseConnectionString();
      assert.equal(resolved, SUPABASE_URL);
    }
  );
}

function testDevelopmentFallbackToDatabaseUrl() {
  const devOnlyUrl = 'postgresql://dev:dev@127.0.0.1:5432/halo_dev';
  withEnv(
    {
      NODE_ENV: 'development',
      DATABASE_URL: devOnlyUrl,
      SCRIBE_DATABASE_URL: undefined,
      HALO_PRODUCTION_DATABASE_URL: undefined,
    },
    () => {
      const resolved = resolveScribeDatabaseConnectionString();
      assert.equal(resolved, devOnlyUrl);
    }
  );
}

function testLabelsNeverContainPassword() {
  const label = describeDatabaseTarget(SUPABASE_URL).label;
  assert.ok(!label.includes('secret'));
  assert.ok(!label.includes('82jbol'));
}

function testBridgeModeUsesInProcessScribeDespiteUpstreamUrl() {
  withEnv(
    {
      NODE_ENV: 'production',
      SCRIBE_DATABASE_URL: SUPABASE_URL,
      DATABASE_URL: RDS_URL,
      SCRIBE_SERVICE_URL: 'https://halo-api-scribe-production.example.herokuapp.com',
    },
    () => {
      assert.equal(resolveScribeRouteMode(), 'in-process');
    }
  );
}

function testProxyOnlyWhenNoBridgeDb() {
  withEnv(
    {
      NODE_ENV: 'production',
      SCRIBE_DATABASE_URL: undefined,
      DATABASE_URL: RDS_URL,
      SCRIBE_SERVICE_URL: 'https://halo-api-scribe-production.example.herokuapp.com',
    },
    () => {
      assert.equal(resolveScribeRouteMode(), 'proxy');
    }
  );
}

testDescribeDatabaseTarget();
testProductionRequiresScribeUrlWhenMainIsRds();
testProductionBridgeUsesScribeUrl();
testDedicatedScribeAppMayUseSupabaseDatabaseUrl();
testDevelopmentFallbackToDatabaseUrl();
testLabelsNeverContainPassword();
testBridgeModeUsesInProcessScribeDespiteUpstreamUrl();
testProxyOnlyWhenNoBridgeDb();

console.log('scribe-db-architecture.test.ts: all assertions passed');
