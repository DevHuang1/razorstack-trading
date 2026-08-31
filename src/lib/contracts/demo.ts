import { z } from "zod";
import {
  AgentOpinionSchema,
  DebateResultSchema,
  MarketAnalysisSchema,
  NewsAnalysisSchema,
  TradeProposalSchema,
} from "./research";
import {
  CrisisMarketRegimeSchema,
  CrisisNewsAssessmentSchema,
  CrisisOptionsPlaybookSchema,
  CrisisResponseSchema,
  CrisisRiskAnalysisSchema,
} from "./crisis";

export const InvestmentAnalysisResultSchema = z.object({
  marketAnalysis: MarketAnalysisSchema,
  newsAnalysis: NewsAnalysisSchema,
  bullOpinion: AgentOpinionSchema,
  bearOpinion: AgentOpinionSchema,
  debate: DebateResultSchema,
  tradeProposal: TradeProposalSchema,
});
export type InvestmentAnalysisResult = z.infer<typeof InvestmentAnalysisResultSchema>;

export const CrisisAnalysisResultSchema = z.object({
  crisisAnalysis: CrisisMarketRegimeSchema,
  agentOpinions: z.object({
    newsAssessment: CrisisNewsAssessmentSchema,
    marketRegime: CrisisMarketRegimeSchema,
    riskAnalysis: CrisisRiskAnalysisSchema,
    optionsPlaybook: CrisisOptionsPlaybookSchema,
  }),
  crisisResponse: CrisisResponseSchema,
});
export type CrisisAnalysisResult = z.infer<typeof CrisisAnalysisResultSchema>;

export const DemoStepEventSchema = z.object({
  agent: z.string(),
  status: z.enum(["started", "completed"]),
});
export type DemoStepEvent = z.infer<typeof DemoStepEventSchema>;
