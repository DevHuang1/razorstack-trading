/**
 * llm.ts — Grok (xAI) LLM client for the AI Research Desk / StructuredAgent path.
 *
 * Set XAI_API_KEY in .env.local (or the legacy GROK_API_KEY / OPENAI_API_KEY).
 * Override the model with GROK_MODEL (default: grok-3-mini-fast) or the base URL
 * with XAI_BASE_URL.
 */

import { createOpenAI } from "@ai-sdk/openai";

// xAI serves an OpenAI-compatible wire protocol, so we reuse the OpenAI provider
// and just repoint baseURL. Key resolution: XAI_API_KEY -> GROK_API_KEY -> OPENAI_API_KEY.
function apiKey(): string {
  return (
    process.env.XAI_API_KEY ??
    process.env.GROK_API_KEY ??
    process.env.OPENAI_API_KEY ??
    ""
  ).trim();
}

export const OPENAI_MODEL =
  process.env.GROK_MODEL ?? process.env.OPENAI_MODEL ?? "grok-3-mini-fast";

/**
 * True when an LLM key is configured for the structured-agent path.
 */
export function hasLLM(): boolean {
  return Boolean(apiKey());
}

let cachedProvider: ReturnType<typeof createOpenAI> | null = null;

/**
 * Vercel AI SDK model for the StructuredAgent path (Grok / xAI).
 */
export function getModel(): ReturnType<ReturnType<typeof createOpenAI>> {
  if (!cachedProvider) {
    cachedProvider = createOpenAI({
      apiKey: apiKey(),
      baseURL: process.env.XAI_BASE_URL ?? process.env.OPENAI_BASE_URL ?? "https://api.x.ai/v1",
    });
  }
  return cachedProvider(OPENAI_MODEL);
}
