import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { generateText } from "ai";
import { AgentOpinionSchema, type AgentOpinion, type ThesisAgentInput } from "@/lib/contracts/research";
import { buildBullPrompt, buildFallbackBullOpinion, bullAgent } from "./bull-agent";
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
  stance: "bullish",
  confidence: 74,
  arguments: [{ kind: "interpretation", statement: "Aligned trend and news support upside" }],
  evidence: [
    { kind: "observation", statement: "Market analysis: Latest price $120 versus 20-day SMA $110" },
  ],
  risks: [],
  keyAssumptions: ["Momentum persists"],
  invalidationConditions: ["Trend label flips"],
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

describe("bullAgent.run (LLM path, mocked)", () => {
  it("returns validated LLM output and feeds both analyses verbatim", async () => {
    vi.mocked(generateText).mockResolvedValue({ output: llmOutput } as never);
    const result = await bullAgent.run(bullishInput);
    expect(result).toEqual(llmOutput);
    const call = vi.mocked(generateText).mock.calls[0][0];
    expect(call.system).toContain("STRONGEST evidence-based BULLISH thesis");
    expect(call.prompt).toContain("MARKET ANALYSIS");
    expect(call.prompt).toContain("Reuters");
  });

  it("retries once after a transient failure before succeeding", async () => {
    vi.mocked(generateText)
      .mockRejectedValueOnce(new Error("rate limited"))
      .mockResolvedValueOnce({ output: llmOutput } as never);
    const result = await bullAgent.run(bullishInput);
    expect(result.stance).toBe("bullish");
    expect(vi.mocked(generateText)).toHaveBeenCalledTimes(2);
  });

  it("rejects a non-bullish stance and falls back to the deterministic bullish opinion", async () => {
    vi.mocked(generateText).mockResolvedValue({
      output: { ...llmOutput, stance: "neutral" },
    } as never);
    const result = await bullAgent.run(bullishInput);
    expect(result.stance).toBe("bullish");
    expect(result.confidence).toBe(76);
    expect(vi.mocked(generateText)).toHaveBeenCalledTimes(2);
  });

  it("skips the LLM entirely when no API key is configured", async () => {
    delete process.env.OPENAI_API_KEY;
    const result = await bullAgent.run(bullishInput);
    expect(generateText).not.toHaveBeenCalled();
    expect(result.confidence).toBe(76);
  });

  it("rejects invalid input instead of guessing", async () => {
    const broken = {
      ...bullishInput,
      marketAnalysis: { ...bullishInput.marketAnalysis, trend: 7 as unknown as "up" },
    };
    await expect(bullAgent.run(broken)).rejects.toThrow();
    expect(generateText).not.toHaveBeenCalled();
  });
});

describe("buildFallbackBullOpinion across the four evidence scenarios", () => {
  it("1. bullish evidence: high conviction grounded in the provided catalysts", () => {
    const opinion = AgentOpinionSchema.parse(buildFallbackBullOpinion(bullishInput));
    expect(opinion.stance).toBe("bullish");
    expect(opinion.confidence).toBe(76);
    const text = JSON.stringify(opinion);
    expect(text).toContain("Reuters");
    expect(text).toContain("$120");
  });

  it("2. bearish evidence: weak conviction but still the required competing thesis", () => {
    const opinion = AgentOpinionSchema.parse(buildFallbackBullOpinion(bearishInput));
    expect(opinion.stance).toBe("bullish");
    expect(opinion.confidence).toBe(40);
    expect(JSON.stringify(opinion)).toContain("margin pressure");
  });

  it("3. contradictory evidence: conviction converges toward the bear case", () => {
    const opinion = AgentOpinionSchema.parse(buildFallbackBullOpinion(contradictoryInput));
    expect(opinion.confidence).toBe(56);
    const text = JSON.stringify(opinion);
    expect(text).toContain("Reuters");
    expect(text).toContain("Bloomberg");
  });

  it("4. insufficient data: minimal confidence, sentinels propagated, no invented specifics", () => {
    const opinion = AgentOpinionSchema.parse(buildFallbackBullOpinion(insufficientInput));
    expect(opinion.confidence).toBe(15);
    expect(opinion.keyAssumptions.length).toBeGreaterThan(0);
    expect(opinion.invalidationConditions.length).toBeGreaterThan(0);
    expect(JSON.stringify(opinion)).toContain("insufficient_data");
  });

  it("flags concentration risk when portfolio exposure is high", () => {
    const opinion = buildFallbackBullOpinion(exposedPortfolioInput);
    expect(JSON.stringify(opinion.risks)).toContain("concentration");
  });
});

describe("buildBullPrompt", () => {
  it("includes portfolio context only when provided", () => {
    expect(buildBullPrompt(exposedPortfolioInput)).toContain("PORTFOLIO CONTEXT");
    expect(buildBullPrompt(bullishInput)).not.toContain("PORTFOLIO CONTEXT");
  });

  it("never includes other agents' output — independence by construction", () => {
    const leaked = {
      ...bullishInput,
      bullOpinion: { secret: "SECRET_BULL_MARKER" },
    } as ThesisAgentInput;
    const prompt = buildBullPrompt(leaked);
    expect(prompt).not.toContain("SECRET_BULL_MARKER");
  });
});
