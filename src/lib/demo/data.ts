import type { AnalyzeOpportunityInput } from "@/lib/contracts/research";

export const researchDemoInput: AnalyzeOpportunityInput = {
  symbol: "NVDA",
  marketData: {
    symbol: "NVDA",
    price: 120.5,
    change1dPct: 1.8,
    change5dPct: 4.2,
    change1mPct: 9.6,
    rsi14: 62,
    sma20: 110.25,
    sma50: 100.4,
    realizedVol30dAnnPct: 18.06,
    sector: "Semiconductors",
    regime: "risk_on",
    latestVolume: 41_200_000,
    averageVolume30d: 38_500_000,
  },
  news: [
    {
      id: "news-001",
      headline: "NVDA beats quarterly earnings and raises data-center guidance",
      summary: "Quarterly revenue topped consensus; management raised next-quarter guidance citing sustained AI accelerator demand.",
      source: "Reuters",
      publishedAt: "2026-08-20T14:30:00Z",
      sentiment: 0.7,
    },
    {
      id: "news-002",
      headline: "Analyst flags potential margin pressure from rising input costs",
      summary: "A sell-side note argues component cost inflation could compress gross margins over the next two quarters.",
      source: "Bloomberg",
      publishedAt: "2026-08-21T09:15:00Z",
      sentiment: -0.3,
    },
  ],
  portfolioContext: {
    totalEquity: 1_000_000,
    cash: 150_000,
    positions: [{ symbol: "MSFT", qty: 800, marketValueUsd: 320_000, sector: "Software" }],
    sectorExposure: [{ sector: "Software", exposurePctOfBook: 32 }],
    largestPositions: ["MSFT"],
    recentTrades: [{ symbol: "MSFT", side: "BUY", qty: 100, executedAt: "2026-08-15" }],
    portfolioObjective: "growth",
    riskTolerance: "moderate",
  },
};

export {
  normalCrisisContext,
  moderateCrisisContext,
  severeCrisisContext,
  insufficientCrisisContext,
} from "@/lib/agents/crisis/crisis-test-fixtures";
