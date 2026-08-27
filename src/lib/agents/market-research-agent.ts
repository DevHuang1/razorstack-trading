import {
  MarketAnalysisSchema,
  MarketResearchInputSchema,
  type AnalysisStatement,
  type MarketAnalysis,
  type MarketResearchInput,
} from "@/lib/contracts/research";
import { StructuredAgent, type StructuredAgentConfig } from "./base-agent";
import { assertNumeralsGrounded } from "./grounding";
import { MARKET_RESEARCH_SYSTEM } from "./prompts";

const LOW_VOL_THRESHOLD = 22;
const HIGH_VOL_THRESHOLD = 40;

function observation(statement: string): AnalysisStatement {
  return { kind: "observation", statement };
}

function interpretation(statement: string): AnalysisStatement {
  return { kind: "interpretation", statement };
}

function volatilityRegime(realizedVolAnnPct: number): "low" | "moderate" | "high" {
  if (realizedVolAnnPct < LOW_VOL_THRESHOLD) return "low";
  if (realizedVolAnnPct > HIGH_VOL_THRESHOLD) return "high";
  return "moderate";
}

function momentumLabel(change1mPct: number): Exclude<MarketAnalysis["momentum"], "insufficient_data"> {
  if (change1mPct > 10) return "strongly_positive";
  if (change1mPct > 0) return "positive";
  if (change1mPct === 0) return "neutral";
  if (change1mPct >= -10) return "negative";
  return "strongly_negative";
}

export function buildFallbackMarketAnalysis(input: MarketResearchInput): MarketAnalysis {
  const { symbol, snapshot: s } = input;
  const aboveSma20 = s.price > s.sma20;
  const aboveSma50 = s.price > s.sma50;
  const trend =
    aboveSma20 && aboveSma50 ? "up" : !aboveSma20 && !aboveSma50 ? "down" : "sideways";
  const momentum = momentumLabel(s.change1mPct);
  const aligned =
    (trend === "up" && (momentum === "positive" || momentum === "strongly_positive")) ||
    (trend === "down" && (momentum === "negative" || momentum === "strongly_negative"));

  const observations: AnalysisStatement[] = [
    observation(
      `Latest price $${s.price} versus 20-day SMA $${s.sma20} and 50-day SMA $${s.sma50}`,
    ),
    observation(
      `Recent price changes: 1-day ${s.change1dPct}%, 5-day ${s.change5dPct}%, 1-month ${s.change1mPct}%`,
    ),
    observation(`RSI(14) at ${s.rsi14}`),
    observation(
      `Realized volatility (30d annualized) ${s.realizedVol30dAnnPct}% — sector: ${s.sector}, regime: ${s.regime}`,
    ),
  ];
  if (s.latestVolume !== undefined && s.averageVolume30d !== undefined) {
    observations.push(observation(`Latest volume ${s.latestVolume} vs 30-day average ${s.averageVolume30d}`));
  }

  const concerns: AnalysisStatement[] = [];
  if (s.latestVolume === undefined || s.averageVolume30d === undefined) {
    concerns.push(
      interpretation(
        "insufficient_data: latest volume and/or 30-day average volume not provided — participation and liquidity assessment unavailable",
      ),
    );
  }
  if (s.rsi14 > 70) {
    concerns.push(interpretation(`RSI(14) at ${s.rsi14} is in overbought territory (>70)`));
  }
  if (s.rsi14 < 30) {
    concerns.push(interpretation(`RSI(14) at ${s.rsi14} is in oversold territory (<30)`));
  }
  if (!aboveSma20 !== !aboveSma50) {
    concerns.push(interpretation("Mixed trend signal: price sits between the 20-day and 50-day moving averages"));
  }

  return MarketAnalysisSchema.parse({
    symbol,
    sector: s.sector,
    trend,
    momentum,
    volatilityRegime: volatilityRegime(s.realizedVol30dAnnPct),
    supportingObservations: observations,
    potentialConcerns: concerns,
    confidence: aligned ? 72 : 58,
  });
}

export function buildMarketResearchPrompt(input: MarketResearchInput): string {
  const s = input.snapshot;
  const fmt = (label: string, value: number | string | undefined, unit = "") =>
    `- ${label}: ${value === undefined ? "not_provided" : `${value}${unit}`}`;
  return `Symbol: ${input.symbol}

RAW MARKET DATA (single source of truth — do not output any number that does not appear here):
${fmt("current price", s.price)}
${fmt("1-day change %", s.change1dPct)}
${fmt("5-day change %", s.change5dPct)}
${fmt("1-month change %", s.change1mPct)}
${fmt("RSI(14)", s.rsi14)}
${fmt("20-day SMA", s.sma20)}
${fmt("50-day SMA", s.sma50)}
${fmt("realized volatility 30d annualized %", s.realizedVol30dAnnPct)}
${fmt("latest volume", s.latestVolume)}
${fmt("average 30-day volume", s.averageVolume30d)}
${fmt("sector", s.sector)}
${fmt("market regime", s.regime)}

Produce the structured market analysis. Every observation must restate facts from above verbatim;
every interpretation must be traceable to those facts; mark anything unavailable as insufficient_data.`;
}

export const marketResearchAgentConfig: StructuredAgentConfig<MarketResearchInput, MarketAnalysis> = {
  name: "MarketResearchAgent",
  role: "market_research",
  description: "Produces an objective, observation-grounded summary of structured market data",
  systemPrompt: MARKET_RESEARCH_SYSTEM,
  inputSchema: MarketResearchInputSchema,
  outputSchema: MarketAnalysisSchema,
  buildPrompt: buildMarketResearchPrompt,
  fallback: buildFallbackMarketAnalysis,
  maxAttempts: 2,
  validate: (output, input) =>
    assertNumeralsGrounded(output.supportingObservations, input.snapshot),
};

export const marketResearchAgent = new StructuredAgent(marketResearchAgentConfig);
