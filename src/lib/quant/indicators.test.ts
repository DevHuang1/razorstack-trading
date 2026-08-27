import { describe, expect, it } from "vitest";

import {
  annualizationFactor,
  atr,
  bollinger,
  clamp,
  correlation,
  dailyReturns,
  drawdownStats,
  ema,
  lastValue,
  normalizedSlope,
  obv,
  percentileRank,
  realizedVolSeries,
  relativeVolume,
  rsi,
  roc,
  round,
  sharpeRatio,
  sma,
  sortinoRatio,
  stdev,
} from "./indicators";
import { makeBars } from "./testUtils";

describe("indicators", () => {
  it("clamps to the inclusive range", () => {
    expect(clamp(5, 0, 10)).toBe(5);
    expect(clamp(-2, 0, 10)).toBe(0);
    expect(clamp(12, 0, 10)).toBe(10);
  });

  it("lastValue returns the last non-null finite value", () => {
    expect(lastValue([null, 1, null, 2])).toBe(2);
    expect(lastValue([null, null])).toBeNull();
    expect(lastValue([Infinity, 3])).toBe(3);
  });

  it("sma produces the trailing window mean with null warm-up", () => {
    const out = sma([1, 2, 3, 4, 5], 3);
    expect(out[0]).toBeNull();
    expect(out[1]).toBeNull();
    expect(out[2]).toBeCloseTo(2);
    expect(out[3]).toBeCloseTo(3);
    expect(out[4]).toBeCloseTo(4);
  });

  it("ema aligns its first value to the period seed", () => {
    const out = ema([1, 1, 1, 1, 1], 3);
    expect(out.slice(0, 2).every((v) => v === null)).toBe(true);
    expect(out[2]).toBeCloseTo(1);
    expect(out[4]).toBeCloseTo(1);
  });

  it("rsi is 100 when there are no losses", () => {
    const out = rsi([1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15, 16], 3);
    const valid = out.filter((v): v is number => v !== null);
    expect(valid.length).toBeGreaterThan(0);
    for (const v of valid) expect(v).toBe(100);
  });

  it("roc measures the relative change over n bars", () => {
    expect(roc([100, 110], 1)).toBeCloseTo(0.1);
    expect(roc([100, 110], 5)).toBeNull();
  });

  it("stdev uses sample (n - 1) denominator", () => {
    expect(stdev([1, 2, 3, 4, 5])).toBeCloseTo(Math.sqrt(2.5));
  });

  it("annualizationFactor maps timeframes", () => {
    expect(annualizationFactor("1Day")).toBe(252);
    expect(annualizationFactor("1Min")).toBe(390 * 252);
    expect(annualizationFactor("unknown")).toBe(252);
  });

  it("atr reflects true range across gaps", () => {
    const bars = makeBars([100, 102, 104, 106]);
    const out = atr(bars, 3);
    expect(out[3]).toBeGreaterThan(0);
  });

  it("bollinger bands place price inside the middle band", () => {
    const { middle, upper, lower } = bollinger(ascending(20), 20, 2);
    const m = lastValue(middle);
    const u = lastValue(upper);
    const l = lastValue(lower);
    expect(m).not.toBeNull();
    expect(u! > m!).toBe(true);
    expect(l! < m!).toBe(true);
  });

  it("relativeVolume divides latest by prior average", () => {
    expect(relativeVolume([10, 10, 10, 20], 3)).toBeCloseTo(2);
    expect(relativeVolume([10, 10], 3)).toBeNull();
  });

  it("obv accumulates volume on up days and subtracts on down days", () => {
    const bars = makeBars([10, 11, 10, 12], { volume: 5 });
    const out = obv(bars);
    expect(out).toEqual([0, 5, 0, 5]);
  });

  it("drawdownStats reports max and current drawdown", () => {
    const { maxDrawdownPct, currentDrawdownPct } = drawdownStats([100, 120, 60]);
    expect(maxDrawdownPct).toBeCloseTo(50);
    expect(currentDrawdownPct).toBeCloseTo(50);
  });

  it("sharpeRatio annualizes by barsPerYear", () => {
    expect(sharpeRatio([0.01, 0.01, 0.01], 252)).toBeNull();
    const s = sharpeRatio([0.01, 0.01, 0.01, 0.01, 0.01], 252)!;
    expect(s).toBeCloseTo(0);
    expect(sharpeRatio([1, 2, 3], 252)).not.toBeNull();
  });

  it("sortinoRatio only penalises downside deviation", () => {
    const s = sortinoRatio([0.02, -0.01, 0.03], 252)!;
    expect(s).not.toBeNull();
    expect(sortinoRatio([0.02, 0.02], 252)).toBeNull();
  });

  it("correlation returns 1 for identical series and null for constants", () => {
    expect(correlation([1, 2, 3], [2, 4, 6])).toBeCloseTo(1);
    expect(correlation([1, 1, 1], [1, 2, 3])).toBeNull();
  });

  it("normalizedSlope is (last - prior) / prior", () => {
    expect(normalizedSlope([100, 105], 1)).toBeCloseTo(0.05);
    expect(normalizedSlope([100], 1)).toBeNull();
  });

  it("percentileRank counts values at or below", () => {
    expect(percentileRank([1, 2, 3, 4], 3)).toBeCloseTo(0.75);
    expect(percentileRank([], 3)).toBeNull();
  });

  it("dailyReturns drops zero or invalid predecessors", () => {
    expect(dailyReturns([100, 110, 121]).map((r) => round(r, 3))).toEqual([
      0.1, 0.1,
    ]);
  });

  it("realizedVolSeries produces positive annualized vol after warm-up", () => {
    const closes = ascending(30, 100);
    const vols = realizedVolSeries(closes, 20, 252);
    const last = lastValue(vols);
    expect(last).not.toBeNull();
    expect(last!).toBeGreaterThan(0);
  });

  it("round to specified digits", () => {
    expect(round(1.23456, 2)).toBe(1.23);
    expect(round(1.5, 0)).toBe(2);
  });
});

function ascending(n: number, start = 100): number[] {
  const out: number[] = [];
  for (let i = 0; i < n; i++) out.push(start + i);
  return out;
}
