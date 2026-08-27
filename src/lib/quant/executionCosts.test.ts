import { describe, expect, it } from "vitest";

import { DEFAULT_EXECUTION_COST_CONFIG, estimateExecutionCost } from "./executionCosts";

describe("estimateExecutionCost", () => {
  it("computes participation, impact and total cost for a buy", () => {
    const e = estimateExecutionCost({
      symbol: "aapl",
      side: "buy",
      quantity: 100,
      referencePrice: 100,
      averageDailyVolume: 10_000,
    });
    expect(e.symbol).toBe("AAPL");
    expect(e.grossNotional).toBe(10_000);
    expect(e.participationRatePct).toBeCloseTo(1);
    expect(e.marketImpactBps).toBeCloseTo(2);
    expect(e.effectiveSlippageBps).toBeCloseTo(7);
    expect(e.estimatedSlippage).toBeCloseTo(7);
    expect(e.totalCost).toBeCloseTo(7);
    expect(e.costAsFractionOfNotional).toBeCloseTo(0.0007, 6);
  });

  it("caps market impact at the configured maximum", () => {
    const e = estimateExecutionCost({
      symbol: "AAPL",
      side: "buy",
      quantity: 1_000_000,
      referencePrice: 10,
      averageDailyVolume: 100,
    });
    expect(e.marketImpactBps).toBeCloseTo(DEFAULT_EXECUTION_COST_CONFIG.maxMarketImpactBps);
    expect(e.effectiveSlippageBps).toBeCloseTo(55);
  });

  it("returns zero impact when ADV is unknown", () => {
    const e = estimateExecutionCost({
      symbol: "AAPL",
      side: "sell",
      quantity: 50,
      referencePrice: 200,
      averageDailyVolume: null,
    });
    expect(e.participationRatePct).toBeNull();
    expect(e.marketImpactBps).toBe(0);
    expect(e.effectiveSlippageBps).toBeCloseTo(DEFAULT_EXECUTION_COST_CONFIG.baseSlippageBps);
  });

  it("honours an overridden config", () => {
    const e = estimateExecutionCost({
      symbol: "AAPL",
      side: "buy",
      quantity: 100,
      referencePrice: 100,
      averageDailyVolume: 10_000,
      config: { baseSlippageBps: 10, commissionPerShare: 0.01, fixedFee: 1.0 },
    });
    expect(e.effectiveSlippageBps).toBeCloseTo(12);
    expect(e.commission).toBeCloseTo(1);
    expect(e.fixedFee).toBeCloseTo(1);
    expect(e.totalCost).toBeCloseTo(12 + 1 + 1);
  });
});
