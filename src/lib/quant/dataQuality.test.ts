import { describe, expect, it } from "vitest";

import { assessDataQuality } from "./dataQuality";
import type { Bar } from "./types";

function nextBusinessDay(date: Date): Date {
  const out = new Date(date);
  do {
    out.setUTCDate(out.getUTCDate() + 1);
  } while (out.getUTCDay() === 0 || out.getUTCDay() === 6);
  return out;
}

function dailyBars(count: number, options: { gapAfter?: number; dupeAt?: number } = {}): Bar[] {
  const out: Bar[] = [];
  let cursor = new Date(Date.UTC(2026, 0, 1));
  for (let i = 0; i < count; i++) {
    let t = new Date(cursor).toISOString();
    if (options.gapAfter !== undefined && i > options.gapAfter) {
      t = new Date(nextBusinessDay(new Date(t))).toISOString();
      t = new Date(nextBusinessDay(new Date(t))).toISOString();
    }
    out.push({ t, o: 100 + i, h: 102 + i, l: 99 + i, c: 101 + i, v: 100_000 });
    cursor = nextBusinessDay(new Date(cursor));
  }
  if (options.dupeAt !== undefined) {
    out.splice(options.dupeAt + 1, 0, { ...out[options.dupeAt] });
  }
  return out;
}

describe("assessDataQuality", () => {
  it("returns isActionable for clean, fresh daily history", () => {
    const bars = dailyBars(60);
    const q = assessDataQuality("aapl", "1Day", bars, {
      asOf: new Date(Date.UTC(2026, 2, 3)),
    });
    expect(q.symbol).toBe("AAPL");
    expect(q.barCount).toBe(60);
    expect(q.duplicateBarCount).toBe(0);
    expect(q.missingBarCount).toBe(0);
    expect(q.isActionable).toBe(true);
    expect(q.warnings).toEqual([]);
  });

  it("flags duplicates, gaps, short history and staleness", () => {
    const bars = dailyBars(20, { gapAfter: 10, dupeAt: 5 });
    const q = assessDataQuality("msft", "1Day", bars, {
      asOf: new Date(Date.UTC(2026, 2, 15)),
      minHistoryBars: 60,
      maxGapBars: 0,
    });
    expect(q.isActionable).toBe(false);
    expect(q.duplicateBarCount).toBe(1);
    expect(q.missingBarCount).toBeGreaterThanOrEqual(1);
    expect(q.maxGapBars).toBeGreaterThanOrEqual(1);
    expect(q.stale).toBe(true);
    const kinds = new Set(q.warnings.map((w) => w.split(":")[0]));
    expect(kinds).toEqual(
      new Set(["history_short", "duplicate_bars", "gap_too_large", "stale_last_bar"]),
    );
  });

  it("treats weekend skipping as expected for daily bars (no phantom gap)", () => {
    const bars = dailyBars(5);
    const q = assessDataQuality("aapl", "1Day", bars, {});
    expect(q.missingBarCount).toBe(0);
  });

  it("normalises symbol to upper case", () => {
    const q = assessDataQuality("nvda", "1Hour", dailyBars(10), {});
    expect(q.symbol).toBe("NVDA");
  });
});
