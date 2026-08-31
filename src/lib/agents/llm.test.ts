import { afterEach, describe, expect, it } from "vitest";
import { hasLLM } from "./llm";

const ORIGINAL_KEY = process.env.OPENAI_API_KEY;

afterEach(() => {
  if (ORIGINAL_KEY === undefined) {
    delete process.env.OPENAI_API_KEY;
  } else {
    process.env.OPENAI_API_KEY = ORIGINAL_KEY;
  }
});

describe("hasLLM", () => {
  it("is false when the key is missing or empty", () => {
    delete process.env.OPENAI_API_KEY;
    expect(hasLLM()).toBe(false);
    process.env.OPENAI_API_KEY = "";
    expect(hasLLM()).toBe(false);
  });

  it("is true when a key is present", () => {
    process.env.OPENAI_API_KEY = "test-key";
    expect(hasLLM()).toBe(true);
  });
});
