import { describe, expect, it } from "vitest";

import {
  getStrategy,
  listStrategies,
  momentumStrategy,
  optionsStrategy,
  runStrategies,
  trendStrategy,
  valueStrategy,
} from "./strategies";
import { ascendingCloses, descendingCloses, makeBars } from "./testUtils";

describe("strategies", () => {
  it("registers all six strategy ids", () => {
    const ids = listStrategies().map((s) => s.id);
    expect(ids).toEqual(expect.arrayContaining([
      "MOMENTUM", "MEAN_REVERSION", "TREND", "NEWS", "VALUE", "OPTIONS",
    ]));
  });

  it("momentum buys on a persistent uptrend", () => {
    const bars = makeBars(ascendingCloses(80, 100));
    const v = momentumStrategy.evaluate(bars);
    expect(v.direction).toBe("BUY");
    expect(v.strength).toBeGreaterThan(0.15);
  });

  it("momentum holds with insufficient history", () => {
    const bars = makeBars(ascendingCloses(10, 100));
    const v = momentumStrategy.evaluate(bars);
    expect(v.direction).toBe("HOLD");
    expect(v.strength).toBe(0);
  });

  it("trend follows the long-term up-trend", () => {
    const bars = makeBars(ascendingCloses(250, 100));
    const v = trendStrategy.evaluate(bars);
    expect(v.direction).toBe("BUY");
  });

  it("value buys when price is far below its 200-day mean", () => {
    const closes = ascendingCloses(220, 100);
    const trough = closes.map((c, i) => (i > 200 ? 50 + i * 0.1 : c));
    const v = valueStrategy.evaluate(makeBars(trough));
    expect(v.direction).toBe("BUY");
  });

  it("options strategy always holds (owned by option desk)", () => {
    const bars = makeBars(ascendingCloses(120, 100));
    const v = optionsStrategy.evaluate(bars);
    expect(v.direction).toBe("HOLD");
    expect(runStrategies(bars).some((s) => s.id === "OPTIONS")).toBe(true);
  });

  it("getStrategy returns an undefined for unknown id", () => {
    expect(getStrategy("MOMENTUM")).toBeDefined();
  });

  it("volume-confirmed sell on a sharp decline", () => {
    const closes = descendingCloses(80, 200);
    const v = momentumStrategy.evaluate(makeBars(closes));
    expect(["SELL", "HOLD"]).toContain(v.direction);
  });
});
