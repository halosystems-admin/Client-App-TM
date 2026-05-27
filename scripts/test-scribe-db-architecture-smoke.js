#!/usr/bin/env node
/* eslint-disable no-console */
/**
 * Read-only smoke: Scribe DB is halo-core (not RDS) and dr.didigastro resolves.
 *
 *   SCRIBE_DATABASE_URL=... node scripts/test-scribe-db-architecture-smoke.js
 */

require('dotenv').config();
const pg = require('pg');

const DEMO_EMAIL = 'dr.didigastro@halo.africa';
const EXPECTED_PRACTICE = '77777777-7777-7777-7777-777777777777';

function hostKind(url) {
  if (!url) return 'unset';
  if (url.includes('supabase')) return 'supabase';
  if (url.includes('rds.amazonaws.com')) return 'aws-rds';
  return 'other';
}

async function main() {
  const scribeUrl = (process.env.SCRIBE_DATABASE_URL || process.env.HALO_PRODUCTION_DATABASE_URL || '').trim();
  const mainUrl = (process.env.DATABASE_URL || '').trim();

  console.log('DB targets (labels only)', {
    mainDbConfigured: Boolean(mainUrl),
    mainDbKind: hostKind(mainUrl),
    scribeDbConfigured: Boolean(scribeUrl),
    scribeDbKind: hostKind(scribeUrl),
  });

  if (!scribeUrl) {
    console.error('FAIL: SCRIBE_DATABASE_URL is not set');
    process.exit(1);
  }

  if (hostKind(scribeUrl) !== 'supabase') {
    console.error('FAIL: SCRIBE_DATABASE_URL does not look like halo-core Supabase');
    process.exit(1);
  }

  if (hostKind(mainUrl) === 'aws-rds' && hostKind(scribeUrl) === 'aws-rds') {
    console.error('FAIL: Scribe URL must not be the same RDS class as main DATABASE_URL');
    process.exit(1);
  }

  const pool = new pg.Pool({ connectionString: scribeUrl, ssl: { rejectUnauthorized: false } });
  const client = await pool.connect();

  try {
    const userRes = await client.query(
      `SELECT id::text, practice_id::text, email FROM users WHERE lower(email) = lower($1)`,
      [DEMO_EMAIL]
    );
    if (userRes.rows.length !== 1) {
      throw new Error(`Expected 1 user for ${DEMO_EMAIL}, got ${userRes.rows.length}`);
    }
    if (userRes.rows[0].practice_id !== EXPECTED_PRACTICE) {
      throw new Error(`Unexpected practice_id ${userRes.rows[0].practice_id}`);
    }
    console.log('PASS: user identity', {
      userId: userRes.rows[0].id,
      practiceId: userRes.rows[0].practice_id,
    });

    const templates = await client.query(
      `
        SELECT t.id::text, t.name, t.output_format
        FROM scribe_templates t
        WHERE t.practice_id::text = $1
        ORDER BY t.name
      `,
      [EXPECTED_PRACTICE]
    );
    console.log('PASS: practice-scoped templates', templates.rows.map((r) => r.name));

    const wrongPractice = await client.query(
      `
        SELECT id::text FROM scribe_templates
        WHERE practice_id::text = $1 AND id::text = $2
      `,
      ['88888888-8888-8888-8888-888888888888', templates.rows[0]?.id || '00000000-0000-0000-0000-000000000000']
    );
    if (wrongPractice.rows.length > 0) {
      throw new Error('Template visible across practices (should not happen)');
    }
    console.log('PASS: template not visible for other practice_id');
  } finally {
    client.release();
    await pool.end();
  }

  console.log('All smoke checks passed.');
}

main().catch((e) => {
  console.error('FAIL:', e.message);
  process.exit(1);
});
