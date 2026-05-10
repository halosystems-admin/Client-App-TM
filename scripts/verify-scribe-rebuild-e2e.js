#!/usr/bin/env node
/* eslint-disable no-console */

/**
 * ============================================================================
 * LOCAL DEVELOPMENT ONLY — Scribe rebuild E2E verification
 * ============================================================================
 *
 * This script is NOT a production test. It calls a live local API and Postgres.
 *
 * Prerequisites:
 *   1. Set HALO_VERIFY_SCRIBE_E2E=1 (required opt-in; avoids accidental runs).
 *   2. DATABASE_URL in .env (same database the dev server uses for Scribe).
 *   3. Dev server running: npm run dev:server (default port 3000).
 *   4. Seeded dev practice / patient / template (see constants below).
 *
 * Does NOT call /api/notes/generate_note. Does NOT change application code.
 *
 * Usage (from halo-app/):
 *   set HALO_VERIFY_SCRIBE_E2E=1
 *   node scripts/verify-scribe-rebuild-e2e.js
 *
 * Optional env:
 *   HALO_SCRIBE_E2E_BASE_URL  (default http://localhost:3000)
 *   HALO_SCRIBE_E2E_TIMEOUT_MS  (default 120000) — full generate SSE window
 *
 * Exit codes: 0 = all checks passed, 1 = failure (loud console output).
 */

const path = require('path');
const { randomUUID } = require('crypto');
const pg = require('pg');

require('dotenv').config({ path: path.resolve(__dirname, '../.env') });

// --- safety gate -----------------------------------------------------------
if (process.env.HALO_VERIFY_SCRIBE_E2E !== '1') {
  console.error('');
  console.error('REFUSED: This local-dev E2E script requires opt-in.');
  console.error('  Set environment variable: HALO_VERIFY_SCRIBE_E2E=1');
  console.error('');
  process.exit(1);
}

if (process.env.NODE_ENV === 'production') {
  console.error('REFUSED: Do not run this script with NODE_ENV=production.');
  process.exit(1);
}

const BASE_URL = (process.env.HALO_SCRIBE_E2E_BASE_URL || 'http://localhost:3000').replace(/\/$/, '');
const GEN_TIMEOUT_MS = Number(process.env.HALO_SCRIBE_E2E_TIMEOUT_MS || 120_000);

/** Local dev fixtures (must match your seeded Supabase / dev DB) */
const PRACTICE_ID = '44444444-4444-4444-4444-444444444444';
const PATIENT_ID = '74bac658-0cda-5b4c-a1c8-e4b8b12d4649';
const TEMPLATE_ID = '77777777-7777-7777-7777-777777777777';

const STEPS = {
  PRECHECK: 'Precheck: environment (DATABASE_URL)',
  STEP1: 'STEP 1: Fetch templates',
  STEP2: 'STEP 2: Generate scribe note',
  STEP3: 'STEP 3: Verify scribe_outputs',
  STEP4: 'STEP 4: Verify consultation',
  STEP5: 'STEP 5: Finalize output',
  STEP6: 'STEP 6: Verify consultation_events',
};

/** Updated before each phase so fail() can report where we broke. */
let currentStep = '(init)';

function setStep(label) {
  currentStep = label;
  console.log('');
  console.log(`--- ${label} ---`);
}

function fail(msg, detail) {
  console.error('');
  console.error(`FAILED AT: ${currentStep}`);
  console.error('FAIL:', msg);
  if (detail !== undefined) console.error(detail);
  console.error('');
  process.exit(1);
}

async function fetchTemplates() {
  const url = `${BASE_URL}/api/scribe/templates?practiceId=${encodeURIComponent(PRACTICE_ID)}`;
  const res = await fetch(url, { headers: { Accept: 'application/json' } });
  if (!res.ok) {
    const t = await res.text();
    fail(`GET /api/scribe/templates expected 200, got ${res.status}`, t);
  }
  const data = await res.json();
  const templates = data.templates || [];
  const soap = templates.find((x) => String(x.id).toLowerCase() === TEMPLATE_ID.toLowerCase());
  if (!soap) {
    fail(
      `SOAP template missing from templates response (expected id ${TEMPLATE_ID}).`,
      JSON.stringify(templates.map((x) => ({ id: x.id, name: x.name })), null, 2)
    );
  }
  console.log(`OK — SOAP template present (${TEMPLATE_ID})`);
  return templates;
}

/**
 * Parse SSE body until type===meta with outputId, or type===error, or stream ends.
 */
async function streamGenerateAndCaptureOutputId() {
  const consultationId = randomUUID();
  const res = await fetch(`${BASE_URL}/api/scribe/generate`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Accept: 'text/event-stream',
    },
    body: JSON.stringify({
      practiceId: PRACTICE_ID,
      patientId: PATIENT_ID,
      consultationId,
      templateId: TEMPLATE_ID,
      rawTranscript:
        'Patient presents for follow-up. Symptoms improved. Plan: continue current management.',
    }),
    signal: AbortSignal.timeout(GEN_TIMEOUT_MS),
  });

  if (!res.ok) {
    const t = await res.text();
    fail(`POST /api/scribe/generate expected SSE stream, got HTTP ${res.status}`, t);
  }

  const reader = res.body.getReader();
  const decoder = new TextDecoder();
  let buffer = '';
  let outputId = null;
  let sawDone = false;

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });
    buffer = buffer.replace(/\r\n/g, '\n').replace(/\r/g, '\n');

    const chunks = buffer.split('\n\n');
    buffer = chunks.pop() || '';

    for (const block of chunks) {
      for (const line of block.split('\n')) {
        if (!line.startsWith('data:')) continue;
        const payload = line.slice(5).trim();
        if (!payload) continue;
        let json;
        try {
          json = JSON.parse(payload);
        } catch {
          continue;
        }
        if (json.type === 'error') {
          fail('SSE error event from generate', JSON.stringify(json));
        }
        if (json.type === 'meta' && json.outputId) {
          outputId = String(json.outputId).trim();
        }
        if (json.type === 'done') {
          sawDone = true;
        }
      }
    }

    if (outputId) break;
  }

  if (!outputId) {
    fail(
      'No outputId from generate SSE (missing meta event). Cannot continue E2E.',
      sawDone ? 'Stream ended with done but no meta.' : 'Stream ended without meta outputId.'
    );
  }

  console.log(`OK — meta outputId: ${outputId}`);
  return { outputId, consultationId };
}

async function verifyScribeOutputsRow(pool, outputId) {
  const r = await pool.query(
    `
      SELECT id::text AS id, consultation_id::text AS consultation_id, practice_id::text AS practice_id
      FROM scribe_outputs
      WHERE id::text = $1
    `,
    [outputId]
  );
  if (r.rows.length === 0) {
    fail(`scribe_outputs row missing for outputId=${outputId}`);
  }
  const row = r.rows[0];
  if (!row.consultation_id) {
    fail(`scribe_outputs.consultation_id is null for outputId=${outputId}`);
  }
  console.log(`OK — scribe_outputs.id=${row.id}, consultation_id=${row.consultation_id}`);
  return row.consultation_id;
}

async function verifyConsultationRow(pool, consultationId) {
  const c = await pool.query(`SELECT id::text AS id FROM consultations WHERE id::text = $1`, [
    consultationId,
  ]);
  if (c.rows.length === 0) {
    fail(
      `consultations row missing for scribe_outputs.consultation_id=${consultationId}`,
      'Foreign chain broken.'
    );
  }
  console.log(`OK — consultations.id=${consultationId}`);
}

async function finalizeOutput(outputId) {
  const finalMarkdown =
    '## E2E finalize verification\n\nClinical note body inserted by verify-scribe-rebuild-e2e.js.';
  const res = await fetch(`${BASE_URL}/api/scribe/${encodeURIComponent(outputId)}/finalize`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
    body: JSON.stringify({ finalMarkdown, doctorEdited: true }),
  });
  const text = await res.text();
  if (!res.ok) {
    let dbg = text;
    try {
      const j = JSON.parse(text);
      dbg = JSON.stringify(j, null, 2);
    } catch {
      /* raw */
    }
    fail(`POST /api/scribe/:outputId/finalize expected 200, got ${res.status}`, dbg);
  }
  console.log('OK — finalize HTTP 200');
}

async function verifyConsultationEvent(pool, outputId, consultationId) {
  const r = await pool.query(
    `
      SELECT id::text AS event_id, event_type, event_data
      FROM consultation_events
      WHERE consultation_id::text = $1
        AND event_type = 'scribe_output'
        AND event_data->>'scribe_output_id' = $2
      ORDER BY created_at DESC
      LIMIT 1
    `,
    [consultationId, outputId]
  );

  if (r.rows.length === 0) {
    fail(
      'consultation_events row missing',
      `Expected event_type=scribe_output, scribe_output_id=${outputId}, consultation_id=${consultationId}`
    );
  }

  const ev = r.rows[0];
  let data = ev.event_data;
  if (typeof data === 'string') {
    try {
      data = JSON.parse(data);
    } catch (e) {
      fail('event_data is not valid JSON', String(e));
    }
  }
  const contentMd = data && typeof data === 'object' ? data.content_md : undefined;
  if (typeof contentMd !== 'string' || !contentMd.trim()) {
    fail('event_data.content_md missing or empty', JSON.stringify(data));
  }

  console.log(`OK — consultation_events.id=${ev.event_id}, event_type=${ev.event_type}`);
  console.log(`    scribe_output_id (in payload): ${data.scribe_output_id}`);

  return {
    eventId: ev.event_id,
    event_type: ev.event_type,
  };
}

function printSuccessSummary({ outputId, consultationId, eventId, event_type }) {
  console.log('');
  console.log('=== E2E SUMMARY (success) ===');
  console.log(`  baseUrl:         ${BASE_URL}`);
  console.log(`  practiceId:      ${PRACTICE_ID}`);
  console.log(`  patientId:       ${PATIENT_ID}`);
  console.log(`  templateId:      ${TEMPLATE_ID}`);
  console.log(`  outputId:        ${outputId}`);
  console.log(`  consultationId:  ${consultationId}`);
  console.log(`  eventId:         ${eventId ?? '(n/a)'}`);
  console.log(`  event_type:      ${event_type ?? '(n/a)'}`);
  console.log('');
  console.log('=== ALL CHECKS PASSED ===');
  console.log('');
}

async function main() {
  console.log('');
  console.log('=== Scribe rebuild LOCAL E2E verification ===');

  setStep(STEPS.PRECHECK);
  if (!process.env.DATABASE_URL || !String(process.env.DATABASE_URL).trim()) {
    fail('DATABASE_URL is not set (required for DB assertions).');
  }
  console.log('OK — DATABASE_URL is set');

  const pool = new pg.Pool({
    connectionString: process.env.DATABASE_URL.trim(),
    ssl: process.env.NODE_ENV === 'production' ? { rejectUnauthorized: false } : undefined,
  });

  let outputId;
  let consultationId;
  let eventMeta = { eventId: null, event_type: null };

  try {
    setStep(STEPS.STEP1);
    await fetchTemplates();

    setStep(STEPS.STEP2);
    const gen = await streamGenerateAndCaptureOutputId();
    outputId = gen.outputId;

    setStep(STEPS.STEP3);
    consultationId = await verifyScribeOutputsRow(pool, outputId);

    setStep(STEPS.STEP4);
    await verifyConsultationRow(pool, consultationId);

    setStep(STEPS.STEP5);
    await finalizeOutput(outputId);

    setStep(STEPS.STEP6);
    eventMeta = await verifyConsultationEvent(pool, outputId, consultationId);

    printSuccessSummary({
      outputId,
      consultationId,
      eventId: eventMeta.eventId,
      event_type: eventMeta.event_type,
    });
  } finally {
    await pool.end();
  }
}

main().catch((err) => {
  console.error(err);
  currentStep = currentStep || '(async error)';
  fail(err && err.message ? err.message : String(err));
});
