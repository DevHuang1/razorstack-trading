import type {
  Bar,
  ComponentScore,
  DataSource,
  Direction,
  QuantSignal,
} from "./types";
import {
  annualizationFactor,
  atr,
  bollinger,
  clamp,
  dailyReturns,
  drawdownStats,
  ema,
  lastValue,
  normalizedSlope,
  percentileRank,
  realizedVolSeries,
  relativeVolume,
  roc,
  round,
  rsi,
  sma,
  stdev,
} from "./indicators";
import { runStrategies } from "./strategies";

export const COMPONENT_WEIGHTS = {
  momentum: 0.3,
  trend: 0.3,
  volume: 0.15,
  volatilityQuality: 0.1,
  meanReversionBias: 0.15,
} as const;

const DIRECTION_THRESHOLD = 0.06;
const STRENGTH_SCALE = 150;

export interface ComputeSignalInput {
  symbol: string;
  bars: Bar[];
  timeframe?: string;
  source?: DataSource;
}

function insufficient(detail: string): ComponentScore {
  return { name: detail, score: 0, weight: 0, detail: "Insufficient data" };
}

export function computeQuantSignal(input: ComputeSignalInput): QuantSignal {
  const symbol = input.symbol.toUpperCase();
  const timeframe = input.timeframe ?? "1Day";
  const source: DataSource = input.source ?? "EXTERNAL";
  const bars = [...input.bars].sort((a, b) => a.t.localeCompare(b.t));
  const closes = bars.map((b) => b.c);
  const volumes = bars.map((b) => b.v);
  const price = closes.length > 0 ? closes[closes.length - 1] : 0;
  const barsPerYear = annualizationFactor(timeframe);

  const components: ComponentScore[] = [
    momentumComponent(closes),
    trendComponent(closes),
    volumeComponent(volumes, closes),
    volatilityQualityComponent(closes, barsPerYear),
    meanReversionComponent(closes),
  ];

  let score = 0;
  for (const c of components) score += c.score * c.weight;
  score = clamp(score, -1, 1);

  const direction: Direction =
    score > DIRECTION_THRESHOLD ? "BUY" : score < -DIRECTION_THRESHOLD ? "SELL" : "HOLD";
  const strength = Math.min(100, Math.round(Math.abs(score) * STRENGTH_SCALE));

  return {
    symbol,
    timeframe,
    generatedAt: new Date().toISOString(),
    source,
    price: round(price, 2),
    changePct: {
      d1: round((roc(closes, 1) ?? 0) * 100),
      d5: round((roc(closes, 5) ?? 0) * 100),
      d21: round((roc(closes, 21) ?? 0) * 100),
    },
    components,
    overall: {
      direction,
      score: round(score, 3),
      strength,
    },
    strategies: runStrategies(bars),
    riskMetrics: riskMetrics(bars, closes, volumes, barsPerYear),
  };
}

function momentumComponent(closes: number[]): ComponentScore {
  const weight = COMPONENT_WEIGHTS.momentum;
  if (closes.length < 30) return insufficient("Momentum");
  const rets = dailyReturns(closes, 30);
  const vol = stdev(rets);
  if (vol === 0) return insufficient("Momentum");

  const r5 = roc(closes, 5);
  const r10 = roc(closes, 10);
  const r21 = roc(closes, 21);
  const scale = vol * Math.sqrt(10);
  let blended = 0;
  let totalWeight = 0;
  for (const [value, w] of [
    [r5, 0.2],
    [r10, 0.45],
    [r21, 0.35],
  ] as const) {
    if (value !== null) {
      blended += w * Math.tanh(value / scale);
      totalWeight += w;
    }
  }
  const score = totalWeight > 0 ? blended / totalWeight : 0;
  const parts: string[] = [];
  if (r5 !== null) parts.push(`5d ${(r5 * 100).toFixed(1)}%`);
  if (r10 !== null) parts.push(`10d ${(r10 * 100).toFixed(1)}%`);
  if (r21 !== null) parts.push(`21d ${(r21 * 100).toFixed(1)}%`);

  return {
    name: "Momentum",
    score: round(score, 3),
    weight,
    detail: parts.join(", "),
  };
}

function trendComponent(closes: number[]): ComponentScore {
  const weight = COMPONENT_WEIGHTS.trend;
  if (closes.length < 30) return insufficient("Trend");
  const price = closes[closes.length - 1];
  const sma20 = lastValue(sma(closes, Math.min(20, closes.length - 1)));
  const sma50 = lastValue(sma(closes, 50));
  const sma200 = lastValue(sma(closes, 200));
  const ema20Slope = normalizedSlope(lastNonNull(ema(closes, 20)) ?? [], 5);

  let raw = 0;
  let totalWeight = 0;
  const add = (contribution: number | null, w: number) => {
    if (contribution !== null) {
      raw += contribution * w;
      totalWeight += w;
    }
  };

  add(sma20 === null ? null : clamp((price / sma20 - 1) / 0.05, -1, 1), 0.35);
  add(
    sma20 !== null && sma50 !== null
      ? clamp((sma20 / sma50 - 1) / 0.03, -1, 1)
      : null,
    0.25,
  );
  add(
    sma50 !== null && sma200 !== null
      ? clamp((sma50 / sma200 - 1) / 0.02, -1, 1)
      : null,
    0.2,
  );
  add(ema20Slope === null ? null : clamp(ema20Slope / 0.02, -1, 1), 0.2);

  const score = totalWeight > 0 ? raw / totalWeight : 0;
  const parts: string[] = [];
  if (sma50 !== null) parts.push(price >= sma50 ? "> SMA50" : "< SMA50");
  if (sma200 !== null) parts.push(price >= sma200 ? "> SMA200" : "< SMA200");
  if (ema20Slope !== null)
    parts.push(`EMA20 slope ${(ema20Slope * 100).toFixed(1)}%/5d`);

  return {
    name: "Trend",
    score: round(score, 3),
    weight,
    detail: parts.join(", "),
  };
}

function volumeComponent(volumes: number[], closes: number[]): ComponentScore {
  const weight = COMPONENT_WEIGHTS.volume;
  if (volumes.length < 25) return insufficient("Volume");
  const relVol = relativeVolume(volumes, 20);
  const ret5 = roc(closes, 5);
  if (relVol === null || ret5 === null) return insufficient("Volume");

  const confirmation = clamp((relVol - 1) / 1.5, -0.6, 1);
  const score = Math.sign(ret5) * confirmation * clamp(Math.abs(ret5) / 0.04, 0.3, 1);
  return {
    name: "Volume",
    score: round(score, 3),
    weight,
    detail: `Relative volume ${relVol.toFixed(2)}x vs 20d avg, 5d move ${(ret5 * 100).toFixed(1)}%`,
  };
}

function volatilityQualityComponent(
  closes: number[],
  barsPerYear: number,
): ComponentScore {
  const weight = COMPONENT_WEIGHTS.volatilityQuality;
  if (closes.length < 40) return insufficient("Volatility");
  const rvSeries = realizedVolSeries(closes, 20, barsPerYear);
  const current = lastValue(rvSeries);
  if (current === null) return insufficient("Volatility");
  const history = rvSeries.filter((v): v is number => v !== null).slice(-250);
  const pctile = percentileRank(history, current) ?? 0.5;

  return {
    name: "Volatility",
    score: round(clamp(1 - pctile * 2, -1, 1), 3),
    weight,
    detail: `Realized vol ${(current * 100).toFixed(0)}% annualized (${Math.round(pctile * 100)}th pctile of history)`,
  };
}

function meanReversionComponent(closes: number[]): ComponentScore {
  const weight = COMPONENT_WEIGHTS.meanReversionBias;
  if (closes.length < 30) return insufficient("Mean Reversion Bias");
  const rsi14 = lastValue(rsi(closes, 14));
  if (rsi14 === null) return insufficient("Mean Reversion Bias");
  const bands = bollinger(closes, 20, 2);
  const upper = lastValue(bands.upper);
  const lower = lastValue(bands.lower);
  const price = closes[closes.length - 1];

  let score = clamp((50 - rsi14) / 22, -1, 1);
  let extra = "";
  if (upper !== null && lower !== null && price <= lower) {
    score = Math.max(score, 0.4);
    extra = ", below lower Bollinger band";
  } else if (upper !== null && lower !== null && price >= upper) {
    score = Math.min(score, -0.4);
    extra = ", above upper Bollinger band";
  }

  return {
    name: "Mean Reversion",
    score: round(score, 3),
    weight,
    detail: `RSI ${rsi14.toFixed(0)}${extra}`,
  };
}

function lastNonNull(series: (number | null)[]): number[] | null {
  const filtered = series.filter((v): v is number => v !== null);
  return filtered.length > 0 ? filtered : null;
}

function riskMetrics(
  bars: Bar[],
  closes: number[],
  volumes: number[],
  barsPerYear: number,
) {
  const rvSeries = realizedVolSeries(closes, 20, barsPerYear);
  const currentRv = lastValue(rvSeries);
  const history = rvSeries.filter((v): v is number => v !== null).slice(-250);
  const pctile = currentRv === null || history.length === 0
    ? 0.5
    : percentileRank(history, currentRv) ?? 0.5;

  const atr14 = lastValue(atr(bars, 14));
  const price = closes[closes.length - 1] || 1;

  const recentReturns = dailyReturns(closes, 20);
  const sd = stdev(recentReturns);
  const sharpe20d =
    recentReturns.length >= 10 && sd > 0
      ? (recentReturns.reduce((a, b) => a + b, 0) / recentReturns.length / sd) *
        Math.sqrt(barsPerYear)
      : null;

  const dd = drawdownStats(closes, Math.min(252, closes.length));
  const avgVolume =
    volumes.length >= 20
      ? volumes.slice(-20).reduce((a, b) => a + b, 0) / 20
      : volumes.reduce((a, b) => a + b, 0) / Math.max(1, volumes.length);

  return {
    realizedVolAnnualized: currentRv === null ? 0 : round(currentRv * 100),
    realizedVolPercentile: round(pctile, 2),
    atrPct: atr14 === null ? 0 : round((atr14 / price) * 100),
    maxDrawdownPct: round(dd.maxDrawdownPct, 1),
    currentDrawdownPct: round(dd.currentDrawdownPct, 1),
    sharpe20d: sharpe20d === null ? null : round(sharpe20d, 2),
    avgDailyVolume: Math.round(avgVolume),
  };
}
