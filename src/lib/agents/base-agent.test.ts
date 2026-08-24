import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { z } from "zod";

const generateTextMock = vi.fn();

vi.mock("ai", () => ({
  generateText: (...args: unknown[]) => generateTextMock(...args),
  Output: { object: (schema: unknown) => ({ schema }) },
}));

import { StructuredAgent } from "./base-agent";

const outputSchema = z.object({ value: z.number() });

function makeAgent(overrides: Partial<Parameters<typeof buildAgent>[0]> = {}) {
  return buildAgent({ maxAttempts: 2, ...overrides });
}

function buildAgent(config: { maxAttempts?: number; validate?: (out: { value: number }) => void }) {
  return new StructuredAgent({
    name: "TestAgent",
    role: "news",
    description: "test agent",
    systemPrompt: "sys",
    inputSchema: z.object({ n: z.number() }),
    outputSchema,
    buildPrompt: () => "prompt",
    fallback: () => ({ value: 42 }),
    maxAttempts: config.maxAttempts,
    validate: config.validate,
  });
}

beforeEach(() => {
  process.env.OPENAI_API_KEY = "test-key";
  generateTextMock.mockReset();
});

afterEach(() => {
  delete process.env.OPENAI_API_KEY;
});

describe("StructuredAgent LLM path", () => {
  it("passes an abort signal to every generateText call", async () => {
    generateTextMock.mockResolvedValue({ output: { value: 7 } });
    const agent = makeAgent();
    await expect(agent.run({ n: 1 })).resolves.toEqual({ value: 7 });
    expect(generateTextMock).toHaveBeenCalledTimes(1);
    expect(generateTextMock.mock.calls[0][0].abortSignal).toBeInstanceOf(AbortSignal);
  });

  it("retries failed attempts, then falls back loudly", async () => {
    generateTextMock.mockRejectedValue(new Error("provider down"));
    const agent = makeAgent();
    await expect(agent.run({ n: 1 })).resolves.toEqual({ value: 42 });
    expect(generateTextMock).toHaveBeenCalledTimes(2);
  });

  it("treats a grounding-validation failure as a failed attempt", async () => {
    generateTextMock.mockResolvedValue({ output: { value: 99 } });
    const agent = makeAgent({
      validate: (out) => {
        if (out.value > 50) throw new Error("ungrounded");
      },
    });
    await expect(agent.run({ n: 1 })).resolves.toEqual({ value: 42 });
    expect(generateTextMock).toHaveBeenCalledTimes(2);
  });

  it("rescales fraction-scale confidence to the 0-100 contract", async () => {
    generateTextMock.mockResolvedValue({ output: { confidence: 0.82 } });
    const agent = new StructuredAgent({
      name: "TestAgent",
      role: "news",
      description: "test agent",
      systemPrompt: "sys",
      inputSchema: z.object({ n: z.number() }),
      outputSchema: z.object({ confidence: z.number().min(0).max(100) }),
      buildPrompt: () => "prompt",
      fallback: () => ({ confidence: 40 }),
    });
    await expect(agent.run({ n: 1 })).resolves.toEqual({ confidence: 82 });
  });

  it("uses the deterministic fallback immediately when no key is configured", async () => {
    delete process.env.OPENAI_API_KEY;
    const agent = makeAgent();
    await expect(agent.run({ n: 1 })).resolves.toEqual({ value: 42 });
    expect(generateTextMock).not.toHaveBeenCalled();
  });
});
