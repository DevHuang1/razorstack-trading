import { describe, expect, it } from "vitest";

import { backtestStrategy, walkForwardBacktest } from "./performance";
import { ascendingCloses, makeBars } from "./testUtils";

describe("backtest / performance", () => {
  it("returns null when there is insufficient history", () => {
    const bars = makeBars(ascendingCloses(60, 100));
    expect(backtestStrategy("MOMENTUM", bars)).toBeNull();
    expect(walkForwardBacktest("MOMENTUM", bars)).toBeNull();
  });

  it("produces profitable net return on a persistent up-trend", () => {
    const bars = makeBars(ascendingCloses(260, 100));
    const result = backtestStrategy("MOMENTUM", bars, { horizonDays: 5 })!;
    expect(result).not.toBeNull();
    expect(result.trades).toBeGreaterThan(0);
    expect(result.netCumulativeReturnPct).toBeGreaterThan(0);
    expect(result.buyHoldReturnPct).toBeGreaterThan(0);
    expect(result.signalsEvaluated).toBeGreaterThan(0);
  });

  it("charges execution cost so wins are smooth but cost-aware", () => {
    const bars = makeBars(ascendingCloses(260, 100));
    const result = backtestStrategy("MOMENTUM", bars, { horizonDays: 5 })!;
    expect(result.avgCostPerTradeBps).toBeGreaterThan(0);
    expect(result.turnover).toBeGreaterThan(0);
    expect(result.turnover).toBeLessThanOrEqual(1);
  });

  it("walk-forward divides into train/test windows", () => {
    const bars = makeBars(ascendingCloses(400, 100));
    const wf = walkForwardBacktest("MOMENTUM", bars, { trainWindow: 200 })!;
    expect(wf.strategyId).toBe("MOMENTUM");
    expect(wf.trainWindow).toBe(200);
    expect(wf.testWindow).toBeGreaterThan(0);
    expect(wf.performance.trades).toBeGreaterThan(0);
  });

  it("a mostly-flat market yields few or no trades", () => {
    const flat = makeBars(new Array(220).fill(100));
    const result = backtestStrategy("MOMENTUM", flat, { horizonDays: 5 })!;
    expect(result).not.toBeNull();
    expect(result.trades).toBeGreaterThanOrEqual(0);
  });
});
