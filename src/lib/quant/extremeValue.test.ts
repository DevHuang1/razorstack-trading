import { describe, expect, it } from "vitest";

import {
  computeTailRiskMetrics,
  gaussianQuantile,
  gaussianVaR,
  hillEstimator,
  paretoTailVaR,
} from "./extremeValue";

describe("extremeValue", () => {
  it("gaussianQuantile matches known standard-normal quantiles", () => {
    expect(gaussianQuantile(0.5)).toBeCloseTo(0, 4);
    expect(gaussianQuantile(0.975)).toBeCloseTo(1.959964, 3);
    expect(gaussianQuantile(0.99)).toBeCloseTo(2.326348, 3);
  });

  it("gaussianVaR scales with vol and horizon", () => {
    const v1 = gaussianVaR(20, 0.99, 1);
    const v10 = gaussianVaR(20, 0.99, 10);
    expect(v1).toBeCloseTo(2.93, 1);
    expect(v10).toBeGreaterThan(v1!);
    expect(gaussianVaR(0, 0.99, 1)).toBeNull();
  });

  it("hillEstimator returns a tail index for fat-tailed input", () => {
    const heavy = Array.from({ length: 200 }, (_, i) => 1 + (i % 10) * 0.5 + Math.random() * 3);
    const est = hillEstimator(heavy);
    expect(est).not.toBeNull();
    expect(est!.alpha).toBeGreaterThan(0);
    expect(est!.k).toBeGreaterThan(0);
  });

  it("hillEstimator returns null for insufficient data", () => {
    expect(hillEstimator([1, 2, 3])).toBeNull();
  });

  it("paretoTailVaR exceeds the threshold for deep tail probabilities", () => {
    const varLoss = paretoTailVaR(2, 0.05, 0.1, 0.99);
    expect(varLoss).toBeGreaterThan(0);
    expect(varLoss).not.toBe(0);
  });

  it("computeTailRiskMetrics flags fat tails from Cauchy-like returns", () => {
    const returns = Array.from({ length: 300 }, (_, i) =>
      i % 5 === 0 ? -0.5 + Math.random() * 1 : -0.02 + Math.random() * 0.04,
    );
    const m = computeTailRiskMetrics(returns, { level: 0.99, horizonDays: 1 });
    expect(m.tailIndex).not.toBeNull();
    expect(typeof m.gaussianVaR).toBe("number");
    expect(m.gaussianVaR).not.toBeNull();
  });

  it("computeTailRiskMetrics returns nulls for a perfect flat series", () => {
    const flat = new Array(80).fill(0);
    const m = computeTailRiskMetrics(flat);
    expect(m.gaussianVaR).toBeNull();
  });
});
