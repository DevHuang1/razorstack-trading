import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { generateText } from "ai";
import {
  TradeProposalSchema,
  type CommitteeInput,
  type DebateResult,
  type TradeProposal,
} from "@/lib/contracts/research";
import { buildCommitteePrompt, buildFallbackCommitteeProposal, buildPortfolioConsiderations, investmentCommitteeAgent } from "./investment-committee-agent";
import { buildFallbackBullOpinion } from "./bull-agent";
import { buildFallbackBearOpinion } from "./bear-agent";
import {
  bearishInput,
  bullishInput,
  contradictoryInput,
  exposedPortfolioContext,
  insufficientInput,
} from "./test-debate-fixtures";

vi.mock("ai", () => ({
  generateText: vi.fn(),
  Output: { object: (schema: unknown) => ({ schema }) },
}));

const ORIGINAL_KEY = process.env.OPENAI_API_KEY;

function committeeInputFrom(debate: typeof bullishInput): CommitteeInput {
  return {
    symbol: debate.symbol,
    marketAnalysis: debate.marketAnalysis,
    newsAnalysis: debate.newsAnalysis,
    bullOpinion: buildFallbackBullOpinion(debate),
    bearOpinion: buildFallbackBearOpinion(debate),
  };
}

const llmDebate: DebateResult = {
  symbol: "NVDA",
  bullCase: [{ kind: "interpretation", statement: "Bull claims trend confirmation" }],
  bearCase: [{ kind: "interpretation", statement: "Bear cites margin pressure" }],
  pointsOfAgreement: [],
  pointsOfDisagreement: [{ kind: "interpretation", statement: "Split is over catalyst durability" }],
  strongestEvidence: [{ kind: "observation", statement: "Earnings beat (source: Reuters)" }],
  weakestEvidence: [],
  unresolvedQuestions: ["Do catalysts outweigh headwinds before expiry?"],
  finalThesis: "Bullish reading prevails.",
  confidence: 67,
};

const llmOutput: TradeProposal = {
  symbol: "NVDA",
  action: "BUY",
  strategy: "bull_call_spread",
  instrument: null,
  thesis: "Bullish reading prevails; proposal requires risk approval.",
  confidence: 67,
  supportingFactors: [{ kind: "interpretation", statement: "Aligned labels" }],
  contradictingFactors: [],
  risks: [],
  invalidationConditions: ["Trend label flips"],
  suggestedHoldingPeriod: "Days to ~2 weeks",
  evidenceQuality: "high",
  requiresRiskApproval: true,
  debate: llmDebate,
  portfolioConsiderations: [],
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

describe("investmentCommitteeAgent.run (LLM path, mocked)", () => {
  it("returns validated output and feeds all four artifacts verbatim", async () => {
    const input = committeeInputFrom(bullishInput);
    vi.mocked(generateText).mockResolvedValue({ output: llmOutput } as never);
    const result = await investmentCommitteeAgent.run(input);
    expect(result).toEqual(llmOutput);
    const call = vi.mocked(generateText).mock.calls[0][0];
    expect(call.system).toContain("NOT an executable order");
    expect(call.system).toContain("no fabricated dialogue");
    expect(call.system).toContain("What does the BullAgent believe");
    expect(call.system).toContain("NEVER calculate or enforce final risk limits");
    expect(call.prompt).toContain("BULL ADVOCATE OPINION");
    expect(call.prompt).toContain("BEAR ADVOCATE OPINION");
    expect(call.prompt).toContain("set instrument to null");
  });

  it("retries once after a transient failure before succeeding", async () => {
    vi.mocked(generateText)
      .mockRejectedValueOnce(new Error("rate limited"))
      .mockResolvedValueOnce({ output: llmOutput } as never);
    const result = await investmentCommitteeAgent.run(committeeInputFrom(bullishInput));
    expect(result.requiresRiskApproval).toBe(true);
    expect(vi.mocked(generateText)).toHaveBeenCalledTimes(2);
  });

  it("falls back deterministically after repeated failures", async () => {
    vi.mocked(generateText).mockRejectedValue(new Error("provider down"));
    const result = await investmentCommitteeAgent.run(committeeInputFrom(bullishInput));
    expect(TradeProposalSchema.parse(result)).toBeTruthy();
  });

  it("rejects malformed input before any LLM call", async () => {
    const broken = committeeInputFrom(bullishInput);
    delete (broken as Partial<CommitteeInput>).bearOpinion;
    await expect(investmentCommitteeAgent.run(broken as CommitteeInput)).rejects.toThrow();
    expect(generateText).not.toHaveBeenCalled();
  });
});

describe("buildFallbackCommitteeProposal synthesis behavior", () => {
  it("1. aligned bullish evidence → BUY with defined-risk spread and grounded factors", () => {
    const proposal = buildFallbackCommitteeProposal(committeeInputFrom(bullishInput));
    expect(proposal).toMatchObject({ action: "BUY", strategy: "bull_call_spread", evidenceQuality: "high", confidence: 67 });
    expect(JSON.stringify(proposal.supportingFactors)).toContain("Reuters");
    expect(proposal.invalidationConditions.length).toBeGreaterThanOrEqual(2);
    expect(proposal.thesis).toContain("not an executed or executable order");
  });

  it("2. aligned bearish evidence → SELL without rubber-stamping the bull", () => {
    const proposal = buildFallbackCommitteeProposal(committeeInputFrom(bearishInput));
    expect(proposal).toMatchObject({ action: "SELL", strategy: "bear_put_spread", confidence: 67 });
    expect(JSON.stringify(proposal.supportingFactors)).toContain("margin pressure");
  });

  it("3. contradictory evidence → NO_TRADE despite a confident bull advocate", () => {
    const proposal = buildFallbackCommitteeProposal(committeeInputFrom(contradictoryInput));
    expect(proposal.action).toBe("NO_TRADE");
    expect(proposal.strategy).toBe("no_trade");
    expect(proposal.confidence).toBe(55);
    expect(proposal.thesis).toContain("Capital preservation preferred");
  });

  it("4. insufficient data → NO_TRADE with degraded holding-period guidance", () => {
    const proposal = buildFallbackCommitteeProposal(committeeInputFrom(insufficientInput));
    expect(proposal).toMatchObject({
      action: "NO_TRADE",
      evidenceQuality: "insufficient",
      instrument: null,
      suggestedHoldingPeriod: "Not applicable - no position recommended",
    });
    expect(proposal.confidence).toBe(26);
  });

  it("never follows a confident advocate when evidence quality is insufficient (anti-herding gate)", () => {
    const input = committeeInputFrom(insufficientInput);
    input.bullOpinion = { ...input.bullOpinion, confidence: 88 };
    input.bearOpinion = { ...input.bearOpinion, confidence: 20 };
    const proposal = buildFallbackCommitteeProposal(input);
    expect(proposal.action).toBe("NO_TRADE");
    expect(proposal.confidence).toBeLessThanOrEqual(45);
  });

  it("prefers HOLD over NO_TRADE when an existing position exists in the middle zone", () => {
    const input = { ...committeeInputFrom(contradictoryInput), portfolioContext: exposedPortfolioContext };
    const proposal = buildFallbackCommitteeProposal(input);
    expect(proposal.action).toBe("HOLD");
    expect(proposal.instrument).toBeNull();
  });

  it("always gates the proposal behind risk approval and never fabricates instruments", () => {
    for (const debate of [bullishInput, bearishInput, contradictoryInput, insufficientInput]) {
      const proposal = buildFallbackCommitteeProposal(committeeInputFrom(debate));
      expect(proposal.requiresRiskApproval).toBe(true);
      expect(proposal.instrument).toBeNull();
      expect(proposal.invalidationConditions.length).toBeGreaterThan(0);
    }
  });
});

describe("buildFallbackDebateResult synthesis behavior", () => {
  it("1. bull and bear strongly agree → agreement recorded, middle-zone action", () => {
    const input = committeeInputFrom(bullishInput);
    input.bearOpinion = { ...input.bearOpinion, confidence: 74 };
    const proposal = buildFallbackCommitteeProposal(input);
    expect(proposal.action).toBe("NO_TRADE");
    const { debate } = proposal;
    expect(debate.pointsOfAgreement.some((a) => a.statement.includes("nearly balanced"))).toBe(true);
    expect(debate.confidence).toBe(proposal.confidence);
  });

  it("2. bull and bear strongly disagree → split quantified, action still taken on conviction gap", () => {
    const input = committeeInputFrom(bullishInput);
    const { debate } = buildFallbackCommitteeProposal(input);
    expect(input.bullOpinion.confidence - input.bearOpinion.confidence).toBeGreaterThan(12);
    expect(debate.pointsOfDisagreement[0].statement).toContain("-point conviction gap (76% vs 40%)");
    expect(debate.finalThesis.length).toBeGreaterThan(0);
  });

  it("3. insufficient evidence → unresolved questions expose the gaps and block trading", () => {
    const { debate } = buildFallbackCommitteeProposal(committeeInputFrom(insufficientInput));
    expect(debate.unresolvedQuestions.length).toBeGreaterThanOrEqual(2);
    expect(debate.weakestEvidence.some((e) => e.statement.includes('"insufficient"'))).toBe(true);
  });

  it("4. news conflicts with market data → disagreement is evidential, not stylistic", () => {
    const { debate } = buildFallbackCommitteeProposal(committeeInputFrom(contradictoryInput));
    expect(debate.pointsOfDisagreement[0].statement).toContain("news contradicts the market-data reading");
  });

  it("never fabricates dialogue: debate cases are verbatim subsets of the advocates' outputs", () => {
    for (const fixture of [bullishInput, bearishInput, contradictoryInput, insufficientInput]) {
      const input = committeeInputFrom(fixture);
      const { debate } = buildFallbackCommitteeProposal(input);
      const bullStatements = new Set(input.bullOpinion.arguments.map((s) => s.statement));
      const bearStatements = new Set(input.bearOpinion.arguments.map((s) => s.statement));
      const evidenceStatements = new Set(
        [...input.bullOpinion.evidence, ...input.bearOpinion.evidence].map((s) => s.statement),
      );
      expect(debate.bullCase.every((s) => bullStatements.has(s.statement))).toBe(true);
      expect(debate.bearCase.every((s) => bearStatements.has(s.statement))).toBe(true);
      expect(
        debate.strongestEvidence.every(
          (s) => evidenceStatements.has(s.statement) || s.statement.startsWith('Grounded in market analysis: "'),
        ),
      ).toBe(true);
    }
  });
});

describe("buildCommitteePrompt", () => {
  it("renders every artifact including portfolio context when present", () => {
    const input = { ...committeeInputFrom(contradictoryInput), portfolioContext: exposedPortfolioContext };
    const prompt = buildCommitteePrompt(input);
    expect(prompt).toContain('"totalEquity":1000000');
    expect(prompt).toContain("MARKET ANALYSIS");
  });
});

describe("buildPortfolioConsiderations", () => {
  it('flags "Potential concentration risk exists" for a semiconductor-heavy book', () => {
    const input = { ...committeeInputFrom(bullishInput), portfolioContext: exposedPortfolioContext };
    const proposal = buildFallbackCommitteeProposal(input);
    const text = JSON.stringify(proposal.portfolioConsiderations);
    expect(text).toContain("Potential concentration risk exists");
    expect(text).toContain("Semiconductors already represents 40%");
  });

  it('flags a brand-new sector with "would introduce a new sector exposure"', () => {
    const input = committeeInputFrom(bullishInput);
    input.marketAnalysis = { ...input.marketAnalysis, sector: "Utilities" };
    input.portfolioContext = exposedPortfolioContext;
    const considerations = buildPortfolioConsiderations(input);
    expect(
      considerations.some((c) => c.statement.includes("would introduce a new sector exposure (Utilities)")),
    ).toBe(true);
  });

  it("surfaces existing position, largest-position and recent-trade facts", () => {
    const input = { ...committeeInputFrom(bullishInput), portfolioContext: exposedPortfolioContext };
    const text = JSON.stringify(buildPortfolioConsiderations(input));
    expect(text).toContain("already holds 500 share(s)");
    expect(text).toContain("largest positions");
    expect(text).toContain("Recent BUY activity in NVDA (100 shares on 2026-08-20)");
  });

  it("is advisory only: extreme exposure never flips the action or the risk gate", () => {
    const input = {
      ...committeeInputFrom(bullishInput),
      portfolioContext: {
        ...exposedPortfolioContext,
        positions: [{ symbol: "NVDA", qty: 900, marketValueUsd: 108_000, sector: "Semiconductors" }],
        sectorExposure: [{ sector: "Semiconductors", exposurePctOfBook: 90 }],
      },
    };
    const proposal = buildFallbackCommitteeProposal(input);
    expect(proposal.action).toBe("BUY");
    expect(proposal.requiresRiskApproval).toBe(true);
    expect(JSON.stringify(proposal.portfolioConsiderations)).toContain("Potential concentration risk exists");
  });

  it("returns no considerations when no context is provided", () => {
    expect(buildPortfolioConsiderations(committeeInputFrom(bullishInput))).toEqual([]);
    const proposal = buildFallbackCommitteeProposal(committeeInputFrom(bullishInput));
    expect(proposal.portfolioConsiderations).toEqual([]);
  });
});
