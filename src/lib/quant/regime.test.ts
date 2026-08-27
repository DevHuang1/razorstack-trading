import { describe, expect, it } from "vitest";

import { detectRegime, riskMultiplierFor, volRegimeFor } from "./regime";
import { ascendingCloses, descendingCloses, makeBars } from "./testUtils";

describe("regime", () => {
  it("volRegimeFor maps percentiles to regimes", () => {
    expect(volRegimeFor(null)).toBe("NORMAL");
    expect(volRegimeFor(0.95)).toBe("CRISIS");
    expect(volRegimeFor(0.8)).toBe("VOLATILE");
    expect(volRegimeFor(0.1)).toBe("QUIET");
    expect(volRegimeFor(0.5)).toBe("NORMAL");
  });

  it("riskMultiplierFor scales risk with volatility", () => {
    expect(riskMultiplierFor(0.95)).toBe(0);
    expect(riskMultiplierFor(0.8)).toBe(0.5);
    expect(riskMultiplierFor(0.1)).toBe(1.25);
    expect(riskMultiplierFor(0.5)).toBe(1);
    expect(riskMultiplierFor(null)).toBe(1);
  });

  it("detects a bull trend in a rising series", () => {
    const bars = makeBars(ascendingCloses(260, 100));
    const r = detectRegime(bars, "SPY");
    expect(r.trend).toBe("BULL_TREND");
    expect(r.benchmark).toBe("SPY");
    expect(r.riskMultiplier).toBeGreaterThanOrEqual(1);
  });

  it("detects a bear trend in a falling series", () => {
    const bars = makeBars(descendingCloses(260, 300));
    const r = detectRegime(bars, "SPY");
    expect(r.trend).toBe("BEAR_TREND");
  });
});
