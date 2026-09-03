import { z } from "zod";

export const AGENT_ROLES = [
  "news",
  "bull",
  "bear",
  "market_research",
  "investment_committee",
  "crisis_news",
  "crisis_market",
  "crisis_risk_analyst",
  "crisis_options",
  "crisis_committee",
] as const;
export const AgentRoleSchema = z.enum(AGENT_ROLES);
export type AgentRole = (typeof AGENT_ROLES)[number];

export const StanceSchema = z.enum(["bullish", "bearish", "neutral"]);
export type Stance = z.infer<typeof StanceSchema>;

export const MarketSnapshotSchema = z.object({
  symbol: z.string(),
  price: z.number(),
  change1dPct: z.number(),
  change5dPct: z.number(),
  change1mPct: z.number(),
  rsi14: z.number().min(0).max(100),
  sma20: z.number(),
  sma50: z.number(),
  realizedVol30dAnnPct: z.number(),
  sector: z.string(),
  regime: z.enum(["risk_on", "neutral", "risk_off"]),
  latestVolume: z.number().nonnegative().optional(),
  averageVolume30d: z.number().positive().optional(),
  // Where the snapshot's price/indicator inputs came from. Exposed so the
  // research desk can surface when it is running on offline/synthetic data.
  dataSource: z.enum(["backend", "alpaca", "synthetic", "mock"]).optional(),
});
export type MarketSnapshot = z.infer<typeof MarketSnapshotSchema>;

export const NewsItemSchema = z.object({
  id: z.string(),
  headline: z.string(),
  summary: z.string(),
  source: z.string(),
  publishedAt: z.string(),
  sentiment: z.number().min(-1).max(1).nullable(),
});
export type NewsItem = z.infer<typeof NewsItemSchema>;

export const OptionsStructureSchema = z.enum([
  "long_call",
  "long_put",
  "bull_call_spread",
  "bear_put_spread",
  "protective_put",
  "cash_secured_put",
  "iron_condor",
  "no_trade",
]);
export type OptionsStructure = z.infer<typeof OptionsStructureSchema>;

export const OptionInstrumentSchema = z.object({
  type: z.enum(["call", "put"]),
  strike: z.number().positive(),
  expiry: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  midPrice: z.number().positive(),
  bid: z.number().min(0),
  ask: z.number().min(0),
  delta: z.number().min(-1).max(1),
  theta: z.number(),
  gamma: z.number().nonnegative(),
  impliedVolPct: z.number().min(0),
});
export type OptionInstrument = z.infer<typeof OptionInstrumentSchema>;

export const TrendSchema = z.enum(["up", "down", "sideways", "insufficient_data"]);
export type Trend = z.infer<typeof TrendSchema>;

export const MomentumSchema = z.enum([
  "strongly_positive",
  "positive",
  "neutral",
  "negative",
  "strongly_negative",
  "insufficient_data",
]);
export type Momentum = z.infer<typeof MomentumSchema>;

export const VolatilityLevelSchema = z.enum(["low", "moderate", "high", "insufficient_data"]);
export type VolatilityLevel = z.infer<typeof VolatilityLevelSchema>;

export const AnalysisStatementSchema = z.object({
  kind: z.enum(["observation", "interpretation"]),
  statement: z.string().min(1),
});
export type AnalysisStatement = z.infer<typeof AnalysisStatementSchema>;

export const MarketAnalysisSchema = z.object({
  symbol: z.string(),
  sector: z.string().optional(),
  trend: TrendSchema,
  momentum: MomentumSchema,
  volatilityRegime: VolatilityLevelSchema,
  supportingObservations: z.array(AnalysisStatementSchema).min(1),
  potentialConcerns: z.array(AnalysisStatementSchema),
  confidence: z.number().min(0).max(100),
});
export type MarketAnalysis = z.infer<typeof MarketAnalysisSchema>;

export const TimeHorizonSchema = z.enum([
  "short_term",
  "medium_term",
  "long_term",
  "mixed",
  "insufficient_data",
]);
export type TimeHorizon = z.infer<typeof TimeHorizonSchema>;

export const InformationQualitySchema = z.enum(["high", "medium", "low", "insufficient"]);
export type InformationQuality = z.infer<typeof InformationQualitySchema>;

export const NewsAnalysisSchema = z.object({
  symbol: z.string(),
  sentiment: z.number().min(-1).max(1),
  catalysts: z.array(AnalysisStatementSchema),
  negativeFactors: z.array(AnalysisStatementSchema),
  materialEvents: z.array(AnalysisStatementSchema),
  notes: z.array(AnalysisStatementSchema).default([]),
  timeHorizon: TimeHorizonSchema,
  confidence: z.number().min(0).max(100),
  informationQuality: InformationQualitySchema,
});
export type NewsAnalysis = z.infer<typeof NewsAnalysisSchema>;

export const AgentOpinionSchema = z.object({
  symbol: z.string(),
  stance: StanceSchema,
  confidence: z.number().min(0).max(100),
  arguments: z.array(AnalysisStatementSchema).min(1),
  evidence: z.array(AnalysisStatementSchema).min(1),
  risks: z.array(AnalysisStatementSchema),
  keyAssumptions: z.array(z.string()).min(1),
  invalidationConditions: z.array(z.string()).min(1),
});
export type AgentOpinion = z.infer<typeof AgentOpinionSchema>;

export const MarketResearchInputSchema = z.object({
  symbol: z.string(),
  snapshot: MarketSnapshotSchema,
});
export type MarketResearchInput = z.infer<typeof MarketResearchInputSchema>;

export const NewsAgentInputSchema = z.object({
  symbol: z.string(),
  news: z.array(NewsItemSchema),
});
export type NewsAgentInput = z.infer<typeof NewsAgentInputSchema>;

export const PortfolioPositionSchema = z.object({
  symbol: z.string(),
  qty: z.number(),
  marketValueUsd: z.number(),
  sector: z.string(),
});
export type PortfolioPosition = z.infer<typeof PortfolioPositionSchema>;

export const SectorExposureSchema = z.object({
  sector: z.string(),
  exposurePctOfBook: z.number().min(0).max(100),
});
export type SectorExposure = z.infer<typeof SectorExposureSchema>;

export const RecentTradeSchema = z.object({
  symbol: z.string(),
  side: z.enum(["BUY", "SELL"]),
  qty: z.number(),
  executedAt: z.string().regex(/^\d{4}-\d{2}-\d{2}/),
});
export type RecentTrade = z.infer<typeof RecentTradeSchema>;

export const PortfolioObjectiveSchema = z.enum(["income", "growth", "preservation", "balanced"]);
export type PortfolioObjective = z.infer<typeof PortfolioObjectiveSchema>;

export const RiskToleranceSchema = z.enum(["conservative", "moderate", "aggressive"]);
export type RiskTolerance = z.infer<typeof RiskToleranceSchema>;

export const PortfolioContextSchema = z.object({
  totalEquity: z.number().nonnegative(),
  cash: z.number().nonnegative(),
  positions: z.array(PortfolioPositionSchema),
  sectorExposure: z.array(SectorExposureSchema),
  largestPositions: z.array(z.string()),
  recentTrades: z.array(RecentTradeSchema),
  portfolioObjective: PortfolioObjectiveSchema,
  riskTolerance: RiskToleranceSchema,
});
export type PortfolioContext = z.infer<typeof PortfolioContextSchema>;

export const ThesisAgentInputSchema = z.object({
  symbol: z.string(),
  marketAnalysis: MarketAnalysisSchema,
  newsAnalysis: NewsAnalysisSchema,
  portfolioContext: PortfolioContextSchema.optional(),
});
export type ThesisAgentInput = z.infer<typeof ThesisAgentInputSchema>;

export const CommitteeInputSchema = z.object({
  symbol: z.string(),
  marketAnalysis: MarketAnalysisSchema,
  newsAnalysis: NewsAnalysisSchema,
  bullOpinion: AgentOpinionSchema,
  bearOpinion: AgentOpinionSchema,
  portfolioContext: PortfolioContextSchema.optional(),
});
export type CommitteeInput = z.infer<typeof CommitteeInputSchema>;

export const DebateResultSchema = z.object({
  symbol: z.string(),
  bullCase: z.array(AnalysisStatementSchema).min(1),
  bearCase: z.array(AnalysisStatementSchema).min(1),
  pointsOfAgreement: z.array(AnalysisStatementSchema),
  pointsOfDisagreement: z.array(AnalysisStatementSchema),
  strongestEvidence: z.array(AnalysisStatementSchema).min(1),
  weakestEvidence: z.array(AnalysisStatementSchema),
  unresolvedQuestions: z.array(z.string()).min(1),
  finalThesis: z.string().min(1),
  confidence: z.number().min(0).max(100),
});
export type DebateResult = z.infer<typeof DebateResultSchema>;

export const TradeActionSchema = z.enum(["BUY", "SELL", "HOLD", "NO_TRADE"]);
export type TradeAction = z.infer<typeof TradeActionSchema>;

export const TradeProposalSchema = z.object({
  symbol: z.string(),
  action: TradeActionSchema,
  strategy: OptionsStructureSchema,
  instrument: OptionInstrumentSchema.nullable(),
  thesis: z.string().min(1),
  confidence: z.number().min(0).max(100),
  supportingFactors: z.array(AnalysisStatementSchema),
  contradictingFactors: z.array(AnalysisStatementSchema),
  risks: z.array(AnalysisStatementSchema),
  invalidationConditions: z.array(z.string()).min(1),
  suggestedHoldingPeriod: z.string(),
  evidenceQuality: InformationQualitySchema,
  requiresRiskApproval: z.literal(true),
  debate: DebateResultSchema,
  portfolioConsiderations: z.array(AnalysisStatementSchema).default([]),
});
export type TradeProposal = z.infer<typeof TradeProposalSchema>;

export const AnalyzeOpportunityInputSchema = z.object({
  symbol: z.string(),
  marketData: MarketSnapshotSchema,
  news: z.array(NewsItemSchema),
  portfolioContext: PortfolioContextSchema.optional(),
});
export type AnalyzeOpportunityInput = z.infer<typeof AnalyzeOpportunityInputSchema>;

const WireStatementSchema = z.object({
  kind: z.enum(["observation", "interpretation"]),
  statement: z.string(),
});

export const TradeProposalWireSchema = z.object({
  symbol: z.string(),
  action: TradeActionSchema,
  strategy: OptionsStructureSchema,
  instrument: OptionInstrumentSchema.nullable(),
  thesis: z.string().min(1),
  confidence: z.number().min(0).max(1),
  supporting_factors: z.array(WireStatementSchema),
  contradicting_factors: z.array(WireStatementSchema),
  risks: z.array(WireStatementSchema),
  invalidation_conditions: z.array(z.string()).min(1),
  portfolio_considerations: z.array(WireStatementSchema),
  requires_risk_approval: z.literal(true),
  generated_at: z.string().regex(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}/),
});
export type TradeProposalWire = z.infer<typeof TradeProposalWireSchema>;

export const AgentMessageSchema = z.object({
  role: AgentRoleSchema,
  stance: StanceSchema,
  headline: z.string(),
  body: z.string(),
  confidence: z.number().min(0).max(100).nullable(),
});
export type AgentMessage = z.infer<typeof AgentMessageSchema>;

export const AIThesisSchema = z.object({
  symbol: z.string(),
  direction: z.string(),
  confidence: z.number().min(0).max(100),
  summary: z.string(),
  catalysts: z.array(z.string()),
  risks: z.array(z.string()),
  recommendation: z.string(),
});
export type AIThesis = z.infer<typeof AIThesisSchema>;

export const PipelineEventSchema = z.discriminatedUnion("type", [
  z.object({ type: z.literal("status"), step: z.string(), detail: z.string().optional() }),
  z.object({ type: z.literal("market_analysis"), analysis: MarketAnalysisSchema }),
  z.object({ type: z.literal("news_analysis"), analysis: NewsAnalysisSchema }),
  z.object({
    type: z.literal("agent_opinion"),
    role: z.enum(["bull", "bear"]),
    opinion: AgentOpinionSchema,
  }),
  z.object({ type: z.literal("trade_proposal"), proposal: TradeProposalWireSchema }),
  z.object({ type: z.literal("agent_message"), message: AgentMessageSchema }),
  z.object({ type: z.literal("thesis"), thesis: AIThesisSchema }),
  z.object({
    type: z.literal("error"),
    step: z.string(),
    message: z.string(),
    detail: z.string().optional(),
  }),
  z.object({ type: z.literal("done") }),
]);
export type PipelineEvent = z.infer<typeof PipelineEventSchema>;
