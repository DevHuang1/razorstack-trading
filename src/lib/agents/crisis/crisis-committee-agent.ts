import {
  CrisisCommitteeInputSchema,
  CrisisResponseSchema,
  type CrisisCommitteeInput,
  type CrisisContext,
  type CrisisResponse,
} from "@/lib/contracts/crisis";
import { StructuredAgent, type StructuredAgentConfig } from "../base-agent";
import { CRISIS_COMMITTEE_SYSTEM } from "../prompts";
import { crisisMarketAgent } from "./crisis-market-agent";
import { crisisNewsAgent } from "./crisis-news-agent";
import { crisisOptionsAgent } from "./crisis-options-agent";
import { crisisRiskAnalyst } from "./crisis-risk-analyst";
import { assessCrisisSeverity, volatilityRatio } from "./severity";

const SEVERITY_CONFIDENCE: Record<CrisisResponse["severity"], number> = {
  insufficient_data: 20,
  normal: 55,
  moderate: 65,
  severe: 72,
  critical: 65,
};

export function buildFallbackCrisisResponse(input: CrisisCommitteeInput): CrisisResponse {
  const { context, newsAssessment, marketRegime, riskAnalysis, optionsPlaybook } = input;
  const severity = assessCrisisSeverity(context);
  const ratio = volatilityRatio(context);

  const summary =
    `Crisis committee assessment: severity "${severity}". ` +
    `${context.marketMove.benchmark} reported at ${context.marketMove.changePct}%` +
    `${context.volatilityChange.priorLevel !== undefined ? `, volatility index ${context.volatilityChange.indexLabel} at ${context.volatilityChange.currentLevel} vs ${context.volatilityChange.priorLevel}` : `, volatility index ${context.volatilityChange.indexLabel} at ${context.volatilityChange.currentLevel} without a supplied baseline`}` +
    `, portfolio drawdown ${context.portfolioDrawdownPct}%. Advisory only - nothing is executed and every action requires downstream risk-engine approval.`;

  const recommendedActions: CrisisResponse["recommendedActions"] = [];
  if (severity === "insufficient_data") {
    recommendedActions.push(
      { kind: "interpretation", statement: "Request a complete stress report: news events, volatility baseline and affected sectors" },
      { kind: "interpretation", statement: "Hold all discretionary changes until inputs are completed" },
    );
  } else if (severity === "normal") {
    recommendedActions.push(
      { kind: "interpretation", statement: "Continue standard monitoring cadence; no escalation indicated by supplied data" },
    );
  } else {
    recommendedActions.push(
      { kind: "interpretation", statement: "Escalate this assessment to the risk engine for independent review and decision" },
      { kind: "interpretation", statement: "Re-verify affected-sector exposures against the latest book snapshot" },
    );
    if (severity === "severe" || severity === "critical") {
      recommendedActions.push(
        { kind: "interpretation", statement: "Stress-test any hedge concept against liquidity constraints before deployment" },
      );
    }
  }

  const reasons: CrisisResponse["reasons"] = [
    { kind: "observation", statement: `Supplied benchmark move: ${context.marketMove.benchmark} ${context.marketMove.changePct}%` },
    ratio !== undefined
      ? { kind: "observation", statement: `Volatility ratio computed from supplied levels: ${ratio.toFixed(2)}x` }
      : newsAssessment.notes[0],
    { kind: "observation", statement: `Supplied portfolio drawdown: ${context.portfolioDrawdownPct}%` },
    marketRegime.observations[0],
  ];

  return CrisisResponseSchema.parse({
    severity,
    summary,
    portfolioVulnerabilities: [...riskAnalysis.vulnerabilities, ...riskAnalysis.concentrationFlags],
    recommendedActions,
    hedgingIdeas: optionsPlaybook.hedgingConcepts,
    reasons,
    confidence: Math.max(
      10,
      Math.min(
        85,
        SEVERITY_CONFIDENCE[severity] -
          (context.volatilityChange.priorLevel === undefined ? 6 : 0) -
          (context.newsEvents.length === 0 ? 6 : 0),
      ),
    ),
    requiresRiskApproval: true,
  });
}

export function buildCrisisCommitteePrompt(input: CrisisCommitteeInput): string {
  return `CRISIS CONTEXT (verbatim):
${JSON.stringify(input.context)}

ANALYST ARTIFACTS (verbatim):
NEWS ASSESSMENT: ${JSON.stringify(input.newsAssessment)}
MARKET REGIME: ${JSON.stringify(input.marketRegime)}
RISK ANALYSIS: ${JSON.stringify(input.riskAnalysis)}
OPTIONS PLAYBOOK: ${JSON.stringify(input.optionsPlaybook)}

Synthesize the crisis response per your rules. Severity strictly from data; never execute; everything goes to the downstream risk engine.`;
}

export const crisisCommitteeAgentConfig: StructuredAgentConfig<CrisisCommitteeInput, CrisisResponse> = {
  name: "CrisisCommitteeAgent",
  role: "crisis_committee",
  description: "Synthesizes analyst artifacts into an advisory, risk-gated crisis response",
  systemPrompt: CRISIS_COMMITTEE_SYSTEM,
  inputSchema: CrisisCommitteeInputSchema,
  outputSchema: CrisisResponseSchema,
  buildPrompt: buildCrisisCommitteePrompt,
  fallback: buildFallbackCrisisResponse,
  maxAttempts: 2,
};

export const crisisCommitteeAgent = new StructuredAgent(crisisCommitteeAgentConfig);

export async function runCrisisRoom(context: CrisisContext): Promise<CrisisResponse> {
  const [newsAssessment, marketRegime, riskAnalysis, optionsPlaybook] = await Promise.all([
    crisisNewsAgent.run(context),
    crisisMarketAgent.run(context),
    crisisRiskAnalyst.run(context),
    crisisOptionsAgent.run(context),
  ]);
  return crisisCommitteeAgent.run({ context, newsAssessment, marketRegime, riskAnalysis, optionsPlaybook });
}
