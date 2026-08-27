import {
  AnalyzeOpportunityInputSchema,
  TradeProposalWireSchema,
  type AnalyzeOpportunityInput,
  type TradeProposal,
  type TradeProposalWire,
} from "@/lib/contracts/research";
import { bearAgent } from "./bear-agent";
import { bullAgent } from "./bull-agent";
import { investmentCommitteeAgent } from "./investment-committee-agent";
import { marketResearchAgent } from "./market-research-agent";
import { newsAgent } from "./news-agent";

export async function analyzeOpportunity(input: AnalyzeOpportunityInput): Promise<TradeProposal> {
  const parsed = AnalyzeOpportunityInputSchema.parse(input);
  const [marketAnalysis, newsAnalysis] = await Promise.all([
    marketResearchAgent.run({ symbol: parsed.symbol, snapshot: parsed.marketData }),
    newsAgent.run({ symbol: parsed.symbol, news: parsed.news }),
  ]);
  const thesisInput = {
    symbol: parsed.symbol,
    marketAnalysis,
    newsAnalysis,
    portfolioContext: parsed.portfolioContext,
  };
  const [bullOpinion, bearOpinion] = await Promise.all([
    bullAgent.run(thesisInput),
    bearAgent.run(thesisInput),
  ]);
  return investmentCommitteeAgent.run({ ...thesisInput, bullOpinion, bearOpinion });
}

export interface SerializeOptions {
  generatedAt?: string;
}

export function serializeTradeProposal(proposal: TradeProposal, options: SerializeOptions = {}): TradeProposalWire {
  return TradeProposalWireSchema.parse({
    symbol: proposal.symbol,
    action: proposal.action,
    strategy: proposal.strategy,
    instrument: proposal.instrument,
    thesis: proposal.thesis,
    confidence: Math.round(proposal.confidence) / 100,
    supporting_factors: proposal.supportingFactors,
    contradicting_factors: proposal.contradictingFactors,
    risks: proposal.risks,
    invalidation_conditions: proposal.invalidationConditions,
    portfolio_considerations: proposal.portfolioConsiderations,
    requires_risk_approval: true,
    generated_at: options.generatedAt ?? new Date().toISOString(),
  });
}

export function serializeTradeProposalToJson(proposal: TradeProposal, options: SerializeOptions = {}): string {
  return JSON.stringify(serializeTradeProposal(proposal, options), null, 2);
}

export function parseTradeProposalJson(text: string): TradeProposalWire {
  return TradeProposalWireSchema.parse(JSON.parse(text));
}
