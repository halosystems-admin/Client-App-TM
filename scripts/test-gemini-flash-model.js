#!/usr/bin/env node
/* eslint-disable no-console */
/**
 * Read-only smoke: call Gemini Flash with the same @google/genai SDK as production.
 *
 * Env:
 *   GEMINI_API_KEY       (required) — never logged
 *   GEMINI_FLASH_MODEL   (optional) — default model under test (production uses this)
 *   TEST_GEMINI_MODEL    (optional) — override model for this run
 *   GEMINI_FLASH_SMOKE_MAX_OUTPUT_TOKENS (optional, default 256, min 256)
 *
 * Usage:
 *   npm run test:gemini-flash-model
 *   TEST_GEMINI_MODEL=gemini-2.5-flash npm run test:gemini-flash-model
 */

require('dotenv').config();

const { GoogleGenAI } = require('@google/genai');

/** Matches server/services/gemini.ts when GEMINI_FLASH_MODEL is unset. */
const CODE_DEFAULT_FLASH_MODEL = 'gemini-2.5-flash';
const MIN_OUTPUT_TOKENS = 256;

function resolveModelUnderTest() {
  const override = (process.env.TEST_GEMINI_MODEL || '').trim();
  if (override) return override;
  const fromEnv = (process.env.GEMINI_FLASH_MODEL || '').trim();
  if (fromEnv) return fromEnv;
  return CODE_DEFAULT_FLASH_MODEL;
}

function resolveMaxOutputTokens() {
  const raw = Number(process.env.GEMINI_FLASH_SMOKE_MAX_OUTPUT_TOKENS || MIN_OUTPUT_TOKENS);
  if (!Number.isFinite(raw) || raw < MIN_OUTPUT_TOKENS) {
    return MIN_OUTPUT_TOKENS;
  }
  return Math.floor(raw);
}

function classifyFailure({ message, finishReason, text }) {
  const msg = String(message || '');
  if (/404|not found|NOT_FOUND/i.test(msg)) {
    return { code: 'MODEL_NOT_FOUND', detail: 'Model returned 404 / NOT_FOUND.' };
  }
  if (/403|permission|PERMISSION_DENIED|forbidden/i.test(msg)) {
    return { code: 'PERMISSION_DENIED', detail: 'API key or model access denied.' };
  }
  if (finishReason === 'MAX_TOKENS') {
    return {
      code: 'MAX_TOKENS',
      detail:
        'Response ended with MAX_TOKENS before visible text (increase maxOutputTokens; Gemini 3 Flash needs >= 256).',
    };
  }
  if (!text) {
    return { code: 'EMPTY_RESPONSE', detail: 'No text in model response.' };
  }
  if (msg) {
    return { code: 'API_ERROR', detail: msg.slice(0, 400) };
  }
  return { code: 'UNKNOWN', detail: 'Probe failed.' };
}

function logResult(payload) {
  console.log(JSON.stringify(payload));
}

async function probe(model, maxOutputTokens) {
  const apiKey = (process.env.GEMINI_API_KEY || '').trim();
  if (!apiKey) {
    console.error('FAIL: GEMINI_API_KEY is not set (key value is never printed).');
    process.exit(1);
  }

  const ai = new GoogleGenAI({ apiKey });
  const started = Date.now();

  try {
    const result = await ai.models.generateContent({
      model,
      contents: 'Reply with exactly one word: OK',
      config: {
        temperature: 0,
        maxOutputTokens,
      },
    });

    const text = String(result.text || '').trim();
    const finishReason = result.candidates?.[0]?.finishReason ?? null;
    const elapsedMs = Date.now() - started;

    if (!text) {
      const failure = classifyFailure({ message: '', finishReason, text });
      logResult({
        model,
        ok: false,
        elapsedMs,
        maxOutputTokens,
        finishReason,
        failureCode: failure.code,
        error: failure.detail,
      });
      return false;
    }

    logResult({
      model,
      ok: true,
      elapsedMs,
      maxOutputTokens,
      finishReason,
      textPreview: text.slice(0, 80),
    });
    return true;
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    const failure = classifyFailure({ message, finishReason: null, text: '' });
    logResult({
      model,
      ok: false,
      elapsedMs: Date.now() - started,
      maxOutputTokens,
      failureCode: failure.code,
      error: failure.detail,
      rawError: message.slice(0, 400),
    });
    return false;
  }
}

async function main() {
  const model = resolveModelUnderTest();
  const maxOutputTokens = resolveMaxOutputTokens();

  console.log('gemini_flash_smoke: start', {
    model,
    maxOutputTokens,
    geminiFlashModelEnv: Boolean((process.env.GEMINI_FLASH_MODEL || '').trim()),
    testOverride: Boolean((process.env.TEST_GEMINI_MODEL || '').trim()),
  });

  const ok = await probe(model, maxOutputTokens);
  if (ok) {
    console.log('PASS: Gemini Flash model is callable.');
    process.exit(0);
  }

  console.error('FAIL: Gemini Flash model probe failed (see JSON line above).');
  process.exit(1);
}

main().catch((err) => {
  console.error('FAIL:', err instanceof Error ? err.message : String(err));
  process.exit(1);
});
