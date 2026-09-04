import { afterEach, describe, expect, it } from "vitest";
import { hasLLM } from "./llm";

const KEYS = ["GROQ_API_KEY", "XAI_API_KEY", "GROK_API_KEY", "OPENAI_API_KEY"] as const;
const ORIGINAL: Record<string, string | undefined> = {};
for (const k of KEYS) ORIGINAL[k] = process.env[k];

afterEach(() => {
  for (const k of KEYS) {
    if (ORIGINAL[k] === undefined) delete process.env[k];
    else process.env[k] = ORIGINAL[k];
  }
});

describe("hasLLM", () => {
  it("is false when every key is missing or empty", () => {
    for (const k of KEYS) delete process.env[k];
    expect(hasLLM()).toBe(false);
    for (const k of KEYS) process.env[k] = "";
    expect(hasLLM()).toBe(false);
  });

  it("is true when GROQ_API_KEY is present", () => {
    process.env.GROQ_API_KEY = "gsk-test-key";
    expect(hasLLM()).toBe(true);
  });

  it("is true when XAI_API_KEY is present", () => {
    process.env.XAI_API_KEY = "xai-test-key";
    expect(hasLLM()).toBe(true);
  });

  it("is true when GROK_API_KEY is present", () => {
    process.env.GROK_API_KEY = "grok-test-key";
    expect(hasLLM()).toBe(true);
  });

  it("is true when only the legacy OPENAI_API_KEY is present", () => {
    process.env.OPENAI_API_KEY = "test-key";
    expect(hasLLM()).toBe(true);
  });
});
