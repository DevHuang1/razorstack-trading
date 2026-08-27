import { describe, expect, it } from "vitest";

import { allocatePortfolio } from "./allocation";
import type { MarketRegime } from "./types";

function smoothSeries(n: number, step: number): number[] {
  return Array.from({ length: n }, (_, i) => 1 + i * step);
}

const regime: MarketRegime = {
  label: "RANGE / NORMAL",
  trend: "RANGE",
  volatility: "NORMAL",
  benchmark: "SPY",
  benchmarkTrendScore: 0,
  benchmarkVolPercentile: 0.5,
  benchmarkRealizedVolAnnualized: 15,
  riskMultiplier: 1,
  crisis: false,
};

describe("allocatePortfolio", () => {
  it("weights equal-volatility assets equally and sums to 1", () => {
    const result = allocatePortfolio({
      symbols: ["A", "B", "C"],
      returnSeries: {
        A: smoothSeries(120, 0.01),
        B: smoothSeries(120, 0.01),
        C: smoothSeries(120, 0.01),
      },
      regime,
    });
    expect(result.weights.A).toBeCloseTo(result.weights.B, 2);
    expect(result.weights.B).toBeCloseTo(result.weights.C, 2);
    expect(result.weights.A + result.weights.B + result.weights.C).toBeCloseTo(1, 5);
  });

  it("gives the lower-volatility asset a higher weight", () => {
    const result = allocatePortfolio({
      symbols: ["LOW", "HIGH"],
      returnSeries: {
        LOW: smoothSeries(120, 0.001),
        HIGH: smoothSeries(120, 0.05),
      },
      regime,
    });
    expect(result.weights.LOW).toBeGreaterThan(result.weights.HIGH);
  });

  it("caps concentration at maxConcentration", () => {
    const result = allocatePortfolio({
      symbols: ["A", "B"],
      returnSeries: {
        A: smoothSeries(120, 0.3),
        B: smoothSeries(120, 0.3),
      },
      regime,
      maxConcentration: 0.4,
    });
    expect(Math.max(...Object.values(result.weights))).toBeLessThanOrEqual(0.4 + 1e-9);
  });

  it("applies a crisis regime risk multiplier of zero", () => {
    const crisis: MarketRegime = { ...regime, volatility: "CRISIS", riskMultiplier: 0, crisis: true };
    const result = allocatePortfolio({
      symbols: ["A"],
      returnSeries: { A: smoothSeries(120, 0.01) },
      regime: crisis,
    });
    expect(result.weights.A).toBe(0);
    expect(result.regimeMultiplier).toBe(0);
  });

  it("returns notes describing applied regime multiplier", () => {
    const result = allocatePortfolio({
      symbols: ["A"],
      returnSeries: { A: smoothSeries(120, 0.01) },
      regime,
    });
    expect(result.notes.join(" ")).toContain("risk-multiplier 1.00");
  });
});
