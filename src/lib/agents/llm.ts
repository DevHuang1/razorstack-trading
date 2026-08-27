import { createOpenAI } from "@ai-sdk/openai";
import type { LanguageModel } from "ai";

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
