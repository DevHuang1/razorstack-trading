import type { MarketSnapshot, NewsItem } from "@/lib/contracts/research";
import type { MarketDataProvider } from "./market-data";

// Deterministic offline fallback used by the research desk whenever the
// FastAPI backend and Alpaca are both unavailable. Kept in its own module so
// the backend-backed provider can reuse it without an import cycle.

function hashSeed(text: string): number {
  let hash = 2166136261;
  for (let i = 0; i < text.length; i++) {
    hash ^= text.charCodeAt(i);
    hash = Math.imul(hash, 16777619);
  }
  return Math.abs(hash);
}

function makeRandom(seed: number): () => number {
  let state = seed || 1;
  return () => {
    state = (state * 1664525 + 1013904223) % 4294967296;
    return state / 4294967296;
  };
}

const SECTORS = ["Technology", "Financials", "Healthcare", "Energy", "Consumer"];
const SOURCES = ["Alpaca News", "Reuters", "Bloomberg", "CNBC", "Benzinga"];

export const mockMarketDataProvider: MarketDataProvider = {
  async getMarketSnapshot(symbol: string): Promise<MarketSnapshot> {
    const rand = makeRandom(hashSeed(symbol));
    const price = 40 + rand() * 360;
    const change1mPct = (rand() - 0.35) * 30;
    return {
      symbol: symbol.toUpperCase(),
      price: Number(price.toFixed(2)),
      change1dPct: Number(((rand() - 0.45) * 5).toFixed(2)),
      change5dPct: Number((change1mPct / 4 + (rand() - 0.5) * 3).toFixed(2)),
      change1mPct: Number(change1mPct.toFixed(2)),
      rsi14: Number((35 + rand() * 40).toFixed(1)),
      sma20: Number((price * (0.97 + rand() * 0.06)).toFixed(2)),
      sma50: Number((price * (0.94 + rand() * 0.12)).toFixed(2)),
      realizedVol30dAnnPct: Number((18 + rand() * 45).toFixed(1)),
      sector: SECTORS[Math.floor(rand() * SECTORS.length)],
      regime: change1mPct > 5 ? "risk_on" : change1mPct < -5 ? "risk_off" : "neutral",
      dataSource: "mock",
    };
  },

  async getRecentNews(symbol: string, limit = 5): Promise<NewsItem[]> {
    const rand = makeRandom(hashSeed(`${symbol}:news`));
    const sym = symbol.toUpperCase();
    const headlines = [
      `${sym} beats quarterly earnings expectations on strong revenue growth`,
      `${sym} announces expanded AI infrastructure partnerships`,
      `Analysts raise ${sym} price targets ahead of product cycle`,
      `${sym} faces rising competition and margin pressure`,
      `Sector rotation puts pressure on ${sym} valuation multiples`,
      `${sym} management guides cautiously amid macro uncertainty`,
    ];
    return headlines.slice(0, limit).map((headline, i) => ({
      id: `${sym}-mock-${i}`,
      headline,
      summary: `Mock news item generated for demo purposes. ${sym} continues to draw market attention.`,
      source: SOURCES[Math.floor(rand() * SOURCES.length)],
      publishedAt: new Date(Date.now() - i * 36e5 * (3 + Math.floor(rand() * 8))).toISOString(),
      sentiment: Number(((rand() - 0.4) * 1.4).toFixed(2)),
    }));
  },
};