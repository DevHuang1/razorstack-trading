import { z } from "zod";
import { AnalysisStatementSchema, NewsItemSchema, PortfolioPositionSchema } from "./research";

export const CrisisContextSchema = z.object({
  marketMove: z.object({
    benchmark: z.string().min(1),
    changePct: z.number(),
    windowLabel: z.string().optional(),
  }),
  volatilityChange: z.object({
    indexLabel: z.string().min(1),
    currentLevel: z.number().positive(),
    priorLevel: z.number().positive().optional(),
  }),
  portfolioDrawdownPct: z.number(),
  affectedSectors: z.array(z.string()),
  newsEvents: z.array(NewsItemSchema),
  currentPositions: z.array(PortfolioPositionSchema),
  reportedBy: z.string().optional(),
});
export type CrisisContext = z.infer<typeof CrisisContextSchema>;

export const CrisisSeveritySchema = z.enum([
  "insufficient_data",
  "normal",
  "moderate",
  "severe",
  "critical",
]);
export type CrisisSeverity = z.infer<typeof CrisisSeveritySchema>;

export const CrisisNewsAssessmentSchema = z.object({
  identifiedDrivers: z.array(AnalysisStatementSchema),
  notes: z.array(AnalysisStatementSchema).min(1),
  confidence: z.number().min(0).max(100),
});
export type CrisisNewsAssessment = z.infer<typeof CrisisNewsAssessmentSchema>;

export const CrisisMarketRegimeSchema = z.object({
  regimeAssessment: z.enum(["risk_on", "neutral", "risk_off", "insufficient_data"]),
  volatilityAssessment: z.enum(["normal", "elevated", "extreme", "insufficient_data"]),
  observations: z.array(AnalysisStatementSchema).min(1),
  confidence: z.number().min(0).max(100),
});
export type CrisisMarketRegime = z.infer<typeof CrisisMarketRegimeSchema>;

export const CrisisRiskAnalysisSchema = z.object({
  vulnerabilities: z.array(AnalysisStatementSchema).min(1),
  concentrationFlags: z.array(AnalysisStatementSchema),
  liquidityConcerns: z.array(AnalysisStatementSchema),
  confidence: z.number().min(0).max(100),
});
export type CrisisRiskAnalysis = z.infer<typeof CrisisRiskAnalysisSchema>;

export const CrisisOptionsPlaybookSchema = z.object({
  hedgingConcepts: z.array(AnalysisStatementSchema).min(1),
  rationale: z.string().min(1),
  confidence: z.number().min(0).max(100),
});
export type CrisisOptionsPlaybook = z.infer<typeof CrisisOptionsPlaybookSchema>;

export const CrisisCommitteeInputSchema = z.object({
  context: CrisisContextSchema,
  newsAssessment: CrisisNewsAssessmentSchema,
  marketRegime: CrisisMarketRegimeSchema,
  riskAnalysis: CrisisRiskAnalysisSchema,
  optionsPlaybook: CrisisOptionsPlaybookSchema,
});
export type CrisisCommitteeInput = z.infer<typeof CrisisCommitteeInputSchema>;

export const CrisisResponseSchema = z.object({
  severity: CrisisSeveritySchema,
  summary: z.string().min(1),
  portfolioVulnerabilities: z.array(AnalysisStatementSchema),
  recommendedActions: z.array(AnalysisStatementSchema),
  hedgingIdeas: z.array(AnalysisStatementSchema),
  reasons: z.array(AnalysisStatementSchema),
  confidence: z.number().min(0).max(100),
  requiresRiskApproval: z.literal(true),
});
export type CrisisResponse = z.infer<typeof CrisisResponseSchema>;
