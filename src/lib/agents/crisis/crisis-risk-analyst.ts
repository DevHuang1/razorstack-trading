import {
  CrisisContextSchema,
  CrisisRiskAnalysisSchema,
  type CrisisContext,
  type CrisisRiskAnalysis,
} from "@/lib/contracts/crisis";
import { StructuredAgent, type StructuredAgentConfig } from "../base-agent";
import { CRISIS_RISK_ANALYST_SYSTEM } from "../prompts";
import { affectedPositionSectors, volatilityRatio } from "./severity";

export function buildFallbackCrisisRiskAnalysis(context: CrisisContext): CrisisRiskAnalysis {
  const vulnerabilities: CrisisRiskAnalysis["vulnerabilities"] = [];
  const concentrationFlags: CrisisRiskAnalysis["concentrationFlags"] = [];
  const liquidityConcerns: CrisisRiskAnalysis["liquidityConcerns"] = [];

  if (context.currentPositions.length === 0) {
    vulnerabilities.push({
      kind: "observation",
      statement: "No positions were supplied; portfolio-level impact cannot be assessed",
    });
  } else {
    vulnerabilities.push({
      kind: "interpretation",
      statement: `Portfolio already carries a ${context.portfolioDrawdownPct}% mark-to-market drawdown that compounds under further stress`,
    });

    const largest = [...context.currentPositions].sort((a, b) => Math.abs(b.marketValueUsd) - Math.abs(a.marketValueUsd))[0];
    vulnerabilities.push({
      kind: "interpretation",
      statement: `Largest single-position exposure is ${largest.symbol} at $${largest.marketValueUsd}; it would dominate further losses`,
    });

    for (const sector of affectedPositionSectors(context)) {
      const count = context.currentPositions.filter((p) => p.sector === sector).length;
      concentrationFlags.push({
        kind: "observation",
        statement: `${count} position(s) in ${sector}, a sector flagged as affected by the stress report`,
      });
      vulnerabilities.push({
        kind: "interpretation",
        statement: `Concentration inside affected sector ${sector} amplifies drawdown beyond benchmark moves`,
      });
    }
  }

  const ratio = volatilityRatio(context);
  if (ratio !== undefined && ratio >= 1.5) {
    liquidityConcerns.push({
      kind: "interpretation",
      statement: `Volatility index at ${ratio.toFixed(2)}x its prior level typically widens spreads and thins exit liquidity`,
    });
  }

  return CrisisRiskAnalysisSchema.parse({
    vulnerabilities,
    concentrationFlags,
    liquidityConcerns,
    confidence: Math.min(85, 35 + (context.currentPositions.length > 0 ? 15 : 0) + (concentrationFlags.length > 0 ? 15 : 0) + (ratio !== undefined ? 10 : 0)),
  });
}

export function buildCrisisRiskPrompt(context: CrisisContext): string {
  return `CRISIS CONTEXT (verbatim — the only permitted source of position data):
${JSON.stringify(context)}

Explain portfolio vulnerabilities strictly from this data. You identify concerns; the downstream risk engine decides limits and actions.`;
}

export const crisisRiskAnalystConfig: StructuredAgentConfig<CrisisContext, CrisisRiskAnalysis> = {
  name: "CrisisRiskAnalyst",
  role: "crisis_risk_analyst",
  description: "Explains portfolio vulnerabilities from supplied positions and drawdown",
  systemPrompt: CRISIS_RISK_ANALYST_SYSTEM,
  inputSchema: CrisisContextSchema,
  outputSchema: CrisisRiskAnalysisSchema,
  buildPrompt: buildCrisisRiskPrompt,
  fallback: buildFallbackCrisisRiskAnalysis,
  maxAttempts: 2,
};

export const crisisRiskAnalyst = new StructuredAgent(crisisRiskAnalystConfig);
