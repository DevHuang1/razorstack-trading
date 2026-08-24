import { createOpenAI } from "@ai-sdk/openai";
import type { LanguageModel } from "ai";
import type { AgentMessage } from "@/lib/contracts/research";

const DEFAULT_MODEL = "gpt-5.4-mini";

let cached: { openai: ReturnType<typeof createOpenAI>; modelId: string } | null = null;

export function hasLLM(): boolean {
  return Boolean(process.env.OPENAI_API_KEY);
}

export function getModel(): LanguageModel {
  if (!cached) {
    const openai = createOpenAI();
    cached = { openai, modelId: process.env.AI_MODEL ?? DEFAULT_MODEL };
  }
  return cached.openai(cached.modelId);
}

export function normalizeConfidence(value: number | null): number | null {
  if (value === null) return null;
  const pct = value <= 1 ? value * 100 : value;
  return Math.min(100, Math.max(0, Math.round(pct)));
}

export function normalizeText(value: string): string {
  return value
    .replace(/\\n/g, "\n")
    .replace(/\r/g, "")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

export function normalizeAgentMessage(message: AgentMessage): AgentMessage {
  return {
    ...message,
    headline: normalizeText(message.headline),
    body: normalizeText(message.body),
    keyPoints: message.keyPoints.map((point) => normalizeText(point)),
  };
}
