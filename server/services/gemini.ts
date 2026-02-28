import { GoogleGenerativeAI } from '@google/generative-ai';
import { config } from '../config';

// Define both models so we can route tasks intelligently
export const PRO_MODEL = 'gemini-3-pro-preview';
export const FLASH_MODEL = 'gemini-3-flash-preview'; 

export const MAX_RETRIES = 2;
export const BASE_RETRY_DELAY_MS = 2000;
/** Timeout for Gemini API calls (15–50s typical; allow up to 90s including retries) */
export const GEMINI_TIMEOUT_MS = 90_000;

/**
 * Initializes the Gemini model. 
 * NOTE: Halo Gateway routing is temporarily disabled until the Heroku backend 
 * is updated to support Gemini requests.
 */
export function getTrackerModel(modelType: string, userId: string, serviceName: string) {
  const genAI = new GoogleGenerativeAI(config.geminiApiKey);
  
  // --- HALO GATEWAY (TEMPORARILY DISABLED) ---
  // When the senior updates the gateway, simply uncomment the baseUrl and customHeaders below:
  const requestOptions = {
    // baseUrl: 'https://halo-tracker-2c0dda3c06ff.herokuapp.com',
    // customHeaders: {
    //   'x-user-id': userId,
    //   'x-service-name': serviceName
    // },
    timeout: GEMINI_TIMEOUT_MS
  };

  // Currently pointing directly to Google's default URL so your app works locally
  return genAI.getGenerativeModel({ model: modelType }, requestOptions);
}

/**
 * Retry wrapper for Gemini API calls with exponential backoff.
 * Retries on 429 (rate limit) and 503 (service unavailable).
 */
export async function withRetry<T>(fn: () => Promise<T>, maxRetries = MAX_RETRIES, delay = BASE_RETRY_DELAY_MS): Promise<T> {
  let lastError: Error | undefined;
  for (let i = 0; i <= maxRetries; i++) {
    try {
      return await fn();
    } catch (error: unknown) {
      const err = error instanceof Error ? error : new Error(String(error));
      lastError = err;
      const isRetryable = err.message?.includes('429') || err.message?.includes('503');
      if (isRetryable && i < maxRetries) {
        await new Promise((r) => setTimeout(r, delay * Math.pow(2, i)));
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
 * Generate text content. Defaults to Flash for speed, but can be told to use Pro.
 */
export async function generateText(prompt: string, userId: string, serviceName: string, usePro: boolean = false): Promise<string> {
  const modelName = usePro ? PRO_MODEL : FLASH_MODEL;
  const model = getTrackerModel(modelName, userId, serviceName);
  const result = await withRetry(() =>
    model.generateContent(prompt)
  );
  return result.response.text();
}

/**
 * Stream text content. Defaults to Flash for incredibly fast real-time chat.
 */
export async function* generateTextStream(prompt: string, userId: string, serviceName: string, usePro: boolean = false): AsyncGenerator<string> {
  const modelName = usePro ? PRO_MODEL : FLASH_MODEL;
  const model = getTrackerModel(modelName, userId, serviceName);
  const result = await withRetry(() =>
    model.generateContentStream(prompt)
  );
  for await (const chunk of result.stream) {
    const text = chunk.text?.();
    if (text) yield text;
  }
}

/**
 * Generate content from an image. Defaults to Pro since vision tasks require heavier reasoning.
 */
export async function analyzeImage(prompt: string, base64Data: string, mimeType: string, userId: string, serviceName: string, usePro: boolean = true): Promise<string> {
  const modelName = usePro ? PRO_MODEL : FLASH_MODEL;
  const model = getTrackerModel(modelName, userId, serviceName);
  const result = await withRetry(() =>
    model.generateContent([prompt, { inlineData: { data: base64Data, mimeType } }])
  );
  return result.response.text();
}

/**
 * Generate content from audio. Defaults to Flash since transcription formatting is a simple task.
 */
export async function transcribeAudio(prompt: string, base64Data: string, mimeType: string, userId: string, serviceName: string, usePro: boolean = false): Promise<string> {
  const modelName = usePro ? PRO_MODEL : FLASH_MODEL;
  const model = getTrackerModel(modelName, userId, serviceName);
  const result = await withRetry(() =>
    model.generateContent([prompt, { inlineData: { data: base64Data, mimeType } }])
  );
  return result.response.text();
}