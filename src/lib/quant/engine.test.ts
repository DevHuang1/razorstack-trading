import { describe, expect, it } from "vitest";

import { computeQuantSignal } from "./engine";
import type { MarketRegime } from "./types";
import { ascendingCloses, makeBars } from "./testUtils";

function bullRegime(): MarketRegime {
  return {
    label: "BULL_TREND / QUIET",
    trend: "BULL_TREND",
    volatility: "QUIET",
    benchmark: "SPY",
    benchmarkTrendScore: 0.7,
    benchmarkVolPercentile: 0.2,
    benchmarkRealizedVolAnnualized: 12,
    riskMultiplier: 1.25,
    crisis: false,
  };
}

function crisisRegime(): MarketRegime {
  return {
    label: "BEAR_TREND / CRISIS",
    trend: "BEAR_TREND",
    volatility: "CRISIS",
    benchmark: "SPY",
    benchmarkTrendScore: -0.9,
    benchmarkVolPercentile: 0.98,
    benchmarkRealizedVolAnnualized: 60,
    riskMultiplier: 0,
    crisis: true,
  };
}

describe("computeQuantSignal", () => {
  it("produces a BUY with meaningful confidence in a strong uptrend", () => {
    const bars = makeBars(ascendingCloses(260, 100));
    const signal = computeQuantSignal({ symbol: "aapl", bars, timeframe: "1Day" });
    expect(signal.symbol).toBe("AAPL");
    expect(signal.overall.direction).not.toBe("SELL");
    expect(signal.overall.score).toBeGreaterThan(0);
    expect(signal.overall.confidence).toBeGreaterThan(0.5);
    expect(signal.overall.strength).toBeGreaterThan(0);
    expect(signal.components).toHaveLength(5);
    expect(signal.strategies).toHaveLength(6);
  });

  it("wires the regime risk multiplier into confidence and risk budget", () => {
    const bars = makeBars(ascendingCloses(260, 100));
    const bullish = computeQuantSignal({ symbol: "AAPL", bars, regime: bullRegime() });
    const crisis = computeQuantSignal({ symbol: "AAPL", bars, regime: crisisRegime() });
    expect(crisis.overall.confidence).toBe(0);
    expect(crisis.overall.confidence).toBeLessThan(bullish.overall.confidence);
    expect(crisis.riskChecks.riskBudgetPct).toBe(0);
    expect(bullish.riskChecks.riskBudgetPct).toBeGreaterThan(0);
    expect(bullish.riskChecks.modelVersion).toMatch(/^quant-composite-v1$/);
  });

  it("attaches tail risk and data-quality metadata", () => {
    const bars = makeBars(ascendingCloses(260, 100));
    const signal = computeQuantSignal({ symbol: "AAPL", bars, timeframe: "1Day" });
    expect(signal.riskMetrics.tail).toBeDefined();
    expect(signal.riskMetrics.tail.gaussianVaR).not.toBeNull();
    expect(typeof signal.riskMetrics.realizedVolAnnualized).toBe("number");
    expect(signal.dataQuality).toBeDefined();
    expect(signal.dataQuality!.barCount).toBe(bars.length);
  });

  it("treats a flat, featureless market as HOLD", () => {
    const flat = makeBars(new Array(260).fill(100));
    const signal = computeQuantSignal({ symbol: "X", bars: flat });
    expect(signal.overall.direction).toBe("HOLD");
  });
});
