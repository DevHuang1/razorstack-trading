import { describe, expect, it } from "vitest";
import type { NewsAnalysis, MarketAnalysis, AgentOpinion, TradeProposal } from "@/lib/contracts/research";
import {
  committeeMessage,
  marketMessage,
  newsMessage,
  opinionMessage,
  toAIThesis,
} from "./research-events";

const news: NewsAnalysis = {
  symbol: "NVDA",
  sentiment: 0.7,
  catalysts: [{ kind: "observation", statement: "Data-center guidance raised" }],
  negativeFactors: [{ kind: "interpretation", statement: "Valuation stretched" }],
  materialEvents: [],
  notes: [{ kind: "observation", statement: "Earnings beat" }],
  timeHorizon: "medium_term",
  confidence: 80,
  informationQuality: "high",
};

const market: MarketAnalysis = {
  symbol: "NVDA",
  sector: "Technology",
  trend: "up",
  momentum: "positive",
  volatilityRegime: "moderate",
  supportingObservations: [{ kind: "observation", statement: "Price above SMA50" }],
  potentialConcerns: [],
  confidence: 75,
};

const opinion: AgentOpinion = {
  symbol: "NVDA",
  stance: "bullish",
  confidence: 85,
  arguments: [{ kind: "interpretation", statement: "Growth reacceleration" }],
  evidence: [{ kind: "observation", statement: "+18% 1-month move" }],
  risks: [{ kind: "interpretation", statement: "Rate sensitivity" }],
  keyAssumptions: ["demand holds"],
  invalidationConditions: ["margin compresses"],
};

const proposal: TradeProposal = {
  symbol: "NVDA",
  action: "BUY",
  strategy: "long_call",
  instrument: null,
  thesis: "Momentum + news reinforce upside",
  confidence: 82,
  supportingFactors: [{ kind: "observation", statement: "Strong trend" }],
  contradictingFactors: [],
  risks: [{ kind: "interpretation", statement: "Volatility" }],
  invalidationConditions: ["breakdown"],
  suggestedHoldingPeriod: "1 quarter",
  evidenceQuality: "high",
  requiresRiskApproval: true,
  debate: {
    symbol: "NVDA",
    bullCase: [],
    bearCase: [],
    pointsOfAgreement: [],
    pointsOfDisagreement: [],
    strongestEvidence: [],
    weakestEvidence: [],
    unresolvedQuestions: [],
    finalThesis: "t",
    confidence: 60,
  },
  portfolioConsiderations: [],
};

describe("research dashboard event mappers", () => {
  it("builds an AgentMessage per role with the dashboard shape", () => {
    const newsMsg = newsMessage(news);
    expect(newsMsg).toEqual({
      role: "news", stance: "bullish", headline: "Data-center guidance raised", body: "Earnings beat · Valuation stretched", confidence: 80,
    });

    expect(marketMessage(market)).toMatchObject({
      role: "market_research", stance: "bullish", confidence: 75,
    });

    expect(opinionMessage("bull", opinion)).toMatchObject({
      role: "bull", stance: "bullish", headline: "Growth reacceleration", confidence: 85,
    });
    expect(opinionMessage("bear", opinion)).toMatchObject({ role: "bear", stance: "bearish" });

    expect(committeeMessage(proposal)).toMatchObject({
      role: "investment_committee", stance: "bullish", headline: proposal.thesis, confidence: 82,
    });
  });

  it("builds the CIO thesis the dashboard renders", () => {
    const thesis = toAIThesis(proposal);
    expect(thesis.direction).toBe("BUY");
    expect(thesis.confidence).toBe(82);
    expect(thesis.summary).toBe(proposal.thesis);
    expect(thesis.catalysts).toEqual(["Strong trend"]);
    expect(thesis.risks).toEqual(["Volatility"]);
    expect(thesis.recommendation).toContain("NVDA BUY");
  });
});
