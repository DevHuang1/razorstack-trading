import { describe, expect, it } from "vitest";
import type { AnalysisStatement } from "@/lib/contracts/research";
import { assertNumeralsGrounded, assertSourcesGrounded } from "./grounding";

const obs = (statement: string): AnalysisStatement => ({ kind: "observation", statement });

const snapshot = {
  price: 334.13,
  rsi14: 63.7,
  sma20: 325.15,
  change1mPct: 18.06,
  latestVolume: 82_500_000,
};

describe("assertNumeralsGrounded", () => {
  it("accepts statements whose precise numbers appear in the data", () => {
    expect(() =>
      assertNumeralsGrounded(
        [obs("Latest price $334.13 versus 20-day SMA $325.15"), obs("RSI(14) at 63.7")],
        snapshot,
      ),
    ).not.toThrow();
  });

  it("ignores indicator-window integers and small counts", () => {
    expect(() =>
      assertNumeralsGrounded([obs("RSI(14) sits between the 20-day and 50-day averages")], snapshot),
    ).not.toThrow();
  });

  it("allows tiny float representation drift within tolerance", () => {
    expect(() => assertNumeralsGrounded([obs("1-month change 18.06%")], { ...snapshot, change1mPct: 18.0600001 })).not.toThrow();
  });

  it("rejects invented precise numbers", () => {
    expect(() =>
      assertNumeralsGrounded([obs("Price broke above the 400.50 resistance level")], snapshot),
    ).toThrow(/400\.5/);
  });
});

describe("assertSourcesGrounded", () => {
  const allowed = ["Reuters", "Bloomberg"];

  it("accepts statements citing provided sources case-insensitively", () => {
    expect(() => assertSourcesGrounded([obs("Headline text (source: reuters)")], allowed)).not.toThrow();
  });

  it("accepts unattributed statements", () => {
    expect(() => assertSourcesGrounded([obs("No attribution here at all")], allowed)).not.toThrow();
  });

  it("rejects fabricated sources", () => {
    expect(() =>
      assertSourcesGrounded([obs("Something happened (source: CryptoMoonDaily)")], allowed),
    ).toThrow(/CryptoMoonDaily/);
  });
});
