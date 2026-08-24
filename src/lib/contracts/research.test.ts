import { describe, expect, it } from "vitest";
import {
  AgentOpinionSchema,
  DebateResultSchema,
  MarketAnalysisSchema,
  MarketSnapshotSchema,
  NewsAnalysisSchema,  OptionInstrumentSchema,
  PortfolioContextSchema,
  TradeProposalSchema,
} from "./research";

const validInstrument = {
  type: "call",
  strike: 340,
  expiry: "2026-09-21",
  midPrice: 4.5,
  bid: 4.2,
  ask: 4.8,
  delta: 0.42,
  theta: -0.14,
  gamma: 0.02,
  impliedVolPct: 24.1,
};

describe("OptionInstrumentSchema", () => {
  it("accepts a valid option instrument", () => {
    expect(OptionInstrumentSchema.parse(validInstrument)).toBeTruthy();
  });

  it("rejects malformed expiry dates", () => {
    expect(() => OptionInstrumentSchema.parse({ ...validInstrument, expiry: "09/2026" })).toThrow();
  });

  it("rejects negative gamma", () => {
    expect(() => OptionInstrumentSchema.parse({ ...validInstrument, gamma: -0.01 })).toThrow();
  });
});

describe("MarketSnapshotSchema", () => {
  it("rejects an unknown market regime", () => {
    expect(() =>
      MarketSnapshotSchema.parse({
        symbol: "AAPL",
        price: 100,
        change1dPct: 0,
        change5dPct: 0,
        change1mPct: 0,
        rsi14: 50,
        sma20: 99,
        sma50: 98,
        realizedVol30dAnnPct: 20,
        sector: "Technology",
        regime: "euphoria",
      }),
    ).toThrow();
  });
});

const marketAnalysis = {
  symbol: "NVDA",
  trend: "up",
  momentum: "positive",
  volatilityRegime: "moderate",
  supportingObservations: [
    { kind: "observation", statement: "Latest price $120.00 versus 20-day SMA $110.00" },
    { kind: "interpretation", statement: "Trend structure supports continued upside" },
  ],
  potentialConcerns: [{ kind: "interpretation", statement: "insufficient_data: volume not provided" }],
  confidence: 78,
};

const newsAnalysis = {
  symbol: "NVDA",
  sentiment: 0.4,
  catalysts: [{ kind: "observation", statement: "Earnings beat (source: Reuters)" }],
  negativeFactors: [{ kind: "observation", statement: "Margin pressure (source: Bloomberg)" }],
  materialEvents: [],
  notes: [],
  timeHorizon: "short_term",
  confidence: 70,
  informationQuality: "high",
};

const agentOpinion = {
  symbol: "NVDA",
  stance: "bullish",
  confidence: 74,
  arguments: [{ kind: "interpretation", statement: "Trend confirmation supports upside" }],
  evidence: [{ kind: "observation", statement: "Market labels trend up, momentum strongly_positive" }],
  risks: [{ kind: "interpretation", statement: "Volatility premium is rich" }],
  keyAssumptions: ["Momentum persists over the horizon"],
  invalidationConditions: ["Trend label flips away from up"],
};

describe("MarketAnalysisSchema", () => {
  it("accepts a valid analysis", () => {
    expect(MarketAnalysisSchema.parse(marketAnalysis)).toBeTruthy();
  });

  it("rejects an unknown trend", () => {
    expect(() => MarketAnalysisSchema.parse({ ...marketAnalysis, trend: "moon" })).toThrow();
  });

  it("rejects empty supporting observations", () => {
    expect(() =>
      MarketAnalysisSchema.parse({ ...marketAnalysis, supportingObservations: [] }),
    ).toThrow();
  });

  it("rejects unclassified statements", () => {
    expect(() =>
      MarketAnalysisSchema.parse({
        ...marketAnalysis,
        supportingObservations: [{ statement: "no kind field" }],
      }),
    ).toThrow();
  });

  it("accepts insufficient_data sentinels", () => {
    expect(
      MarketAnalysisSchema.parse({
        ...marketAnalysis,
        trend: "insufficient_data",
        momentum: "insufficient_data",
        volatilityRegime: "insufficient_data",
      }),
    ).toBeTruthy();
  });
});

describe("NewsAnalysisSchema", () => {
  it("accepts a valid analysis", () => {
    expect(NewsAnalysisSchema.parse(newsAnalysis)).toBeTruthy();
  });

  it("rejects sentiment outside -1..1", () => {
    expect(() => NewsAnalysisSchema.parse({ ...newsAnalysis, sentiment: 1.5 })).toThrow();
  });

  it("rejects an unknown time horizon", () => {
    expect(() =>
      NewsAnalysisSchema.parse({ ...newsAnalysis, timeHorizon: "eventually" }),
    ).toThrow();
  });

  it("rejects an unknown information quality", () => {
    expect(() =>
      NewsAnalysisSchema.parse({ ...newsAnalysis, informationQuality: "vibes" }),
    ).toThrow();
  });
});

describe("AgentOpinionSchema", () => {
  it("accepts a valid opinion", () => {
    expect(AgentOpinionSchema.parse(agentOpinion)).toBeTruthy();
  });

  it("rejects an unknown stance", () => {
    expect(() => AgentOpinionSchema.parse({ ...agentOpinion, stance: "sideways" })).toThrow();
  });

  it("rejects opinions without arguments", () => {
    expect(() => AgentOpinionSchema.parse({ ...agentOpinion, arguments: [] })).toThrow();
  });

  it("requires grounded evidence", () => {
    expect(() => AgentOpinionSchema.parse({ ...agentOpinion, evidence: [] })).toThrow();
  });

  it("requires explicit key assumptions", () => {
    expect(() => AgentOpinionSchema.parse({ ...agentOpinion, keyAssumptions: [] })).toThrow();
  });

  it("requires at least one invalidation condition", () => {
    expect(() =>
      AgentOpinionSchema.parse({ ...agentOpinion, invalidationConditions: [] }),
    ).toThrow();
  });
});

describe("PortfolioContextSchema", () => {
  const validPortfolio = {
    totalEquity: 1_000_000,
    cash: 150_000,
    positions: [{ symbol: "NVDA", qty: 500, marketValueUsd: 60_000, sector: "Semiconductors" }],
    sectorExposure: [{ sector: "Semiconductors", exposurePctOfBook: 40 }],
    largestPositions: ["NVDA"],
    recentTrades: [{ symbol: "NVDA", side: "BUY", qty: 100, executedAt: "2026-08-20" }],
    portfolioObjective: "growth",
    riskTolerance: "moderate",
  };

  it("accepts a fully populated portfolio context", () => {
    expect(PortfolioContextSchema.parse(validPortfolio)).toBeTruthy();
  });

  it("rejects an unknown portfolio objective", () => {
    expect(() =>
      PortfolioContextSchema.parse({ ...validPortfolio, portfolioObjective: "yolo" }),
    ).toThrow();
  });

  it("rejects negative cash", () => {
    expect(() => PortfolioContextSchema.parse({ ...validPortfolio, cash: -1 })).toThrow();
  });

  it("rejects sector exposure above 100%", () => {
    expect(() =>
      PortfolioContextSchema.parse({
        ...validPortfolio,
        sectorExposure: [{ sector: "Tech", exposurePctOfBook: 140 }],
      }),
    ).toThrow();
  });

  it("rejects malformed recent-trade dates", () => {
    expect(() =>
      PortfolioContextSchema.parse({
        ...validPortfolio,
        recentTrades: [{ symbol: "NVDA", side: "BUY", qty: 10, executedAt: "08/20/2026" }],
      }),
    ).toThrow();
  });
});

describe("DebateResultSchema", () => {
  const validDebate = {
    symbol: "NVDA",
    bullCase: [{ kind: "interpretation", statement: "Trend confirmation supports upside" }],
    bearCase: [{ kind: "interpretation", statement: "Margin pressure caps upside" }],
    pointsOfAgreement: [{ kind: "observation", statement: "Both accept the up-trend label" }],
    pointsOfDisagreement: [{ kind: "interpretation", statement: "They weight news flow differently" }],
    strongestEvidence: [{ kind: "observation", statement: "Earnings beat (source: Reuters)" }],
    weakestEvidence: [{ kind: "interpretation", statement: "Momentum persistence is assumed" }],
    unresolvedQuestions: ["Do catalysts outweigh headwinds before expiry?"],
    finalThesis: "Bullish reading prevails.",
    confidence: 67,
  };

  it("accepts a valid debate record", () => {
    expect(DebateResultSchema.parse(validDebate)).toBeTruthy();
  });

  it("requires at least one bull claim", () => {
    expect(() => DebateResultSchema.parse({ ...validDebate, bullCase: [] })).toThrow();
  });

  it("requires at least one bear claim", () => {
    expect(() => DebateResultSchema.parse({ ...validDebate, bearCase: [] })).toThrow();
  });

  it("requires at least one piece of strongest evidence", () => {
    expect(() => DebateResultSchema.parse({ ...validDebate, strongestEvidence: [] })).toThrow();
  });

  it("requires at least one unresolved question", () => {
    expect(() => DebateResultSchema.parse({ ...validDebate, unresolvedQuestions: [] })).toThrow();
  });

  it("requires a final thesis", () => {
    expect(() => DebateResultSchema.parse({ ...validDebate, finalThesis: "" })).toThrow();
  });
});

describe("TradeProposalSchema", () => {
  const validDebate = {
    symbol: "NVDA",
    bullCase: [{ kind: "interpretation", statement: "Trend confirmation supports upside" }],
    bearCase: [{ kind: "interpretation", statement: "Margin pressure caps upside" }],
    pointsOfAgreement: [],
    pointsOfDisagreement: [{ kind: "interpretation", statement: "They weight news flow differently" }],
    strongestEvidence: [{ kind: "observation", statement: "Earnings beat (source: Reuters)" }],
    weakestEvidence: [],
    unresolvedQuestions: ["Do catalysts outweigh headwinds before expiry?"],
    finalThesis: "Bullish reading prevails.",
    confidence: 67,
  };
  const proposal = {
    symbol: "NVDA",
    action: "BUY",
    strategy: "bull_call_spread",
    instrument: validInstrument,
    thesis: "Committee synthesis: bullish reading prevails on aligned evidence.",
    confidence: 67,
    supportingFactors: [{ kind: "interpretation", statement: "Trend and momentum labels align" }],
    contradictingFactors: [{ kind: "observation", statement: "Bear cites margin pressure (source: Bloomberg)" }],
    risks: [{ kind: "interpretation", statement: "Premium costs elevated" }],
    invalidationConditions: ["Trend label flips away from up"],
    suggestedHoldingPeriod: "Days to ~2 weeks",
    evidenceQuality: "high",
    requiresRiskApproval: true,
    debate: validDebate,
  };

  it("accepts a valid research-only proposal", () => {
    expect(TradeProposalSchema.parse(proposal)).toBeTruthy();
  });

  it("cannot ship without referencing a debate result", () => {
    expect(() =>
      TradeProposalSchema.parse({ ...proposal, debate: undefined }),
    ).toThrow();
  });

  it("defaults portfolio considerations to an empty list", () => {
    const parsed = TradeProposalSchema.parse(proposal);
    expect(parsed.portfolioConsiderations).toEqual([]);
  });

  it("allows NO_TRADE proposals without an instrument", () => {
    expect(
      TradeProposalSchema.parse({
        ...proposal,
        action: "NO_TRADE",
        strategy: "no_trade",
        instrument: null,
      }),
    ).toBeTruthy();
  });

  it("can never ship without requiring risk approval", () => {
    expect(() =>
      TradeProposalSchema.parse({ ...proposal, requiresRiskApproval: false }),
    ).toThrow();
  });

  it("rejects free-form actions", () => {
    expect(() => TradeProposalSchema.parse({ ...proposal, action: "YOLO" })).toThrow();
  });
});
