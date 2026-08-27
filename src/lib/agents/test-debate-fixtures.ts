import type {
  MarketAnalysis,
  NewsAnalysis,
  PortfolioContext,
  ThesisAgentInput,
} from "@/lib/contracts/research";

const obs = (statement: string) => ({ kind: "observation" as const, statement });
const interp = (statement: string) => ({ kind: "interpretation" as const, statement });

export const bullishMarket: MarketAnalysis = {
  symbol: "NVDA",
  trend: "up",
  momentum: "strongly_positive",
  volatilityRegime: "moderate",
  supportingObservations: [
    obs("Latest price $120 versus 20-day SMA $110 and 50-day SMA $100"),
  ],
  potentialConcerns: [],
  confidence: 72,
};

export const bullishNews: NewsAnalysis = {
  symbol: "NVDA",
  sentiment: 0.55,
  catalysts: [
    obs("NVDA beats quarterly earnings expectations on strong revenue growth (source: Reuters)"),
  ],
  negativeFactors: [],
  materialEvents: [
    obs("Material event reported: NVDA beats quarterly earnings expectations (source: Reuters)"),
  ],
  notes: [],
  timeHorizon: "short_term",
  confidence: 66,
  informationQuality: "high",
};

export const bearishMarket: MarketAnalysis = {
  symbol: "XYZ",
  trend: "down",
  momentum: "strongly_negative",
  volatilityRegime: "high",
  supportingObservations: [
    obs("Latest price $80 versus 20-day SMA $92 and 50-day SMA $97"),
  ],
  potentialConcerns: [interp("Downtrend with elevated volatility raises premium costs")],
  confidence: 68,
};

export const bearishNews: NewsAnalysis = {
  symbol: "XYZ",
  sentiment: -0.6,
  catalysts: [],
  negativeFactors: [
    obs("XYZ faces rising competition and margin pressure (source: Bloomberg)"),
  ],
  materialEvents: [],
  notes: [],
  timeHorizon: "medium_term",
  confidence: 61,
  informationQuality: "high",
};

export const contradictoryMarket: MarketAnalysis = {
  ...bullishMarket,
};

export const contradictoryNews: NewsAnalysis = {
  symbol: "NVDA",
  sentiment: 0.05,
  catalysts: bullishNews.catalysts,
  negativeFactors: [
    obs("NVDA faces rising competition and margin pressure (source: Bloomberg)"),
  ],
  materialEvents: bullishNews.materialEvents,
  notes: [
    interp("Conflicting signals in provided coverage: 1 bullish vs 1 bearish item(s); both sides retained"),
  ],
  timeHorizon: "short_term",
  confidence: 58,
  informationQuality: "high",
};

export const insufficientMarket: MarketAnalysis = {
  symbol: "ZZZ",
  trend: "insufficient_data",
  momentum: "insufficient_data",
  volatilityRegime: "insufficient_data",
  supportingObservations: [obs("insufficient_data: price series unavailable")],
  potentialConcerns: [],
  confidence: 20,
};

export const insufficientNews: NewsAnalysis = {
  symbol: "ZZZ",
  sentiment: 0,
  catalysts: [],
  negativeFactors: [],
  materialEvents: [],
  notes: [],
  timeHorizon: "insufficient_data",
  confidence: 25,
  informationQuality: "insufficient",
};

export const bullishInput: ThesisAgentInput = {
  symbol: "NVDA",
  marketAnalysis: bullishMarket,
  newsAnalysis: bullishNews,
};

export const bearishInput: ThesisAgentInput = {
  symbol: "XYZ",
  marketAnalysis: bearishMarket,
  newsAnalysis: bearishNews,
};

export const contradictoryInput: ThesisAgentInput = {
  symbol: "NVDA",
  marketAnalysis: contradictoryMarket,
  newsAnalysis: contradictoryNews,
};

export const insufficientInput: ThesisAgentInput = {
  symbol: "ZZZ",
  marketAnalysis: insufficientMarket,
  newsAnalysis: insufficientNews,
};

export const exposedPortfolioContext: PortfolioContext = {
  totalEquity: 1_000_000,
  cash: 150_000,
  positions: [{ symbol: "NVDA", qty: 500, marketValueUsd: 60_000, sector: "Semiconductors" }],
  sectorExposure: [{ sector: "Semiconductors", exposurePctOfBook: 40 }],
  largestPositions: ["NVDA"],
  recentTrades: [{ symbol: "NVDA", side: "BUY", qty: 100, executedAt: "2026-08-20" }],
  portfolioObjective: "growth",
  riskTolerance: "moderate",
};

export const exposedPortfolioInput: ThesisAgentInput = {
  ...bullishInput,
  portfolioContext: exposedPortfolioContext,
};
