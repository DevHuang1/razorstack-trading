import { beforeAll, describe, expect, it } from "vitest";
import { CrisisResponseSchema } from "@/lib/contracts/crisis";
import {
  buildCrisisCommitteePrompt,
  crisisCommitteeAgent,
  runCrisisRoom,
} from "./crisis-committee-agent";
import { buildFallbackCrisisNewsAssessment } from "./crisis-news-agent";
import { buildFallbackCrisisMarketRegime } from "./crisis-market-agent";
import { buildFallbackCrisisRiskAnalysis } from "./crisis-risk-analyst";
import { buildFallbackCrisisOptionsPlaybook } from "./crisis-options-agent";
import {
  insufficientCrisisContext,
  moderateCrisisContext,
  normalCrisisContext,
  severeCrisisContext,
} from "./crisis-test-fixtures";

beforeAll(() => {
  process.env.OPENAI_API_KEY = "";
});

describe("runCrisisRoom (mock mode)", () => {
  it("1. normal market -> severity normal with no escalation", async () => {
    const response = await runCrisisRoom(normalCrisisContext);
    expect(response.severity).toBe("normal");
    expect(JSON.stringify(response.recommendedActions)).toContain("standard monitoring cadence");
    expect(response.confidence).toBe(55);
  });

  it("2. moderate selloff -> severity moderate with escalation to the risk engine", async () => {
    const response = await runCrisisRoom(moderateCrisisContext);
    expect(response.severity).toBe("moderate");
    expect(JSON.stringify(response.recommendedActions)).toContain("risk engine for independent review");
    expect(JSON.stringify(response.hedgingIdeas)).toContain("protective put overlay");
  });

  it("3. severe selloff -> severity severe with liquidity stress-testing action", async () => {
    const response = await runCrisisRoom(severeCrisisContext);
    expect(response.severity).toBe("severe");
    expect(response.portfolioVulnerabilities.length).toBeGreaterThanOrEqual(3);
    expect(JSON.stringify(response.recommendedActions)).toContain("Stress-test any hedge concept");
    expect(response.confidence).toBe(72);
  });

  it("4. insufficient information -> honest insufficient_data response", async () => {
    const response = await runCrisisRoom(insufficientCrisisContext);
    expect(response.severity).toBe("insufficient_data");
    expect(JSON.stringify(response.recommendedActions)).toContain("Request a complete stress report");
    expect(response.confidence).toBe(10);
  });

  it("always gates every response behind risk-engine approval", async () => {
    for (const context of [normalCrisisContext, moderateCrisisContext, severeCrisisContext, insufficientCrisisContext]) {
      const response = await runCrisisRoom(context);
      expect(CrisisResponseSchema.parse(response)).toBeTruthy();
      expect(response.requiresRiskApproval).toBe(true);
    }
  });

  it("keeps every hedging idea conceptual in the synthesized response", async () => {
    const response = await runCrisisRoom(severeCrisisContext);
    expect(response.hedgingIdeas.length).toBeGreaterThan(0);
    for (const idea of response.hedgingIdeas) {
      expect(idea.statement.startsWith("Conceptual hedge:")).toBe(true);
    }
  });

  it("grounds reasons in the supplied figures only", async () => {
    const response = await runCrisisRoom(severeCrisisContext);
    const text = JSON.stringify(response.reasons);
    expect(text).toContain("-9%");
    expect(text).toContain("-8.6%");
    expect(text).toContain("1.89x");
  });

  it("carries the never-execute rule and feeds all artifacts verbatim", () => {
    expect(crisisCommitteeAgent.systemPrompt).toContain("NEVER execute trades");
    expect(crisisCommitteeAgent.systemPrompt).toContain("downstream risk engine");
    const prompt = buildCrisisCommitteePrompt({
      context: severeCrisisContext,
      newsAssessment: buildFallbackCrisisNewsAssessment(severeCrisisContext),
      marketRegime: buildFallbackCrisisMarketRegime(severeCrisisContext),
      riskAnalysis: buildFallbackCrisisRiskAnalysis(severeCrisisContext),
      optionsPlaybook: buildFallbackCrisisOptionsPlaybook(severeCrisisContext),
    });
    expect(prompt).toContain('"changePct":-9');
    expect(prompt).toContain("OPTIONS PLAYBOOK");
  });
});
