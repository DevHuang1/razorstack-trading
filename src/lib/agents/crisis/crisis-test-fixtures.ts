import type { CrisisContext } from "@/lib/contracts/crisis";

function newsItem(id: string, headline: string, source: string, sentiment: number): CrisisContext["newsEvents"][number] {
  return {
    id,
    headline,
    summary: `${headline} - summary`,
    source,
    publishedAt: "2026-08-24T14:00:00Z",
    sentiment,
  };
}

const softwarePosition = { symbol: "MSFT", qty: 800, marketValueUsd: 320_000, sector: "Software" };
const semiconductorPosition = { symbol: "NVDA", qty: 300, marketValueUsd: 150_000, sector: "Semiconductors" };

export const normalCrisisContext: CrisisContext = {
  marketMove: { benchmark: "S&P 500", changePct: 0.4 },
  volatilityChange: { indexLabel: "VIX", currentLevel: 15, priorLevel: 14 },
  portfolioDrawdownPct: -0.5,
  affectedSectors: [],
  newsEvents: [
    newsItem("n1", "Markets drift as earnings season winds down", "Reuters", 0.1),
    newsItem("n2", "Fed officials signal steady policy stance", "Bloomberg", -0.05),
  ],
  currentPositions: [softwarePosition],
};

export const moderateCrisisContext: CrisisContext = {
  marketMove: { benchmark: "S&P 500", changePct: -4.5, windowLabel: "intraday" },
  volatilityChange: { indexLabel: "VIX", currentLevel: 22, priorLevel: 16 },
  portfolioDrawdownPct: -3.8,
  affectedSectors: ["Software"],
  newsEvents: [
    newsItem("m1", "Tech selloff accelerates on rate fears", "Reuters", -0.7),
    newsItem("m2", "Software guidance cuts ripple across sector", "Bloomberg", -0.6),
  ],
  currentPositions: [softwarePosition],
};

export const severeCrisisContext: CrisisContext = {
  marketMove: { benchmark: "NASDAQ", changePct: -9, windowLabel: "over two sessions" },
  volatilityChange: { indexLabel: "VIX", currentLevel: 34, priorLevel: 18 },
  portfolioDrawdownPct: -8.6,
  affectedSectors: ["Software", "Semiconductors"],
  newsEvents: [
    newsItem("s1", "Global risk-off wave grips markets amid credit event fears", "Reuters", -0.9),
  ],
  currentPositions: [softwarePosition, semiconductorPosition],
};

export const insufficientCrisisContext: CrisisContext = {
  marketMove: { benchmark: "S&P 500", changePct: -2.8 },
  volatilityChange: { indexLabel: "VIX", currentLevel: 20 },
  portfolioDrawdownPct: -1.2,
  affectedSectors: [],
  newsEvents: [],
  currentPositions: [],
};
