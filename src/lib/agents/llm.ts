/**
 * llm.ts — Groq LLM client for the AI Research Desk / StructuredAgent path.
 *
 * Set GROQ_API_KEY in .env.local. Override the model with GROQ_MODEL
 * (default: openai/gpt-oss-20b) or the base URL with GROQ_BASE_URL.
 */

import { createOpenAI } from "@ai-sdk/openai";

// Groq serves an OpenAI-compatible wire protocol, so we reuse the OpenAI provider
// and just repoint baseURL. Key resolution: GROQ_API_KEY -> legacy XAI_API_KEY ->
// GROK_API_KEY -> OPENAI_API_KEY so existing setups keep working.
function apiKey(): string {
  return (
    process.env.GROQ_API_KEY ??
    process.env.XAI_API_KEY ??
    process.env.GROK_API_KEY ??
    process.env.OPENAI_API_KEY ??
    ""
  ).trim();
}

export const OPENAI_MODEL =
  process.env.GROQ_MODEL ?? process.env.OPENAI_MODEL ?? "openai/gpt-oss-20b";

/**
 * True when an LLM key is configured for the structured-agent path.
 */
export function hasLLM(): boolean {
  return Boolean(apiKey());
}

let cachedProvider: ReturnType<typeof createOpenAI> | null = null;

/**
 * Vercel AI SDK model for the StructuredAgent path (Groq).
 */
export function getModel(): ReturnType<ReturnType<typeof createOpenAI>> {
  if (!cachedProvider) {
    cachedProvider = createOpenAI({
      apiKey: apiKey(),
      baseURL:
        process.env.GROQ_BASE_URL ??
        process.env.OPENAI_BASE_URL ??
        "https://api.groq.com/openai/v1",
    });
  }
  return cachedProvider(OPENAI_MODEL);
}
