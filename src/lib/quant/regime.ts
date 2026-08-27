import type { Bar, MarketRegime } from "./types";
import {
  lastValue,
  percentileRank,
  realizedVolSeries,
  round,
  sma,
} from "./indicators";

const VOL_PERCENTILE_CRISIS = 0.9;
const VOL_PERCENTILE_HIGH = 0.7;
const VOL_PERCENTILE_LOW = 0.3;

function trendScore(closes: number[]): number {
  const price = closes[closes.length - 1];
  const sma20 = lastValue(sma(closes, Math.min(20, closes.length)));
  const sma50 = lastValue(sma(closes, 50));
  const sma200 = lastValue(sma(closes, 200));
  let score = 0;
  let weight = 0;
  if (sma20 !== null) {
    score += price > sma20 ? 1 : -1;
    weight += 1;
  }
  if (sma50 !== null) {
    score += price > sma50 ? 1 : -1;
    weight += 1;
    if (sma20 !== null) {
      score += sma20 > sma50 ? 1 : -1;
      weight += 1;
    }
  }
  if (sma200 !== null) {
    score += price > sma200 ? 1.5 : -1.5;
    weight += 1.5;
    if (sma50 !== null) {
      score += sma50 > sma200 ? 1 : -1;
      weight += 1;
    }
  }
  return weight === 0 ? 0 : score / weight;
}

export function riskMultiplierFor(volPercentile: number | null): number {
  if (volPercentile === null) return 1;
  if (volPercentile >= VOL_PERCENTILE_CRISIS) return 0;
  if (volPercentile >= VOL_PERCENTILE_HIGH) return 0.5;
  if (volPercentile <= VOL_PERCENTILE_LOW) return 1.25;
  return 1;
}

export function volRegimeFor(volPercentile: number | null): MarketRegime["volatility"] {
  if (volPercentile === null) return "NORMAL";
  if (volPercentile >= VOL_PERCENTILE_CRISIS) return "CRISIS";
  if (volPercentile >= VOL_PERCENTILE_HIGH) return "VOLATILE";
  if (volPercentile <= VOL_PERCENTILE_LOW) return "QUIET";
  return "NORMAL";
}

export function detectRegime(
  benchmarkBars: Bar[],
  benchmarkSymbol = "SPY",
): MarketRegime {
  const closes = benchmarkBars.map((b) => b.c);
  const ts = trendScore(closes);
  const rvSeries = realizedVolSeries(closes, 20);
  const currentRv = lastValue(rvSeries);
  const history = rvSeries.filter((v): v is number => v !== null).slice(-250);
  const pctile = currentRv === null ? null : percentileRank(history, currentRv);

  const trend: MarketRegime["trend"] =
    ts > 0.33 ? "BULL_TREND" : ts < -0.33 ? "BEAR_TREND" : "RANGE";
  const volatility = volRegimeFor(pctile);
  const riskMultiplier = riskMultiplierFor(pctile);

  return {
    label: `${trend} / ${volatility}`,
    trend,
    volatility,
    benchmark: benchmarkSymbol,
    benchmarkTrendScore: round(ts),
    benchmarkVolPercentile: pctile === null ? 0.5 : round(pctile),
    benchmarkRealizedVolAnnualized:
      currentRv === null ? 0 : round(currentRv * 100),
    riskMultiplier,
    crisis: volatility === "CRISIS",
  };
}
