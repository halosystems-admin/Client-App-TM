import { GoogleGenAI } from '@google/genai';
import { config } from '../config';

// Current Gemini model names.
// Use env override if needed, but default to Gemini 2.5 Flash for speed.
export const PRO_MODEL = process.env.GEMINI_PRO_MODEL || 'gemini-3-pro-preview';
export const FLASH_MODEL = process.env.GEMINI_FLASH_MODEL || 'gemini-3-flash-preview';

export const MAX_RETRIES = 2;
export const BASE_RETRY_DELAY_MS = 2000;

/**
 * Timeout note:
 * The new @google/genai SDK does not use the old requestOptions object in the same way
 * as @google/generative-ai. We keep this constant for future gateway/timeout wiring.
 */
export const GEMINI_TIMEOUT_MS = 90_000;

if (!config.geminiApiKey) {
  throw new Error('[gemini] Missing GEMINI_API_KEY');
}

const ai = new GoogleGenAI({
  apiKey: config.geminiApiKey,
});

/**
 * Retry wrapper for Gemini API calls with exponential backoff.
 * Retries on 429 rate limit and 503 service unavailable errors.
 */
export async function withRetry<T>(
  fn: () => Promise<T>,
  maxRetries = MAX_RETRIES,
  delay = BASE_RETRY_DELAY_MS
): Promise<T> {
  let lastError: Error | undefined;

  for (let i = 0; i <= maxRetries; i++) {
    try {
      return await fn();
    } catch (error: unknown) {
      const err = error instanceof Error ? error : new Error(String(error));
      lastError = err;

      const message = err.message || '';
      const isRetryable =
        message.includes('429') ||
        message.includes('503') ||
        message.toLowerCase().includes('rate limit') ||
        message.toLowerCase().includes('overloaded');

      if (isRetryable && i < maxRetries) {
        const waitMs = delay * Math.pow(2, i);
        console.warn(`[gemini] Retryable error. Retrying in ${waitMs}ms...`);
        await new Promise((r) => setTimeout(r, waitMs));
        continue;
      }

      break;
    }
  }

  throw lastError;
}

/**
 * Safely parse JSON from Gemini responses, stripping markdown code fences.
 */
export function safeJsonParse<T>(text: string, fallback: T): T {
  try {
    const cleaned = text.replace(/```json|```/g, '').trim();
    return JSON.parse(cleaned) as T;
  } catch {
    return fallback;
  }
}

/**
 * Kept for compatibility with older code that may still call getTrackerModel().
 *
 * The old SDK returned a model object.
 * The new SDK uses ai.models.generateContent(...) directly.
 *
 * So this now returns the model name after logging useful routing info.
 */
export function getTrackerModel(
  modelType: string,
  userId: string,
  serviceName: string
): string {
  console.log('[gemini] getTrackerModel called', {
    modelType,
    userId,
    serviceName,
    gateway: 'disabled-local-direct-google',
  });

  return modelType;
}

/**
 * Generate text content.
 * Defaults to Flash for speed, but can be told to use Pro.
 */
export async function generateText(
  prompt: string,
  userId: string,
  serviceName: string,
  usePro: boolean = false
): Promise<string> {
  const modelName = usePro ? PRO_MODEL : FLASH_MODEL;

  getTrackerModel(modelName, userId, serviceName);

  console.log(`[gemini] Dispatching generateText request to ${modelName}...`);

  const result = await withRetry(() =>
    ai.models.generateContent({
      model: modelName,
      contents: prompt,
      config: {
        temperature: 0.2,
        maxOutputTokens: 4096,
      },
    })
  );

  return result.text || '';
}

/**
 * Stream text content.
 * Defaults to Flash for fast real-time note generation.
 */
export async function* generateTextStream(
  prompt: string,
  userId: string,
  serviceName: string,
  usePro: boolean = false
): AsyncGenerator<string> {
  const modelName = usePro ? PRO_MODEL : FLASH_MODEL;

  getTrackerModel(modelName, userId, serviceName);

  console.log(`[gemini] Dispatching streaming request to ${modelName}...`);

  const stream = await withRetry(() =>
    ai.models.generateContentStream({
      model: modelName,
      contents: prompt,
      config: {
        temperature: 0.2,
        maxOutputTokens: 4096,
      },
    })
  );

  console.log('[gemini] Network request resolved. Starting stream loop...');

  for await (const chunk of stream) {
    const text = chunk.text;

    if (text) {
      yield text;
    }
  }

  console.log('[gemini] Stream completed.');
}

/**
 * Generate content from an image.
 * Defaults to Pro since vision tasks may require heavier reasoning.
 */
export async function analyzeImage(
  prompt: string,
  base64Data: string,
  mimeType: string,
  userId: string,
  serviceName: string,
  usePro: boolean = true
): Promise<string> {
  const modelName = usePro ? PRO_MODEL : FLASH_MODEL;

  getTrackerModel(modelName, userId, serviceName);

  console.log(`[gemini] Dispatching image analysis request to ${modelName}...`);

  const result = await withRetry(() =>
    ai.models.generateContent({
      model: modelName,
      contents: [
        {
          role: 'user',
          parts: [
            { text: prompt },
            {
              inlineData: {
                data: base64Data,
                mimeType,
              },
            },
          ],
        },
      ],
      config: {
        temperature: 0.2,
        maxOutputTokens: 4096,
      },
    })
  );

  return result.text || '';
}

/**
 * Generate content from audio.
 * Defaults to Flash since transcription formatting is usually simpler.
 */
export async function transcribeAudio(
  prompt: string,
  base64Data: string,
  mimeType: string,
  userId: string,
  serviceName: string,
  usePro: boolean = false
): Promise<string> {
  const modelName = usePro ? PRO_MODEL : FLASH_MODEL;

  getTrackerModel(modelName, userId, serviceName);

  console.log(`[gemini] Dispatching audio request to ${modelName}...`);

  const result = await withRetry(() =>
    ai.models.generateContent({
      model: modelName,
      contents: [
        {
          role: 'user',
          parts: [
            { text: prompt },
            {
              inlineData: {
                data: base64Data,
                mimeType,
              },
            },
          ],
        },
      ],
      config: {
        temperature: 0.2,
        maxOutputTokens: 4096,
      },
    })
  );

  return result.text || '';
}