import type { Bar, StrategyId } from "./types";
import { drawdownStats, round, sharpeRatio, sortinoRatio } from "./indicators";
import { getStrategy } from "./strategies";
import { estimateExecutionCost } from "./executionCosts";

export interface StrategyPerformance {
  strategyId: StrategyId;
  horizonDays: number;
  signalsEvaluated: number;
  trades: number;
  winRatePct: number;
  avgTradeReturnPct: number;
  grossCumulativeReturnPct: number;
  netCumulativeReturnPct: number;
  maxDrawdownPct: number;
  sharpeAnnualized: number | null;
  sortinoAnnualized: number | null;
  calmarRatio: number | null;
  turnover: number;
  exposurePct: number;
  buyHoldReturnPct: number;
  benchmarkOutperformancePct: number;
  avgCostPerTradeBps: number;
}

export interface BacktestOptions {
  horizonDays?: number;
  initialCapital?: number;
  maxNotionalWeight?: number;
  trainWindow?: number;
}

const DEFAULT_MAX_NOTIONAL_WEIGHT = 1;

interface TradeRecord {
  forwardReturnNet: number;
  costFraction: number;
  entryBar: number;
}

export function backtestStrategy(
  strategyId: StrategyId,
  bars: Bar[],
  options: BacktestOptions = {},
): StrategyPerformance | null {
  const strategy = getStrategy(strategyId);
  if (!strategy || bars.length < Math.max(strategy.minBars + 10, 120)) return null;

  const horizon = options.horizonDays ?? 5;
  const maxWeight = options.maxNotionalWeight ?? DEFAULT_MAX_NOTIONAL_WEIGHT;
  const initialCapital = options.initialCapital ?? 100_000;

  const start = Math.max(strategy.minBars, 60);
  const end = bars.length - horizon;

  return run(start, end, horizon, maxWeight, initialCapital, strategyId, bars);
}

export interface WalkForwardResult {
  strategyId: StrategyId;
  horizonDays: number;
  trainWindow: number;
  testWindow: number;
  performance: StrategyPerformance;
}

export function walkForwardBacktest(
  strategyId: StrategyId,
  bars: Bar[],
  options: BacktestOptions = {},
): WalkForwardResult | null {
  const strategy = getStrategy(strategyId);
  if (!strategy || bars.length < 200) return null;

  const horizon = options.horizonDays ?? 5;
  const maxWeight = options.maxNotionalWeight ?? DEFAULT_MAX_NOTIONAL_WEIGHT;
  const initialCapital = options.initialCapital ?? 100_000;
  const trainWindow = options.trainWindow ?? Math.floor(bars.length * 0.5);

  const start = Math.max(strategy.minBars, trainWindow);
  const end = bars.length - horizon;

  const performance = run(start, end, horizon, maxWeight, initialCapital, strategyId, bars);

  return {
    strategyId,
    horizonDays: horizon,
    trainWindow,
    testWindow: Math.max(0, end - start),
    performance,
  };
}

function run(
  start: number,
  end: number,
  horizon: number,
  maxWeight: number,
  initialCapital: number,
  strategyId: StrategyId,
  bars: Bar[],
): StrategyPerformance {
  const trades: TradeRecord[] = [];
  const decisionCount = Math.max(0, end - start);
  let capital = initialCapital;
  let netCumulative = 0;
  let totalCostFraction = 0;

  for (let i = start; i < end; i++) {
    const history = bars.slice(0, i + 1);
    const vote = getStrategy(strategyId)!.evaluate(history);
    const entry = bars[i].c;
    const exit = bars[i + horizon].c;
    if (entry <= 0) continue;

    const rawForward = exit / entry - 1;
    let direction: 1 | -1 | 0 = 0;
    if (vote.direction === "BUY") direction = 1;
    else if (vote.direction === "SELL") direction = -1;
    if (direction === 0) continue;

    const notional = capital * maxWeight;
    const qty = Math.max(1, Math.round(notional / entry));
    const cost = estimateExecutionCost({
      symbol: strategyId,
      side: direction === 1 ? "buy" : "sell",
      quantity: qty,
      referencePrice: entry,
      averageDailyVolume: null,
    });
    const costFraction = cost.costAsFractionOfNotional;

    const net = direction * rawForward - costFraction;
    const capitalDelta = net * notional;
    capital += capitalDelta;
    netCumulative += net;
    totalCostFraction += costFraction;

    trades.push({ forwardReturnNet: net, costFraction, entryBar: i });
  }

  const startPrice = bars[0]?.c ?? 0;
  const endPrice = bars[bars.length - 1]?.c ?? 0;
  const buyHold = startPrice > 0 ? endPrice / startPrice - 1 : 0;

  const grossAvg =
    trades.length > 0
      ? trades.reduce((a, t) => a + t.forwardReturnNet + t.costFraction, 0) /
        trades.length
      : 0;

  const compoundedNet = initialCapital > 0 ? capital / initialCapital - 1 : 0;
  const sharpe = sharpeRatio(
    trades.map((t) => t.forwardReturnNet),
    252 / horizon,
  );
  const sortino = sortinoRatio(
    trades.map((t) => t.forwardReturnNet),
    252 / horizon,
  );

  const dd = trades.length
    ? drawdownStats(buildEquity(trades, initialCapital))
    : { maxDrawdownPct: 0 };

  const calmar =
    dd.maxDrawdownPct > 0 && trades.length > 0
      ? round(compoundedNet / (dd.maxDrawdownPct / 100), 2)
      : null;

  return {
    strategyId,
    horizonDays: horizon,
    signalsEvaluated: decisionCount,
    trades: trades.length,
    winRatePct: round(
      (trades.filter((t) => t.forwardReturnNet > 0).length / Math.max(1, trades.length)) * 100,
      1,
    ),
    avgTradeReturnPct: round(
      trades.length ? (netCumulative / trades.length) * 100 : 0,
      3,
    ),
    grossCumulativeReturnPct: round(grossAvg * 100, 3),
    netCumulativeReturnPct: round(compoundedNet * 100, 2),
    maxDrawdownPct: round(dd.maxDrawdownPct, 2),
    sharpeAnnualized: sharpe === null ? null : round(sharpe, 2),
    sortinoAnnualized: sortino === null ? null : round(sortino, 2),
    calmarRatio: calmar,
    turnover: round(trades.length / Math.max(1, decisionCount), 3),
    exposurePct: round((trades.length / Math.max(1, decisionCount)) * 100, 1),
    buyHoldReturnPct: round(buyHold * 100, 2),
    benchmarkOutperformancePct: round(
      (compoundedNet - buyHold) * 100,
      2,
    ),
    avgCostPerTradeBps: round(
      trades.length ? (totalCostFraction / trades.length) * 10000 : 0,
      2,
    ),
  };
}

function buildEquity(trades: TradeRecord[], initialCapital: number): number[] {
  const equity: number[] = [];
  let prev = initialCapital;
  for (const t of trades) {
    prev *= 1 + t.forwardReturnNet;
    equity.push(prev);
  }
  return equity.length ? equity : [initialCapital];
}
