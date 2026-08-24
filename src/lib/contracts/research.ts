import { z } from "zod";

export const AGENT_ROLES = ["news", "market", "bull", "bear", "cio"] as const;
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

export const AgentMessageSchema = z.object({
  role: AgentRoleSchema,
  stance: StanceSchema,
  headline: z.string(),
  body: z.string(),
  confidence: z.number().min(0).max(100).nullable(),
  keyPoints: z.array(z.string()),
});
export type AgentMessage = z.infer<typeof AgentMessageSchema>;

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

export const SuggestedStrategySchema = z.object({
  structure: OptionsStructureSchema,
  rationale: z.string(),
  estimatedMaxRiskUsd: z.number().nonnegative(),
});
export type SuggestedStrategy = z.infer<typeof SuggestedStrategySchema>;

export const AIThesisSchema = z.object({
  symbol: z.string(),
  generatedAt: z.string(),
  direction: z.enum(["BULLISH", "BEARISH", "NEUTRAL"]),
  confidence: z.number().min(0).max(100),
  summary: z.string(),
  catalysts: z.array(z.string()),
  risks: z.array(z.string()),
  recommendation: z.string(),
  suggestedStrategy: SuggestedStrategySchema,
});
export type AIThesis = z.infer<typeof AIThesisSchema>;

export const ResearchContextSchema = z.object({
  snapshot: MarketSnapshotSchema,
  news: z.array(NewsItemSchema),
});
export type ResearchContext = z.infer<typeof ResearchContextSchema>;

export type PipelineEvent =
  | { type: "status"; step: string; detail?: string }
  | { type: "context"; snapshot: MarketSnapshot; newsCount: number }
  | { type: "agent_message"; message: AgentMessage }
  | { type: "thesis"; thesis: AIThesis }
  | { type: "error"; step: string; message: string }
  | { type: "done" };
