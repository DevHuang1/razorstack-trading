import { beforeEach, describe, expect, it, vi } from "vitest";
import type { Bar } from "@/lib/quant/types";

const backendFetchMock = vi.fn();
const getBarsMock = vi.fn();

vi.mock("@/lib/backend/client", () => ({
  backendFetch: (...args: unknown[]) => backendFetchMock(...args),
}));

vi.mock("@/lib/quant/datafeed", () => ({
  getBars: (...args: unknown[]) => getBarsMock(...args),
}));

import { backendMarketDataProvider, buildSnapshotFromBackend } from "./backend-market-data";

function makeBars(count: number, startPrice = 100): Bar[] {
  return Array.from({ length: count }, (_, i) => ({
    t: new Date(Date.UTC(2026, 0, 1 + i)).toISOString(),
    o: startPrice + i,
    h: startPrice + i + 1,
    l: startPrice + i - 1,
    c: startPrice + i,
    v: 1_000_000,
  }));
}

beforeEach(() => {
  backendFetchMock.mockReset();
  getBarsMock.mockReset();
});

describe("buildSnapshotFromBackend", () => {
  it("computes the research snapshot fields from real bars", () => {
    const bars = makeBars(60);
    const snapshot = buildSnapshotFromBackend("nvda", {
      quote: null,
      sector: null,
      bars,
      barsSource: "alpaca",
    });

    expect(snapshot.symbol).toBe("NVDA");
    expect(snapshot.price).toBe(159);
    expect(snapshot.change1mPct).toBeGreaterThan(5);
    expect(snapshot.regime).toBe("risk_on");
    expect(snapshot.rsi14).toBeGreaterThan(70);
    expect(snapshot.sma20).toBeCloseTo(149.5, 1);
    expect(snapshot.sma50).toBeCloseTo(134.5, 1);
    expect(snapshot.realizedVol30dAnnPct).toBeGreaterThanOrEqual(0);
    expect(snapshot.sector).toBe("Other");
    expect(snapshot.dataSource).toBe("alpaca");
    expect(snapshot.latestVolume).toBe(1_000_000);
    expect(snapshot.averageVolume30d).toBeCloseTo(1_000_000, 0);
  });

  it("prefers the live quote only when one is provided", () => {
    const bars = makeBars(60);
    const withQuote = buildSnapshotFromBackend("NVDA", {
      quote: { symbol: "NVDA", price: 160.5, timestamp: "2026-09-01T15:00:00Z" },
      sector: "Technology",
      bars,
    });
    expect(withQuote.price).toBe(160.5);
    expect(withQuote.sector).toBe("Technology");
  });

  it("classifies a downtrend as risk_off", () => {
    const bars = makeBars(60, 300).map((b, i) => ({ ...b, c: 300 - i }));
    const snapshot = buildSnapshotFromBackend("XYZ", { quote: null, sector: null, bars });
    expect(snapshot.change1mPct).toBeLessThan(-5);
    expect(snapshot.regime).toBe("risk_off");
  });
});

describe("backendMarketDataProvider", () => {
  it("builds the snapshot from the backend quote, positions and bars", async () => {
    backendFetchMock.mockImplementation((path: string) => {
      if (path === "/market/NVDA") {
        return Promise.resolve({
          ok: true,
          status: 200,
          data: { symbol: "NVDA", price: 334.13, timestamp: "2026-09-01T15:00:00Z" },
        });
      }
      if (path === "/portfolio") {
        return Promise.resolve({
          ok: true,
          status: 200,
          data: { positions: [{ symbol: "NVDA", sector: "Technology" }] },
        });
      }
      return Promise.resolve({ ok: false, status: 404, error: "not found" });
    });
    getBarsMock.mockResolvedValue({ bars: makeBars(60), source: "ALPACA" });

    const snapshot = await backendMarketDataProvider.getMarketSnapshot("nvda");

    expect(snapshot.symbol).toBe("NVDA");
    expect(snapshot.price).toBe(334.13);
    expect(snapshot.sector).toBe("Technology");
    expect(getBarsMock).toHaveBeenCalledWith("NVDA", "1Day", 60);
  });

  it("ignores the live quote when the bar series is synthetic", async () => {
    backendFetchMock.mockResolvedValue({
      ok: true,
      status: 200,
      data: { symbol: "NVDA", price: 334.13 },
    });
    getBarsMock.mockResolvedValue({ bars: makeBars(60), source: "SYNTHETIC" });

    const snapshot = await backendMarketDataProvider.getMarketSnapshot("NVDA");

    // Price must come from the synthetic bars, not a live quote.
    expect(snapshot.price).toBe(159);
  });

  it("falls back to the mock provider when bars are unavailable", async () => {
    backendFetchMock.mockResolvedValue({ ok: false, status: null, error: "Backend is unavailable" });
    getBarsMock.mockResolvedValue({ bars: [], source: "SYNTHETIC" });

    const snapshot = await backendMarketDataProvider.getMarketSnapshot("NVDA");

    expect(snapshot.symbol).toBe("NVDA");
    expect(["Technology", "Financials", "Healthcare", "Energy", "Consumer"]).toContain(snapshot.sector);
  });

  it("delegates news to the mock feed (no backend news endpoint yet)", async () => {
    const news = await backendMarketDataProvider.getRecentNews("NVDA", 2);
    expect(news).toHaveLength(2);
    expect(news[0]?.id).toMatch(/^NVDA-mock-/);
  });
});