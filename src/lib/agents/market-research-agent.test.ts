import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { generateText } from "ai";
import {
  MarketAnalysisSchema,
  type MarketAnalysis,
  type MarketSnapshot,
} from "@/lib/contracts/research";
import {
  buildFallbackMarketAnalysis,
  buildMarketResearchPrompt,
  marketResearchAgent,
} from "./market-research-agent";

vi.mock("ai", () => ({
  generateText: vi.fn(),
  Output: { object: (schema: unknown) => ({ schema }) },
}));

const ORIGINAL_KEY = process.env.OPENAI_API_KEY;

const bullSnapshot: MarketSnapshot = {
  symbol: "NVDA",
  price: 120,
  change1dPct: 0.8,
  change5dPct: 2.4,
  change1mPct: 18.06,
  rsi14: 62,
  sma20: 110,
  sma50: 100,
  realizedVol30dAnnPct: 28,
  sector: "Technology",
  regime: "risk_on",
};

const bearSnapshot: MarketSnapshot = {
  symbol: "XYZ",
  price: 80,
  change1dPct: -1.2,
  change5dPct: -4,
  change1mPct: -14,
  rsi14: 26,
  sma20: 92,
  sma50: 97,
  realizedVol30dAnnPct: 45,
  sector: "Energy",
  regime: "risk_off",
};

const llmOutput: MarketAnalysis = {
  symbol: "NVDA",
  trend: "up",
  momentum: "strongly_positive",
  volatilityRegime: "moderate",
  supportingObservations: [
    { kind: "observation", statement: "Latest price $120 versus 20-day SMA $110" },
  ],
  potentialConcerns: [],
  confidence: 81,
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

describe("marketResearchAgent.run (LLM path, mocked)", () => {
  it("returns validated LLM output and passes the grounding rules in prompts", async () => {
    vi.mocked(generateText).mockResolvedValue({ output: llmOutput } as never);
    const result = await marketResearchAgent.run({ symbol: "NVDA", snapshot: bullSnapshot });
    expect(result).toEqual(llmOutput);
    const call = vi.mocked(generateText).mock.calls[0][0];
    expect(call.system).toContain("NEVER invent numerical market data");
    expect(call.prompt).toContain("current price: 120");
    expect(call.prompt).toContain("latest volume: not_provided");
  });

  it("retries once after a transient failure before succeeding", async () => {
    vi.mocked(generateText)
      .mockRejectedValueOnce(new Error("rate limited"))
      .mockResolvedValueOnce({ output: llmOutput } as never);
    const result = await marketResearchAgent.run({ symbol: "NVDA", snapshot: bullSnapshot });
    expect(result.symbol).toBe("NVDA");
    expect(vi.mocked(generateText)).toHaveBeenCalledTimes(2);
  });

  it("falls back deterministically after repeated failures", async () => {
    vi.mocked(generateText)
      .mockRejectedValue(new Error("provider down"));
    const result = await marketResearchAgent.run({ symbol: "NVDA", snapshot: bullSnapshot });
    expect(MarketAnalysisSchema.parse(result)).toBeTruthy();
    expect(result.trend).toBe("up");
    expect(result.supportingObservations.length).toBeGreaterThan(0);
  });

  it("skips the LLM entirely when no API key is configured", async () => {
    delete process.env.OPENAI_API_KEY;
    const result = await marketResearchAgent.run({ symbol: "NVDA", snapshot: bullSnapshot });
    expect(generateText).not.toHaveBeenCalled();
    expect(result.trend).toBe("up");
  });

  it("rejects invalid input instead of guessing", async () => {
    await expect(
      marketResearchAgent.run({
        symbol: "NVDA",
        snapshot: { ...bullSnapshot, price: "lots" as unknown as number },
      }),
    ).rejects.toThrow();
    expect(generateText).not.toHaveBeenCalled();
  });
});

describe("buildFallbackMarketAnalysis", () => {
  it("derives an uptrend reading from a bullish snapshot without inventing data", () => {
    const analysis = buildFallbackMarketAnalysis({ symbol: "NVDA", snapshot: bullSnapshot });
    expect(analysis).toEqual(
      expect.objectContaining({ trend: "up", momentum: "strongly_positive", volatilityRegime: "moderate" }),
    );
    const statements = analysis.supportingObservations.map((s) => s.statement).join(" ");
    expect(statements).toContain("$120");
    expect(statements).toContain("18.06%");
    expect(statements).toContain("RSI(14) at 62");
  });

  it("carries the snapshot sector through for downstream portfolio checks", () => {
    const analysis = buildFallbackMarketAnalysis({ symbol: "NVDA", snapshot: bullSnapshot });
    expect(analysis.sector).toBe(bullSnapshot.sector);
  });

  it("derives a downtrend reading with high volatility from a bearish snapshot", () => {
    const analysis = buildFallbackMarketAnalysis({ symbol: "XYZ", snapshot: bearSnapshot });
    expect(analysis).toEqual(
      expect.objectContaining({ trend: "down", momentum: "strongly_negative", volatilityRegime: "high" }),
    );
    const concerns = analysis.potentialConcerns.map((c) => c.statement).join(" ");
    expect(concerns).toContain("oversold");
  });

  it("flags insufficient_data for missing volume instead of making it up", () => {
    const analysis = buildFallbackMarketAnalysis({ symbol: "NVDA", snapshot: bullSnapshot });
    const concerns = analysis.potentialConcerns.map((c) => c.statement).join(" ");
    expect(concerns).toContain("insufficient_data");
    expect(concerns.toLowerCase()).toContain("volume");
  });

  it("cites volume observations when both volume figures are provided", () => {
    const analysis = buildFallbackMarketAnalysis({
      symbol: "NVDA",
      snapshot: { ...bullSnapshot, latestVolume: 42_500_000, averageVolume30d: 38_000_000 },
    });
    const statements = analysis.supportingObservations.map((s) => s.statement).join(" ");
    expect(statements).toContain("42500000");
    expect(analysis.potentialConcerns.map((c) => c.statement).join(" ")).not.toContain(
      "insufficient_data",
    );
  });

  it("marks sideways trend when moving averages disagree", () => {
    const mixed = buildFallbackMarketAnalysis({
      symbol: "MIX",
      snapshot: { ...bullSnapshot, price: 105, sma20: 110, sma50: 100 },
    });
    expect(mixed.trend).toBe("sideways");
  });
});

describe("buildMarketResearchPrompt", () => {
  it("renders every provided field verbatim and marks absent ones", () => {
    const prompt = buildMarketResearchPrompt({ symbol: "NVDA", snapshot: bullSnapshot });
    expect(prompt).toContain("- current price: 120");
    expect(prompt).toContain("- sector: Technology");
    expect(prompt).toContain("- average 30-day volume: not_provided");
    expect(prompt).toContain("insufficient_data");
  });
});
