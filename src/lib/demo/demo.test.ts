import { beforeAll, beforeEach, describe, expect, it } from "vitest";
import { analyzeOpportunity } from "@/lib/agents/analyze-opportunity";
import {
  insufficientCrisisContext,
  moderateCrisisContext,
  researchDemoInput,
  severeCrisisContext,
} from "./data";
import { runCrisisAnalysis, runInvestmentAnalysis, type DemoStepEvent } from "./index";

beforeAll(() => {
  process.env.OPENAI_API_KEY = "";
});

// Each test starts in mock mode; the fake-key test below sets its own key and
// must not leak it into later tests when it fails or times out.
beforeEach(() => {
  process.env.OPENAI_API_KEY = "";
});

function completedSteps(events: DemoStepEvent[]): string[] {
  return events.filter((e) => e.status === "completed").map((e) => e.agent);
}

describe("runInvestmentAnalysis (mock mode)", () => {
  it("executes the five agents in demo order and returns every artifact", async () => {
    const steps: DemoStepEvent[] = [];
    const result = await runInvestmentAnalysis(researchDemoInput, { onStep: (e) => steps.push(e) });
    expect(completedSteps(steps)).toEqual([
      "Research Agent",
      "News Agent",
      "Bull Agent",
      "Bear Agent",
      "Committee",
    ]);
    expect(result.marketAnalysis.symbol).toBe("NVDA");
    expect(result.newsAnalysis.symbol).toBe("NVDA");
    expect(result.bullOpinion.stance).toBe("bullish");
    expect(result.bearOpinion.stance).toBe("bearish");
    expect(result.debate.bullCase.length).toBeGreaterThan(0);
    expect(result.tradeProposal.requiresRiskApproval).toBe(true);
    expect(result.tradeProposal.debate).toEqual(result.debate);
  });

  it("is deterministic across repeated runs", async () => {
    const [a, b] = await Promise.all([
      runInvestmentAnalysis(researchDemoInput),
      runInvestmentAnalysis(researchDemoInput),
    ]);
    expect(a).toEqual(b);
  });

  it("stays deterministic even when an API key is present", { timeout: 30_000 }, async () => {
    process.env.OPENAI_API_KEY = "fake-key-for-demo";
    try {
      const forced = await runInvestmentAnalysis(researchDemoInput, { deterministic: true });
      const baseline = await runInvestmentAnalysis(researchDemoInput);
      expect(forced).toEqual(baseline);
    } finally {
      delete process.env.OPENAI_API_KEY;
    }
  });

  it("matches the underlying analyzeOpportunity output", async () => {
    const result = await runInvestmentAnalysis(researchDemoInput);
    const direct = await analyzeOpportunity(researchDemoInput);
    expect(result.tradeProposal).toEqual(direct);
  });
});

describe("runCrisisAnalysis (mock mode)", () => {
  it("runs the crisis room and returns regime, opinions and response", async () => {
    const steps: DemoStepEvent[] = [];
    const result = await runCrisisAnalysis(severeCrisisContext, { onStep: (e) => steps.push(e) });
    expect(completedSteps(steps)).toEqual([
      "Crisis News Agent",
      "Crisis Market Agent",
      "Crisis Risk Analyst",
      "Crisis Options Agent",
      "Crisis Committee",
    ]);
    expect(result.crisisAnalysis.regimeAssessment).toBe("risk_off");
    expect(Object.keys(result.agentOpinions).sort()).toEqual([
      "marketRegime",
      "newsAssessment",
      "optionsPlaybook",
      "riskAnalysis",
    ]);
    expect(result.crisisResponse.severity).toBe("severe");
    expect(result.crisisResponse.requiresRiskApproval).toBe(true);
  });

  it("maps scenario severities honestly", async () => {
    const moderate = await runCrisisAnalysis(moderateCrisisContext);
    expect(moderate.crisisResponse.severity).toBe("moderate");
    const insufficient = await runCrisisAnalysis(insufficientCrisisContext);
    expect(insufficient.crisisResponse.severity).toBe("insufficient_data");
  });

  it("is deterministic across repeated runs", async () => {
    const [a, b] = await Promise.all([
      runCrisisAnalysis(severeCrisisContext),
      runCrisisAnalysis(severeCrisisContext),
    ]);
    expect(a).toEqual(b);
  });
});
