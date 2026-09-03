/**
 * datafeed.ts — market data provider for the Quant Engine
 *
 * Priority:
 *   1. Alpaca Markets REST v2  (live bars; requires ALPACA_API_KEY_ID + ALPACA_API_SECRET_KEY)
 *   2. Synthetic GBM fallback  (deterministic by symbol — always works offline)
 */

import type { Bar, DataSource } from "./types";

export interface BarsResult {
  bars: Bar[];
  source: DataSource;
}

// ─────────────────────────────────────────────
//  Alpaca data fetcher
// ─────────────────────────────────────────────

interface AlpacaBar {
  t: string;
  o: number;
  h: number;
  l: number;
  c: number;
  v: number;
}

async function fetchAlpacaBars(
  symbol: string,
  timeframe: string,
  limit: number,
): Promise<Bar[] | null> {
  const keyId = process.env.ALPACA_API_KEY_ID;
  const secretKey = process.env.ALPACA_API_SECRET_KEY;
  if (!keyId || !secretKey) return null;

  const params = new URLSearchParams({
    timeframe,
    limit: String(limit),
    sort: "asc",
    feed: "iex",
  });

  const url = `https://data.alpaca.markets/v2/stocks/${encodeURIComponent(symbol)}/bars?${params}`;

  try {
    const res = await fetch(url, {
      headers: {
        "APCA-API-KEY-ID": keyId,
        "APCA-API-SECRET-KEY": secretKey,
        Accept: "application/json",
      },
      next: { revalidate: 300 }, // cache 5 min
    });

    if (!res.ok) {
      console.warn(`[datafeed] Alpaca returned ${res.status} for ${symbol}`);
      return null;
    }

    const json = (await res.json()) as { bars?: AlpacaBar[] };
    const bars: Bar[] = (json.bars ?? []).map((b) => ({
      t: b.t,
      o: b.o,
      h: b.h,
      l: b.l,
      c: b.c,
      v: b.v,
    }));

    return bars.length >= 30 ? bars : null;
  } catch (err) {
    console.warn("[datafeed] Alpaca fetch error:", err);
    return null;
  }
}

// ─────────────────────────────────────────────
//  Synthetic GBM fallback
// ─────────────────────────────────────────────

/** Deterministic LCG seeded from symbol string */
function symbolSeed(symbol: string): number {
  let h = 2166136261;
  for (let i = 0; i < symbol.length; i++) {
    h ^= symbol.charCodeAt(i);
    h = (h * 16777619) >>> 0;
  }
  return h;
}

function makeLcg(seed: number) {
  let s = seed >>> 0;
  return () => {
    s = (Math.imul(1664525, s) + 1013904223) >>> 0;
    return s / 0xffffffff;
  };
}

function generateSyntheticBars(symbol: string, limit: number): Bar[] {
  const rand = makeLcg(symbolSeed(symbol));

  // Symbol-specific base params for variety
  const basePrice = 50 + (symbolSeed(symbol) % 450);
  const mu = 0.0003 + rand() * 0.0004; // daily drift
  const sigma = 0.012 + rand() * 0.018; // daily vol

  const bars: Bar[] = [];
  let price = basePrice;

  // Start `limit` trading days ago (skip weekends)
  const today = new Date();
  const dates: string[] = [];
  let d = new Date(today);
  d.setDate(d.getDate() - 1); // don't include today
  while (dates.length < limit) {
    const dow = d.getDay();
    if (dow !== 0 && dow !== 6) {
      dates.unshift(d.toISOString().slice(0, 10) + "T00:00:00Z");
    }
    d.setDate(d.getDate() - 1);
  }

  for (const t of dates) {
    const ret = mu + sigma * (rand() * 2 - 1);
    const open = price;
    const close = Math.max(0.01, price * (1 + ret));
    const hi = Math.max(open, close) * (1 + rand() * 0.005);
    const lo = Math.min(open, close) * (1 - rand() * 0.005);
    const vol = Math.round(500_000 + rand() * 4_500_000);

    bars.push({
      t,
      o: Math.round(open * 100) / 100,
      h: Math.round(hi * 100) / 100,
      l: Math.round(lo * 100) / 100,
      c: Math.round(close * 100) / 100,
      v: vol,
    });

    price = close;
  }

  return bars;
}

// ─────────────────────────────────────────────
//  Public API
// ─────────────────────────────────────────────

/**
 * Fetch OHLCV bars for a symbol.
 * Returns Alpaca live data when API keys are configured, synthetic otherwise.
 */
export async function getBars(
  symbol: string,
  timeframe: string = "1Day",
  limit: number = 750,
): Promise<BarsResult> {
  const alpacaBars = await fetchAlpacaBars(symbol, timeframe, limit);
  if (alpacaBars) {
    return { bars: alpacaBars, source: "ALPACA" };
  }

  return {
    bars: generateSyntheticBars(symbol, limit),
    source: "SYNTHETIC",
  };
}
