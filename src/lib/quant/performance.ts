import type { Bar, StrategyId } from "./types";
import { drawdownStats, round, stdev } from "./indicators";
import { getStrategy } from "./strategies";

export interface StrategyPerformance {
  strategyId: StrategyId;
  horizonDays: number;
  signalsEvaluated: number;
  winRatePct: number;
  avgTradeReturnPct: number;
  cumulativeReturnPct: number;
  maxDrawdownPct: number;
  sharpeAnnualized: number | null;
}

export interface BacktestOptions {
  horizonDays?: number;
}

export function backtestStrategy(
  strategyId: StrategyId,
  bars: Bar[],
  options: BacktestOptions = {},
): StrategyPerformance | null {
  const strategy = getStrategy(strategyId);
  if (!strategy || bars.length < 120) return null;

  const horizon = options.horizonDays ?? 5;
  const tradeReturns: number[] = [];
  let equity = 1;

  for (let i = 80; i < bars.length - horizon; ) {
    const history = bars.slice(0, i + 1);
    const v = strategy.evaluate(history);
    const forward = (bars[i + horizon].c - bars[i].c) / bars[i].c;
    if (v.direction === "BUY") {
      tradeReturns.push(forward);
      equity *= 1 + forward;
      i += horizon;
    } else if (v.direction === "SELL") {
      tradeReturns.push(-forward);
      equity *= 1 - forward;
      i += horizon;
    } else {
      i += 1;
    }
  }

  if (tradeReturns.length === 0) {
    return {
      strategyId,
      horizonDays: horizon,
      signalsEvaluated: 0,
      winRatePct: 0,
      avgTradeReturnPct: 0,
      cumulativeReturnPct: 0,
      maxDrawdownPct: 0,
      sharpeAnnualized: null,
    };
  }

  const wins = tradeReturns.filter((r) => r > 0).length;
  const avg = tradeReturns.reduce((a, b) => a + b, 0) / tradeReturns.length;
  const sd = stdev(tradeReturns);
  const sharpe =
    sd > 0 ? (avg / sd) * Math.sqrt(252 / horizon) : null;
  const dd = drawdownStats(tradeReturns.map((_, i) =>
    tradeReturns.slice(0, i + 1).reduce((a, b) => a + b, 0) + 1,
  ));

  return {
    strategyId,
    horizonDays: horizon,
    signalsEvaluated: tradeReturns.length,
    winRatePct: round((wins / tradeReturns.length) * 100, 1),
    avgTradeReturnPct: round(avg * 100, 2),
    cumulativeReturnPct: round((equity - 1) * 100, 2),
    maxDrawdownPct: round(dd.maxDrawdownPct, 2),
    sharpeAnnualized: sharpe === null ? null : round(sharpe, 2),
  };
}
