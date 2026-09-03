/**
 * llm.ts — OpenAI LLM client for the AI Research Desk / StructuredAgent path.
 *
 * Set OPENAI_API_KEY in .env.local.
 * Override the model with OPENAI_MODEL (default: gpt-4o-mini) or the base URL
 * with OPENAI_BASE_URL.
 */

import { createOpenAI } from "@ai-sdk/openai";

export const OPENAI_MODEL = process.env.OPENAI_MODEL ?? "gpt-4o-mini";

/**
 * True when an LLM key is configured for the structured-agent path.
 */
export function hasLLM(): boolean {
  return Boolean(process.env.OPENAI_API_KEY && process.env.OPENAI_API_KEY.trim());
}

let cachedProvider: ReturnType<typeof createOpenAI> | null = null;

/**
 * Vercel AI SDK model for the StructuredAgent path (OpenAI).
 */
export function getModel(): ReturnType<ReturnType<typeof createOpenAI>> {
  if (!cachedProvider) {
    cachedProvider = createOpenAI({
      apiKey: process.env.OPENAI_API_KEY ?? "",
      baseURL: process.env.OPENAI_BASE_URL,
    });
  }
  return cachedProvider(OPENAI_MODEL);
}
