/**
 * llm.ts — Anthropic Claude client for the Research Desk agents
 *
 * Set ANTHROPIC_API_KEY in .env.local.
 * Override the model with ANTHROPIC_MODEL (default: claude-3-5-sonnet-20241022).
 */

export const MODEL =
  process.env.ANTHROPIC_MODEL ?? "claude-3-5-sonnet-20241022";

const ANTHROPIC_BASE = "https://api.anthropic.com";
const API_VERSION = "2023-06-01";

interface AnthropicContent {
  type: string;
  text?: string;
}

interface AnthropicResponse {
  content: AnthropicContent[];
  stop_reason: string;
}

export class LLMError extends Error {
  constructor(
    message: string,
    public readonly statusCode?: number,
  ) {
    super(message);
    this.name = "LLMError";
  }
}

/**
 * Call Claude and return the raw text response.
 */
export async function askClaude(
  systemPrompt: string,
  userContent: string,
  maxTokens = 2048,
): Promise<string> {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) throw new LLMError("ANTHROPIC_API_KEY is not set");

  const res = await fetch(`${ANTHROPIC_BASE}/v1/messages`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-api-key": apiKey,
      "anthropic-version": API_VERSION,
    },
    body: JSON.stringify({
      model: MODEL,
      max_tokens: maxTokens,
      system: systemPrompt,
      messages: [{ role: "user", content: userContent }],
    }),
  });

  if (!res.ok) {
    const body = await res.text().catch(() => "");
    throw new LLMError(
      `Anthropic API error ${res.status}: ${body}`,
      res.status,
    );
  }

  const data = (await res.json()) as AnthropicResponse;
  const textBlock = data.content.find((b) => b.type === "text");
  if (!textBlock?.text) throw new LLMError("Claude returned no text content");
  return textBlock.text;
}

/**
 * Call Claude and parse the response as JSON.
 * The system prompt must instruct Claude to respond with valid JSON only.
 */
export async function askClaudeJson<T>(
  systemPrompt: string,
  userContent: string,
  maxTokens = 2048,
): Promise<T> {
  const raw = await askClaude(systemPrompt, userContent, maxTokens);
  // Strip markdown code fences if present
  const cleaned = raw
    .replace(/^```(?:json)?\s*/m, "")
    .replace(/\s*```\s*$/m, "")
    .trim();
  try {
    return JSON.parse(cleaned) as T;
  } catch {
    throw new LLMError(
      `Claude response was not valid JSON: ${cleaned.slice(0, 300)}`,
    );
  }
}
