import {
  CrisisContextSchema,
  CrisisMarketRegimeSchema,
  type CrisisContext,
  type CrisisMarketRegime,
} from "@/lib/contracts/crisis";
import { StructuredAgent, type StructuredAgentConfig } from "../base-agent";
import { CRISIS_MARKET_SYSTEM } from "../prompts";
import { volatilityRatio } from "./severity";

export function buildFallbackCrisisMarketRegime(context: CrisisContext): CrisisMarketRegime {
  const { marketMove, volatilityChange } = context;
  const ratio = volatilityRatio(context);

  const observations = [
    {
      kind: "observation" as const,
      statement: `${marketMove.benchmark} move on record: ${marketMove.changePct}%${marketMove.windowLabel ? ` over ${marketMove.windowLabel}` : ""}`,
    },
    observationForVolatility(volatilityChange.indexLabel, volatilityChange.currentLevel, volatilityChange.priorLevel),
  ];

  const regimeAssessment =
    Math.abs(marketMove.changePct) < 2 && ratio === undefined
      ? "insufficient_data"
      : marketMove.changePct <= -2
        ? "risk_off"
        : marketMove.changePct >= 5
          ? "risk_on"
          : "neutral";

  const volatilityAssessment =
    ratio === undefined ? "insufficient_data" : ratio >= 1.75 ? "extreme" : ratio >= 1.3 ? "elevated" : "normal";

  return CrisisMarketRegimeSchema.parse({
    regimeAssessment,
    volatilityAssessment,
    observations,
    confidence: Math.min(85, 45 + (ratio !== undefined ? 15 : 0) + (Math.abs(marketMove.changePct) >= 2 ? 15 : 0)),
  });
}

function observationForVolatility(label: string, current: number, prior?: number) {
  return prior === undefined
    ? { kind: "observation" as const, statement: `Volatility index ${label} at ${current}; no baseline supplied for comparison` }
    : { kind: "observation" as const, statement: `Volatility index ${label} moved ${prior} -> ${current} (${(current / prior).toFixed(2)}x)` };
}

export function buildCrisisMarketPrompt(context: CrisisContext): string {
  return `CRISIS CONTEXT (verbatim — the only permitted source of figures):
${JSON.stringify(context)}

Assess the regime change strictly from these numbers.`;
}

export const crisisMarketAgentConfig: StructuredAgentConfig<CrisisContext, CrisisMarketRegime> = {
  name: "CrisisMarketAgent",
  role: "crisis_market",
  description: "Assesses the market regime change from supplied stress data",
  systemPrompt: CRISIS_MARKET_SYSTEM,
  inputSchema: CrisisContextSchema,
  outputSchema: CrisisMarketRegimeSchema,
  buildPrompt: buildCrisisMarketPrompt,
  fallback: buildFallbackCrisisMarketRegime,
  maxAttempts: 2,
};

export const crisisMarketAgent = new StructuredAgent(crisisMarketAgentConfig);
