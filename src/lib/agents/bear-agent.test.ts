import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { generateText } from "ai";
import { AgentOpinionSchema, type AgentOpinion, type ThesisAgentInput } from "@/lib/contracts/research";
import { buildBearPrompt, buildFallbackBearOpinion, bearAgent } from "./bear-agent";
import {
  bearishInput,
  bullishInput,
  contradictoryInput,
  exposedPortfolioInput,
  insufficientInput,
} from "./test-debate-fixtures";

vi.mock("ai", () => ({
  generateText: vi.fn(),
  Output: { object: (schema: unknown) => ({ schema }) },
}));

const ORIGINAL_KEY = process.env.OPENAI_API_KEY;

const llmOutput: AgentOpinion = {
  symbol: "NVDA",
  stance: "bearish",
  confidence: 52,
  arguments: [{ kind: "interpretation", statement: "Catalyst is single-sourced and likely priced in" }],
  evidence: [{ kind: "observation", statement: "Bullish case rests on the Reuters earnings item" }],
  risks: [{ kind: "interpretation", statement: "If catalysts overdeliver, bear case is wrong" }],
  keyAssumptions: ["Bull assumes momentum persists"],
  invalidationConditions: ["Sentiment rises decisively"],
};

beforeEach(() => {
  vi.resetAllMocks();
  process.env.OPENAI_API_KEY = "test-key";
});

afterEach(() => {
  if (ORIGINAL_KEY === undefined) {
    delete process.env.OPENAI_API_KEY;
  } else {
    process.env.OPENAI_API_KEY = ORIGINAL_KEY;
  }
});

describe("bearAgent.run (LLM path, mocked)", () => {
  it("returns validated LLM output with adversarial rules in the system prompt", async () => {
    vi.mocked(generateText).mockResolvedValue({ output: llmOutput } as never);
    const result = await bearAgent.run(bullishInput);
    expect(result).toEqual(llmOutput);
    const call = vi.mocked(generateText).mock.calls[0][0];
    expect(call.system).toContain("INVALIDATE");
  });

  it("rejects a non-bearish stance and falls back to the deterministic bearish opinion", async () => {
    vi.mocked(generateText).mockResolvedValue({
      output: { ...llmOutput, stance: "neutral" },
    } as never);
    const result = await bearAgent.run(bullishInput);
    expect(result.stance).toBe("bearish");
    expect(vi.mocked(generateText)).toHaveBeenCalledTimes(2);
  });

  it("never sees the bull agent's answer — independence by construction", async () => {
    vi.mocked(generateText).mockResolvedValue({ output: llmOutput } as never);
    const leaked = {
      ...bullishInput,
      bullOpinion: { secret: "SECRET_BULL_MARKER" },
    } as ThesisAgentInput;
    await bearAgent.run(leaked);
    const prompt = vi.mocked(generateText).mock.calls[0][0].prompt as string;
    expect(prompt).not.toContain("SECRET_BULL_MARKER");
  });

  it("falls back deterministically after repeated failures", async () => {
    vi.mocked(generateText).mockRejectedValue(new Error("provider down"));
    const result = await bearAgent.run(bullishInput);
    expect(AgentOpinionSchema.parse(result)).toBeTruthy();
    expect(result.stance).toBe("bearish");
  });
});

describe("buildFallbackBearOpinion across the four evidence scenarios", () => {
  it("1. bullish evidence: attacks fragility of the actual cited catalyst, not generic risks", () => {
    const opinion = AgentOpinionSchema.parse(buildFallbackBearOpinion(bullishInput));
    expect(opinion.stance).toBe("bearish");
    expect(opinion.confidence).toBe(40);
    const text = JSON.stringify(opinion);
    expect(text).toContain("rests on");
    expect(text).toContain("Reuters");
    expect(text).toContain("information quality");
  });

  it("2. bearish evidence: dominant conviction grounded in the provided headwinds", () => {
    const opinion = AgentOpinionSchema.parse(buildFallbackBearOpinion(bearishInput));
    expect(opinion.confidence).toBe(76);
    const text = JSON.stringify(opinion);
    expect(text).toContain("Bloomberg");
    expect(text).toContain("margin pressure");
    expect(text).toContain("high");
  });

  it("3. contradictory evidence: conviction converges with the bull case", () => {
    const opinion = AgentOpinionSchema.parse(buildFallbackBearOpinion(contradictoryInput));
    expect(opinion.confidence).toBe(44);
    const text = JSON.stringify(opinion);
    expect(text).toContain("Bloomberg");
    expect(text).toContain("Reuters");
  });

  it("4. insufficient data: minimal confidence, sentinels propagated, structure intact", () => {
    const opinion = AgentOpinionSchema.parse(buildFallbackBearOpinion(insufficientInput));
    expect(opinion.confidence).toBe(15);
    expect(opinion.keyAssumptions.length).toBeGreaterThan(0);
    expect(opinion.invalidationConditions.length).toBeGreaterThan(0);
    expect(JSON.stringify(opinion)).toContain("insufficient_data");
  });

  it("ties portfolio concentration into the failure argument when exposure is high", () => {
    const opinion = buildFallbackBearOpinion(exposedPortfolioInput);
    expect(JSON.stringify(opinion.arguments)).toContain("40%");
  });
});

describe("buildBearPrompt", () => {
  it("demands evidence-referencing and forbids generic risks in the instructions", () => {
    const prompt = buildBearPrompt(bearishInput);
    expect(prompt).toContain("generic risks are forbidden");
    expect(prompt).toContain("$80");
  });
});
