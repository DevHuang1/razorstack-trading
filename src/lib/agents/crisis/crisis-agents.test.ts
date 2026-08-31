import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { generateText } from "ai";
import { crisisNewsAgent, buildFallbackCrisisNewsAssessment } from "./crisis-news-agent";
import { buildFallbackCrisisMarketRegime } from "./crisis-market-agent";
import { buildFallbackCrisisRiskAnalysis } from "./crisis-risk-analyst";
import { buildFallbackCrisisOptionsPlaybook } from "./crisis-options-agent";
import {
  insufficientCrisisContext,
  moderateCrisisContext,
  normalCrisisContext,
  severeCrisisContext,
} from "./crisis-test-fixtures";

vi.mock("ai", () => ({
  generateText: vi.fn(),
  Output: { object: (schema: unknown) => ({ schema }) },
}));

const ORIGINAL_KEY = process.env.OPENAI_API_KEY;

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

describe("CrisisNewsAgent", () => {
  it("feeds the full context verbatim and cites supplied sources (LLM path)", async () => {
    vi.mocked(generateText).mockResolvedValue({
      output: { identifiedDrivers: [], notes: [{ kind: "observation", statement: "reviewed" }], confidence: 30 },
    } as never);
    await crisisNewsAgent.run(severeCrisisContext);
    const call = vi.mocked(generateText).mock.calls[0][0];
    expect(call.system).toContain("EXCLUSIVELY the supplied news items");
    expect(call.prompt).toContain('"changePct":-9');
  });

  it("cites the most sentiment-loaded supplied item as a driver", () => {
    const assessment = buildFallbackCrisisNewsAssessment(severeCrisisContext);
    expect(JSON.stringify(assessment.identifiedDrivers)).toContain("(source: Reuters");
  });

  it("never invents a driver when coverage is empty", () => {
    const assessment = buildFallbackCrisisNewsAssessment(insufficientCrisisContext);
    expect(assessment.identifiedDrivers).toEqual([]);
    expect(assessment.notes[0].statement).toContain("No identifiable driver exists in the supplied material");
  });
});

describe("CrisisMarketAgent fallback", () => {
  it("labels regimes and volatility from supplied figures", () => {
    expect(buildFallbackCrisisMarketRegime(normalCrisisContext)).toMatchObject({
      regimeAssessment: "neutral",
      volatilityAssessment: "normal",
    });
    expect(buildFallbackCrisisMarketRegime(moderateCrisisContext)).toMatchObject({
      regimeAssessment: "risk_off",
      volatilityAssessment: "elevated",
    });
    const severe = buildFallbackCrisisMarketRegime(severeCrisisContext);
    expect(severe).toMatchObject({ regimeAssessment: "risk_off", volatilityAssessment: "extreme" });
    expect(JSON.stringify(severe.observations)).toContain("1.89x");
  });

  it("reports insufficient volatility data without a baseline", () => {
    const regime = buildFallbackCrisisMarketRegime(insufficientCrisisContext);
    expect(regime.volatilityAssessment).toBe("insufficient_data");
    expect(JSON.stringify(regime.observations)).toContain("no baseline supplied");
  });
});

describe("CrisisRiskAnalyst fallback", () => {
  it("flags concentration inside affected sectors and the largest position", () => {
    const analysis = buildFallbackCrisisRiskAnalysis(severeCrisisContext);
    expect(analysis.concentrationFlags.length).toBe(2);
    expect(JSON.stringify(analysis.vulnerabilities)).toContain("Largest single-position exposure is MSFT");
    expect(JSON.stringify(analysis.vulnerabilities)).toContain("-8.6%");
  });

  it("admits it cannot assess an empty book", () => {
    const analysis = buildFallbackCrisisRiskAnalysis(insufficientCrisisContext);
    expect(analysis.vulnerabilities[0].statement).toContain("cannot be assessed");
  });

  it("warns on liquidity when volatility more than doubles", () => {
    const analysis = buildFallbackCrisisRiskAnalysis(severeCrisisContext);
    expect(JSON.stringify(analysis.liquidityConcerns)).toContain("1.89x its prior level");
  });
});

describe("CrisisOptionsAgent fallback", () => {
  it("keeps every idea conceptual across all scenarios", () => {
    for (const context of [normalCrisisContext, moderateCrisisContext, severeCrisisContext, insufficientCrisisContext]) {
      const playbook = buildFallbackCrisisOptionsPlaybook(context);
      expect(playbook.hedgingConcepts.length).toBeGreaterThanOrEqual(1);
      for (const concept of playbook.hedgingConcepts) {
        expect(concept.statement.startsWith("Conceptual hedge:")).toBe(true);
        expect(concept.statement).not.toMatch(/\$\d|strike|contracts? of/i);
      }
    }
  });

  it("escalates structure depth with severity", () => {
    expect(buildFallbackCrisisOptionsPlaybook(normalCrisisContext).hedgingConcepts.length).toBe(1);
    const severe = buildFallbackCrisisOptionsPlaybook(severeCrisisContext);
    expect(severe.hedgingConcepts.length).toBe(4);
    expect(JSON.stringify(severe.hedgingConcepts)).toContain("collar");
  });

  it("recommends no hedge when inputs are incomplete", () => {
    const playbook = buildFallbackCrisisOptionsPlaybook(insufficientCrisisContext);
    expect(playbook.hedgingConcepts[0].statement).toContain("none recommended until");
  });
});
