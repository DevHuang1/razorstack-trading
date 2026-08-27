import { describe, expect, it } from "vitest";

import { priceAmericanPut } from "./americanPricing";

describe("priceAmericanPut (Crank-Nicolson + projected SOR)", () => {
  it("matches the Black-Scholes European put for an ATM option", () => {
    const r = priceAmericanPut({
      spot: 100,
      strike: 100,
      riskFree: 0.05,
      sigma: 0.2,
      maturity: 1,
      american: false,
    });
    expect(r.europeanPrice).toBeCloseTo(5.57, 0);
  });

  it("american premium is non-negative and bounded", () => {
    const r = priceAmericanPut({
      spot: 100,
      strike: 100,
      riskFree: 0.05,
      sigma: 0.2,
      maturity: 1,
    });
    expect(r.price).toBeGreaterThanOrEqual(r.europeanPrice);
    expect(r.earlyExercisePremium).toBeGreaterThanOrEqual(0);
    expect(r.price).toBeLessThanOrEqual(100);
  });

  it("reports exercised for a deep in-the-money put", () => {
    const r = priceAmericanPut({
      spot: 60,
      strike: 140,
      riskFree: 0.05,
      sigma: 0.3,
      maturity: 1,
    });
    expect(r.exercised).toBe(true);
    expect(r.price).toBeCloseTo(80, 0);
  });

  it("price drops as volatility decreases", () => {
    const hi = priceAmericanPut({ spot: 100, strike: 100, riskFree: 0.05, sigma: 0.4, maturity: 1 }).price;
    const lo = priceAmericanPut({ spot: 100, strike: 100, riskFree: 0.05, sigma: 0.2, maturity: 1 }).price;
    expect(lo).toBeLessThan(hi);
  });

  it("respects explicit grid and time step counts", () => {
    const r = priceAmericanPut({
      spot: 100,
      strike: 100,
      riskFree: 0.05,
      sigma: 0.2,
      maturity: 1,
      gridSteps: 150,
      timeSteps: 300,
    });
    expect(r.gridSteps).toBe(150);
    expect(r.timeSteps).toBe(300);
  });
});
