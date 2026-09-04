/**
 * market-data.ts — fetches MarketSnapshot + news for the Research Desk agents
 *
 * Uses getBars() from the Quant datafeed (Alpaca or synthetic GBM fallback).
 * News is fetched from Alpaca News API when API keys are configured.
 */

import { getBars } from "@/lib/quant/datafeed";
import {
  rsi,
  sma,
  realizedVolSeries,
  lastValue,
} from "@/lib/quant/indicators";
import type { NewsItem } from "@/lib/contracts/research";

const SECTOR_MAP: Record<string, string> = {
  AAPL: "Technology", MSFT: "Technology", NVDA: "Technology", GOOGL: "Technology",
  GOOG: "Technology", META: "Technology", AMZN: "Consumer Discretionary",
  TSLA: "Consumer Discretionary", NFLX: "Communication Services",
  DIS: "Communication Services", JPM: "Financials", GS: "Financials",
  BAC: "Financials", V: "Financials", MA: "Financials", UNH: "Healthcare",
  JNJ: "Healthcare", LLY: "Healthcare", PFE: "Healthcare", XOM: "Energy",
  CVX: "Energy", COP: "Energy", SPY: "Index", QQQ: "Index", IWM: "Index",
  DIA: "Index", BTC: "Crypto", ETH: "Crypto", SOL: "Crypto",
};
function getSector(s: string): string { return SECTOR_MAP[s.toUpperCase()] ?? "Technology"; }
function r2(n: number): number { return Math.round(n * 100) / 100; }
function deriveRegime(rsi14: number, sma20: number | null, sma50: number | null, price: number, vol30: number | null): "risk_on" | "neutral" | "risk_off" {
  let score = 0;
  if (rsi14 > 55) score++; if (rsi14 < 45) score--;
  if (sma20 !== null && price > sma20) score++;
  if (sma50 !== null && price > sma50) score++;
  if (vol30 !== null && vol30 < 0.22) score++;
  if (vol30 !== null && vol30 > 0.40) score--;
  if (score >= 2) return "risk_on";
  if (score <= -1) return "risk_off";
  return "neutral";
}
export async function fetchMarketData(symbol: string) {
  const { bars } = await getBars(symbol, "1Day", 750);
  const closes = bars.map(b => b.c);
  const volumes = bars.map(b => b.v);
  const price = closes[closes.length - 1] ?? 0;
  const rsi14 = lastValue(rsi(closes, 14)) ?? 50;
  const sma20 = lastValue(sma(closes, 20));
  const sma50 = lastValue(sma(closes, 50));
  const vol30 = lastValue(realizedVolSeries(closes, 30));
  const pct = (idx: number) => closes.length > idx ? r2((price - closes[closes.length - 1 - idx]) / closes[closes.length - 1 - idx] * 100) : 0;
  const slice30 = volumes.slice(-30);
  const snapshot = {
    symbol: symbol.toUpperCase(), price: r2(price), change1dPct: pct(1), change5dPct: pct(5), change1mPct: pct(21),
    rsi14: r2(rsi14), sma20: r2(sma20 ?? price), sma50: r2(sma50 ?? price),
    realizedVol30dAnnPct: r2((vol30 ?? 0.22) * 100), sector: getSector(symbol),
    regime: deriveRegime(rsi14, sma20, sma50, price, vol30),
    latestVolume: volumes[volumes.length - 1],
    averageVolume30d: slice30.length > 0 ? slice30.reduce((a, b) => a + b, 0) / slice30.length : undefined,
  };
  const news = await fetchNews(symbol);
  return { snapshot, news };
}
export async function fetchNews(symbol: string): Promise<NewsItem[]> {
  const keyId = process.env.ALPACA_API_KEY_ID;
  const secretKey = process.env.ALPACA_API_SECRET_KEY;
  if (!keyId || !secretKey) return [{ id: `synthetic-${symbol}-1`, headline: `${symbol} under review`, summary: "Market monitoring active", source: "Synthetic", publishedAt: new Date().toISOString(), sentiment: null }];
  try {
    const params = new URLSearchParams({ symbols: symbol, limit: "10", sort: "desc" });
    const res = await fetch(`https://data.alpaca.markets/v1beta1/news?${params}`, { headers: { "APCA-API-KEY-ID": keyId, "APCA-API-SECRET-KEY": secretKey }, signal: AbortSignal.timeout(5000) });
    if (!res.ok) return [];
    const json = (await res.json()) as { news?: Array<{ id: unknown; headline: string; summary?: string; source: string; created_at: string }> };
    return (json.news ?? []).map((n) => ({ id: String(n.id), headline: n.headline, summary: n.summary || n.headline, source: n.source, publishedAt: n.created_at, sentiment: null }));
  } catch { return []; }
}
