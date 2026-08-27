import {
  AgentOpinionSchema,
  ThesisAgentInputSchema,
  type AnalysisStatement,
  type AgentOpinion,
  type ThesisAgentInput,
} from "@/lib/contracts/research";
import { StructuredAgent, type StructuredAgentConfig } from "./base-agent";
import { exposurePctForSector, sectorForSymbol } from "./portfolio-utils";
import { BULL_SYSTEM } from "./prompts";

function observation(statement: string): AnalysisStatement {
  return { kind: "observation", statement };
}

function interpretation(statement: string): AnalysisStatement {
  return { kind: "interpretation", statement };
}

export const BULLISH_STANCE: AgentOpinion["stance"] = "bullish";

export function buildFallbackBullOpinion(input: ThesisAgentInput): AgentOpinion {
  const { symbol, marketAnalysis: ma, newsAnalysis: na, portfolioContext } = input;

  const evidence: AnalysisStatement[] = [
    observation(`Market analysis states: "${ma.supportingObservations[0]?.statement ?? "insufficient_data"}"`),
    observation(`Market labels: trend "${ma.trend}", momentum "${ma.momentum}", volatility regime "${ma.volatilityRegime}"`),
  ];
  if (na.catalysts.length > 0) {
    evidence.push(observation(`News catalyst on record: "${na.catalysts[0].statement}"`));
  }
  evidence.push(observation(`Aggregate provided news sentiment: ${na.sentiment}`));

  const arguments_: AnalysisStatement[] = [];
  if (ma.trend === "up" && (ma.momentum === "positive" || ma.momentum === "strongly_positive")) {
    arguments_.push(interpretation("Trend and momentum labels align, supporting continued upside participation"));
  }
  if (na.sentiment >= 0.15) {
    arguments_.push(interpretation("Provided news flow skews constructive, backing the demand narrative"));
  }
  if (ma.volatilityRegime !== "high") {
    arguments_.push(interpretation("Contained volatility favors defined-risk upside structures"));
  }
  if (arguments_.length === 0) {
    arguments_.push(
      interpretation("Even under thin conditions, the provided evidence does not preclude a constructive outcome"),
    );
  }

  const risks: AnalysisStatement[] = [
    ...ma.potentialConcerns.map((c) => interpretation(`Market analysis itself cautions: ${c.statement}`)),
    ...na.negativeFactors.map((n) => interpretation(`News coverage carries a headwind: ${n.statement}`)),
  ];
  const sector = sectorForSymbol(symbol, ma.sector, portfolioContext);
  const exposurePct = exposurePctForSector(portfolioContext, sector);
  if ((exposurePct ?? 0) >= 25) {
    risks.push(
      interpretation(
        `Existing ${sector} book exposure of ${exposurePct}% makes additional concentration a thesis risk`,
      ),
    );
  }

  return AgentOpinionSchema.parse({
    symbol,
    stance: BULLISH_STANCE,
    confidence: clampConfidence(
      40 +
        12 * bullishFlags(ma, na) -
        (hasConflictingEvidence(na) ? 8 : 0) -
        insufficiencyPenalty(ma, na),
    ),
    arguments: arguments_,
    evidence,
    risks,
    keyAssumptions: [
      `Momentum label "${ma.momentum}" persists over the assessed ${na.timeHorizon} horizon`,
      `Coverage of information quality "${na.informationQuality}" is representative of the true information environment`,
      "No adverse material event beyond those provided occurs during the holding period",
    ],
    invalidationConditions: [
      `Market trend label flips away from "${ma.trend}"`,
      `Aggregate news sentiment falls below the currently provided ${na.sentiment} reading`,
      "A bearish material event emerges that outweighs the cited catalysts",
    ],
  });
}

export function bullishFlags(
  ma: ThesisAgentInput["marketAnalysis"],
  na: ThesisAgentInput["newsAnalysis"],
): number {
  return (
    (ma.trend === "up" ? 1 : 0) +
    (ma.momentum === "positive" || ma.momentum === "strongly_positive" ? 1 : 0) +
    (na.sentiment >= 0.15 ? 1 : 0)
  );
}

export function bearishFlags(
  ma: ThesisAgentInput["marketAnalysis"],
  na: ThesisAgentInput["newsAnalysis"],
): number {
  return (
    (ma.trend === "down" ? 1 : 0) +
    (ma.momentum === "negative" || ma.momentum === "strongly_negative" ? 1 : 0) +
    (na.sentiment <= -0.15 ? 1 : 0)
  );
}

export function hasConflictingEvidence(na: ThesisAgentInput["newsAnalysis"]): boolean {
  return na.catalysts.length > 0 && na.negativeFactors.length > 0;
}

export function insufficiencyPenalty(ma: ThesisAgentInput["marketAnalysis"], na: ThesisAgentInput["newsAnalysis"]): number {
  const sentinels =
    (ma.trend === "insufficient_data" ? 1 : 0) +
    (ma.momentum === "insufficient_data" ? 1 : 0) +
    (na.timeHorizon === "insufficient_data" ? 1 : 0);
  return 6 * sentinels + (na.informationQuality === "insufficient" ? 10 : 0);
}

export function clampConfidence(value: number): number {
  return Math.min(88, Math.max(15, Math.round(value)));
}

export function buildBullPrompt(input: ThesisAgentInput): string {
  return `Symbol: ${input.symbol}

MARKET ANALYSIS (verbatim):
${JSON.stringify(input.marketAnalysis)}

NEWS ANALYSIS (verbatim):
${JSON.stringify(input.newsAnalysis)}
${
  input.portfolioContext
    ? `
PORTFOLIO CONTEXT (may inform risk framing; do not invent positions):
${JSON.stringify(input.portfolioContext)}`
    : ""
}

Construct the strongest evidence-based bullish thesis per your rules. Every evidence item must cite the material above.`;
}

export const bullAgentConfig: StructuredAgentConfig<ThesisAgentInput, AgentOpinion> = {
  name: "BullAgent",
  role: "bull",
  description: "Constructs the strongest evidence-based bullish thesis from the shared analyses",
  systemPrompt: BULL_SYSTEM,
  inputSchema: ThesisAgentInputSchema,
  outputSchema: AgentOpinionSchema,
  buildPrompt: buildBullPrompt,
  fallback: buildFallbackBullOpinion,
  maxAttempts: 2,
  validate: (output) => {
    if (output.stance !== BULLISH_STANCE) {
      throw new Error(`bull agent must take a bullish stance, received "${output.stance}"`);
    }
  },
};

export const bullAgent = new StructuredAgent(bullAgentConfig);
