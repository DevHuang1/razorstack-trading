import {
  AgentOpinionSchema,
  ThesisAgentInputSchema,
  type AnalysisStatement,
  type AgentOpinion,
  type ThesisAgentInput,
} from "@/lib/contracts/research";
import { StructuredAgent, type StructuredAgentConfig } from "./base-agent";
import { exposurePctForSector, sectorForSymbol } from "./portfolio-utils";
import { BEAR_SYSTEM } from "./prompts";
import { bearishFlags, clampConfidence, hasConflictingEvidence, insufficiencyPenalty } from "./bull-agent";

function observation(statement: string): AnalysisStatement {
  return { kind: "observation", statement };
}

function interpretation(statement: string): AnalysisStatement {
  return { kind: "interpretation", statement };
}

export const BEARISH_STANCE: AgentOpinion["stance"] = "bearish";

export function buildFallbackBearOpinion(input: ThesisAgentInput): AgentOpinion {
  const { symbol, marketAnalysis: ma, newsAnalysis: na, portfolioContext } = input;

  const evidence: AnalysisStatement[] = [
    observation(`Market labels under challenge: trend "${ma.trend}", momentum "${ma.momentum}", volatility regime "${ma.volatilityRegime}"`),
  ];
  if (na.negativeFactors.length > 0) {
    evidence.push(observation(`Contradictory coverage on record: "${na.negativeFactors[0].statement}"`));
  }
  if (na.catalysts.length > 0) {
    evidence.push(
      observation(
        `The bullish case rests on: "${na.catalysts[0].statement}" — evidential weight limited by information quality "${na.informationQuality}"`,
      ),
    );
  }
  if (ma.potentialConcerns.length > 0) {
    evidence.push(observation(`Market analysis itself flags: "${ma.potentialConcerns[0].statement}"`));
  }

  const arguments_: AnalysisStatement[] = [];
  if (ma.volatilityRegime === "high") {
    arguments_.push(interpretation("High volatility regime inflates premiums and widens failure scenarios for long structures"));
  }
  if (ma.trend === "up" && ma.momentum !== "insufficient_data") {
    arguments_.push(
      interpretation(`Upside case depends on the provided "${ma.momentum}" momentum persisting; mean reversion after such readings is a concrete failure path`),
    );
  }
  if (na.informationQuality === "low" || na.informationQuality === "medium") {
    arguments_.push(
      interpretation(`Coverage quality is only "${na.informationQuality}", so bullish claims rest on thin evidence`),
    );
  }
  if (na.negativeFactors.length > 0) {
    arguments_.push(interpretation("Provided coverage already contains explicit headwinds that offset the cited catalysts"));
  }
  const sector = sectorForSymbol(symbol, ma.sector, portfolioContext);
  const exposurePct = exposurePctForSector(portfolioContext, sector);
  if ((exposurePct ?? 0) >= 25) {
    arguments_.push(
      interpretation(
        `Book ${sector} exposure of ${exposurePct}% means thesis failure would compound existing concentration losses`,
      ),
    );
  }
  if (arguments_.length === 0) {
    arguments_.push(
      interpretation("Absent strong confirming labels, the burden of proof for upside action is not met"),
    );
  }

  const risks: AnalysisStatement[] = [
    ...na.catalysts.map((c) => interpretation(`If the cited catalyst disappoints in execution — ${c.statement} — the bearish stance itself is wrong`)),
  ];

  return AgentOpinionSchema.parse({
    symbol,
    stance: BEARISH_STANCE,
    confidence: clampConfidence(
      40 +
        12 * bearishFlags(ma, na) +
        (hasConflictingEvidence(na) ? 4 : 0) -
        insufficiencyPenalty(ma, na),
    ),
    arguments: arguments_,
    evidence,
    risks,
    keyAssumptions: [
      `Bull case assumes momentum "${ma.momentum}" persists rather than mean-reverting`,
      `Bull case assumes catalysts within the "${na.timeHorizon}" horizon are not already priced in`,
      "Bull case treats coverage quality limits as immaterial",
    ],
    invalidationConditions: [
      `Trend label strengthens beyond "${ma.trend}" with improving breadth`,
      `Aggregate news sentiment rises decisively above the provided ${na.sentiment} reading`,
      "The cited downside catalysts fail to materialize within the assessed horizon while price holds key levels",
    ],
  });
}

export function buildBearPrompt(input: ThesisAgentInput): string {
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

Attempt to invalidate the strongest bullish reading of this material per your rules. Every argument must reference the actual evidence above; generic risks are forbidden.`;
}

export const bearAgentConfig: StructuredAgentConfig<ThesisAgentInput, AgentOpinion> = {
  name: "BearAgent",
  role: "bear",
  description:
    "Adversarially attempts to invalidate the bullish reading using strictly the shared, provided evidence",
  systemPrompt: BEAR_SYSTEM,
  inputSchema: ThesisAgentInputSchema,
  outputSchema: AgentOpinionSchema,
  buildPrompt: buildBearPrompt,
  fallback: buildFallbackBearOpinion,
  maxAttempts: 2,
  validate: (output) => {
    if (output.stance !== BEARISH_STANCE) {
      throw new Error(`bear agent must take a bearish stance, received "${output.stance}"`);
    }
  },
};

export const bearAgent = new StructuredAgent(bearAgentConfig);
