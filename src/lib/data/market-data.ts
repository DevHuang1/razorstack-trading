import type { MarketSnapshot, NewsItem } from "@/lib/contracts/research";
import { backendMarketDataProvider } from "./backend-market-data";

export interface MarketDataProvider {
  getMarketSnapshot(symbol: string): Promise<MarketSnapshot>;
  getRecentNews(symbol: string, limit?: number): Promise<NewsItem[]>;
}

export { mockMarketDataProvider } from "./mock-market-data";

// Backend-backed provider: live quotes, portfolio positions and news-shaped
// market data come from the FastAPI trading service, with the deterministic
// mock provider as the offline fallback (see backend-market-data.ts).
export const marketDataProvider: MarketDataProvider = backendMarketDataProvider;
