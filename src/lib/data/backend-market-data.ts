import { backendFetch } from "@/lib/backend/client";
import type { MarketSnapshot, NewsItem } from "@/lib/contracts/research";
import type { Bar } from "@/lib/quant/types";
import { getBars } from "@/lib/quant/datafeed";
import { lastValue, realizedVolSeries, roc, round, rsi, sma } from "@/lib/quant/indicators";
import { mockMarketDataProvider } from "./mock-market-data";
import type { MarketDataProvider } from "./market-data";

// MarketDataProvider implementation that sources real data from the FastAPI
// trading backend: GET /market/{symbol} for the live quote and GET /portfolio
// for the symbol's sector. Indicators (RSI, SMAs, realized vol, changes) are
// computed from daily bars via the quant datafeed. When neither the backend
// nor Alpaca can produce a usable bar series, the deterministic mock provider
// keeps the research desk fully offline-capable.

const FETCH_TIMEOUT_MS = 5_000;
const MIN_BARS_FOR_INDICATORS = 25;

export interface BackendQuote {
  symbol?: string;
  price?: number;
  timestamp?: string;
}

export interface BackendPosition {
  symbol?: string;
  sector?: string;
}

export interface BackendPortfolio {
  positions?: BackendPosition[];
}

export function buildSnapshotFromBackend(
  symbol: string,
  input: {
    quote?: BackendQuote | null;
    sector?: string | null;
    bars: Bar[];
    barsSource?: "alpaca" | "synthetic";
  },
): MarketSnapshot {
  const upper = symbol.toUpperCase();
  const ordered = [...input.bars].sort((a, b) => a.t.localeCompare(b.t));
  const closes = ordered.map((b) => b.c);
  const volumes = ordered.map((b) => b.v);
  const lastClose = closes.length > 0 ? closes[closes.length - 1] : 0;

  // Only trust the live quote when the bar series itself is real (Alpaca);
  // mixing a live price into a synthetic series would produce inconsistent
  // indicator levels (SMAs, RSI) relative to the price.
  const quotePrice =
    input.quote && typeof input.quote.price === "number" && input.quote.price > 0
      ? input.quote.price
      : null;
  const price = quotePrice ?? lastClose;

  const changePct = (n: number): number => {
    const v = roc(closes, n);
    return v === null ? 0 : round(v * 100, 2);
  };
  const change1mPct = changePct(21);
  const rsi14 = lastValue(rsi(closes, 14)) ?? 50;
  const sma20 = lastValue(sma(closes, 20)) ?? price;
  const sma50 = lastValue(sma(closes, 50)) ?? sma20;
  const rv30 = lastValue(realizedVolSeries(closes, 20, 252));
  const avgVolume30d =
    volumes.length > 0
      ? volumes.slice(-30).reduce((a, b) => a + b, 0) / Math.min(30, volumes.length)
      : null;

  return {
    symbol: upper,
    price: round(price, 2),
    change1dPct: changePct(1),
    change5dPct: changePct(5),
    change1mPct,
    rsi14: round(Math.min(100, Math.max(0, rsi14)), 1),
    sma20: round(sma20, 2),
    sma50: round(sma50, 2),
    realizedVol30dAnnPct: rv30 === null ? 0 : round(rv30 * 100, 1),
    sector: input.sector ?? "Other",
    regime: change1mPct > 5 ? "risk_on" : change1mPct < -5 ? "risk_off" : "neutral",
    dataSource: input.barsSource ?? "synthetic",
    ...(volumes.length > 0 ? { latestVolume: volumes[volumes.length - 1] } : {}),
    ...(avgVolume30d !== null && avgVolume30d > 0 ? { averageVolume30d: avgVolume30d } : {}),
  };
}

export const backendMarketDataProvider: MarketDataProvider = {
  async getMarketSnapshot(symbol: string): Promise<MarketSnapshot> {
    const upper = symbol.toUpperCase();
    const [quoteSettled, portfolioSettled, barsSettled] = await Promise.allSettled([
      backendFetch<BackendQuote>(`/market/${encodeURIComponent(upper)}`, {
        timeoutMs: FETCH_TIMEOUT_MS,
      }),
      backendFetch<BackendPortfolio>("/portfolio", { timeoutMs: FETCH_TIMEOUT_MS }),
      getBars(upper, "1Day", 60),
    ]);

    const quote =
      quoteSettled.status === "fulfilled" && quoteSettled.value.ok ? quoteSettled.value.data : null;
    const portfolio =
      portfolioSettled.status === "fulfilled" && portfolioSettled.value.ok
        ? portfolioSettled.value.data
        : null;
    const barsResult = barsSettled.status === "fulfilled" ? barsSettled.value : null;
    const bars = barsResult?.bars ?? [];

    if (bars.length < MIN_BARS_FOR_INDICATORS) {
      // Backend and Alpaca both unavailable — deterministic offline fallback.
      return mockMarketDataProvider.getMarketSnapshot(upper);
    }

    const sector =
      portfolio?.positions?.find(
        (p) => typeof p.symbol === "string" && p.symbol.toUpperCase() === upper,
      )?.sector ?? null;

    return buildSnapshotFromBackend(upper, {
      quote: barsResult?.source === "ALPACA" ? quote : null,
      sector,
      bars,
      barsSource: barsResult?.source === "ALPACA" ? "alpaca" : "synthetic",
    });
  },

  async getRecentNews(symbol: string, limit?: number): Promise<NewsItem[]> {
    // The backend does not expose a news endpoint yet; keep the mock feed.
    return mockMarketDataProvider.getRecentNews(symbol, limit);
  },
};