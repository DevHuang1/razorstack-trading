import { beforeEach, describe, expect, it } from "vitest";

import { leaderboard, listPaperRecords, recordSignal, resolveOutcome } from "./paper";

const KEY = "razorstack-quant-paper";

beforeEach(() => {
  try {
    localStorage.setItem(KEY, "[]");
  } catch {
    /* ignore */
  }
});

describe("paper tracker", () => {
  it("records a signal and lists it", () => {
    const rec = recordSignal({
      symbol: "aapl",
      strategy: "MOMENTUM",
      modelVersion: "quant-composite-v1",
      timeframe: "1Day",
      horizonDays: 5,
      entryPrice: 100,
      direction: "BUY",
    });
    expect(rec.symbol).toBe("AAPL");
    expect(rec.realizedReturn).toBeNull();
    const listed = listPaperRecords();
    expect(listed.length).toBe(1);
    expect(listed[0].strategy).toBe("MOMENTUM");
  });

  it("resolves an outcome with sign-aware realized return", () => {
    const buy = recordSignal({
      symbol: "AAPL", strategy: "MOMENTUM", modelVersion: "v1", timeframe: "1Day",
      horizonDays: 5, entryPrice: 100, direction: "BUY",
    });
    const resolved = resolveOutcome(buy.id, 110);
    expect(resolved).not.toBeNull();
    expect(resolved!.realizedReturn).toBeCloseTo(0.1);

    const short = recordSignal({
      symbol: "TSLA", strategy: "NEWS", modelVersion: "v1", timeframe: "1Day",
      horizonDays: 5, entryPrice: 100, direction: "SELL",
    });
    const shortOutcome = resolveOutcome(short.id, 90);
    expect(shortOutcome!.realizedReturn).toBeCloseTo(0.1);
  });

  it("returns null when resolving an unknown id", () => {
    expect(resolveOutcome("nope", 100)).toBeNull();
  });

  it("builds a leaderboard sorted by PnL", () => {
    const win = recordSignal({
      symbol: "A", strategy: "MOMENTUM", modelVersion: "v1", timeframe: "1Day",
      horizonDays: 5, entryPrice: 100, direction: "BUY",
    });
    const lose = recordSignal({
      symbol: "B", strategy: "NEWS", modelVersion: "v1", timeframe: "1Day",
      horizonDays: 5, entryPrice: 100, direction: "BUY",
    });
    resolveOutcome(win.id, 120);
    resolveOutcome(lose.id, 90);

    const lb = leaderboard();
    expect(lb[0].strategy).toBe("MOMENTUM");
    expect(lb[0].withOutcome).toBe(1);
    expect(lb[0].winRatePct).toBe(100);
    expect(lb[0].pnlPct).toBeGreaterThan(0);
    const news = lb.find((e) => e.strategy === "NEWS")!;
    expect(news.winRatePct).toBe(0);
  });
});
