import {
  CommitteeInputSchema,
  DebateResultSchema,
  TradeProposalSchema,
  type AnalysisStatement,
  type AgentOpinion,
  type CommitteeInput,
  type DebateResult,
  type InformationQuality,
  type TradeAction,
  type TradeProposal,
} from "@/lib/contracts/research";
import { StructuredAgent, type StructuredAgentConfig } from "./base-agent";
import { exposurePctForSector, positionIn, sectorForSymbol } from "./portfolio-utils";
import { INVESTMENT_COMMITTEE_SYSTEM } from "./prompts";
import {
  clampConfidence,
  hasConflictingEvidence,
  insufficiencyPenalty,
} from "./bull-agent";

const ACTION_THRESHOLD = 12;

function interpretation(statement: string): AnalysisStatement {
  return { kind: "interpretation", statement };
}

function observation(statement: string): AnalysisStatement {
  return { kind: "observation", statement };
}

function keyEvidenceQuote(opinion: AgentOpinion): AnalysisStatement {
  const specific = opinion.evidence.find((e) => e.statement.includes("(source:")) ?? opinion.evidence[0];
  return observation(`Key cited evidence behind the decision: "${specific.statement}"`);
}

function downgradeQuality(q: InformationQuality): InformationQuality {
  switch (q) {
    case "high":
      return "medium";
    case "medium":
      return "low";
    default:
      return "insufficient";
  }
}

export function evaluateEvidenceQuality(input: CommitteeInput): InformationQuality {
  const sentinel =
    input.marketAnalysis.trend === "insufficient_data" ||
    input.marketAnalysis.momentum === "insufficient_data";
  return sentinel ? downgradeQuality(input.newsAnalysis.informationQuality) : input.newsAnalysis.informationQuality;
}

export function decideCommitteeAction(input: CommitteeInput, evidenceQuality: InformationQuality): TradeAction {
  if (evidenceQuality === "insufficient") return "NO_TRADE";
  const diff = input.bullOpinion.confidence - input.bearOpinion.confidence;
  if (diff > ACTION_THRESHOLD) return "BUY";
  if (diff < -ACTION_THRESHOLD) return "SELL";
  return positionIn(input.portfolioContext, input.symbol) ? "HOLD" : "NO_TRADE";
}

export const CONCENTRATION_THRESHOLD_PCT = 25;

export function buildPortfolioConsiderations(input: CommitteeInput): AnalysisStatement[] {
  const { symbol, marketAnalysis: ma, portfolioContext } = input;
  if (!portfolioContext) return [];

  const considerations: AnalysisStatement[] = [];
  const sector = sectorForSymbol(symbol, ma.sector, portfolioContext);
  const exposurePct = exposurePctForSector(portfolioContext, sector);
  const held = positionIn(portfolioContext, symbol);

  if (sector && exposurePct === undefined) {
    considerations.push(
      observation(`Adding this position would introduce a new sector exposure (${sector})`),
    );
  }
  if (sector && (exposurePct ?? 0) >= CONCENTRATION_THRESHOLD_PCT) {
    considerations.push(
      interpretation(
        `Potential concentration risk exists: ${sector} already represents ${exposurePct}% of book equity`,
      ),
    );
  }
  if (held) {
    considerations.push(
      observation(`Desk already holds ${held.qty} share(s) of ${symbol}; this proposal evaluates adding to an existing exposure`),
    );
  }
  if (portfolioContext.largestPositions.includes(symbol)) {
    considerations.push(observation(`${symbol} is among the desk's largest positions`));
  }
  const recent = portfolioContext.recentTrades.filter((t) => t.symbol === symbol);
  for (const trade of recent.slice(0, 2)) {
    considerations.push(observation(`Recent ${trade.side} activity in ${symbol} (${trade.qty} shares on ${trade.executedAt}) is on record`));
  }
  return considerations;
}

function strategyFor(action: TradeAction): TradeProposal["strategy"] {
  if (action === "BUY") return "bull_call_spread";
  if (action === "SELL") return "bear_put_spread";
  return "no_trade";
}

function holdingPeriodFor(horizon: CommitteeInput["newsAnalysis"]["timeHorizon"]): string {
  switch (horizon) {
    case "short_term":
      return "Days to ~2 weeks";
    case "medium_term":
      return "2-6 weeks";
    case "long_term":
      return "1-3 months";
    case "mixed":
      return "Staged entry with weekly reviews";
    default:
      return "Not applicable - no position recommended";
  }
}

export function buildFallbackDebateResult(
  input: CommitteeInput,
  ctx: { action: TradeAction; confidence: number; thesis: string },
): DebateResult {
  const { symbol, marketAnalysis: ma, newsAnalysis: na, bullOpinion: bull, bearOpinion: bear } = input;
  const diff = bull.confidence - bear.confidence;
  const conflict = hasConflictingEvidence(na);

  const pointsOfAgreement: AnalysisStatement[] = [
    observation(
      `Both advocates reason over identical desk inputs and accept the same market labels: trend "${ma.trend}", momentum "${ma.momentum}", volatility regime "${ma.volatilityRegime}"`,
    ),
  ];
  if (Math.abs(diff) <= 10) {
    pointsOfAgreement.push(
      interpretation(
        `Conviction is nearly balanced (${bull.confidence}% vs ${bear.confidence}%): neither side commands the evidence`,
      ),
    );
  }

  const pointsOfDisagreement: AnalysisStatement[] = [];
  if (conflict) {
    pointsOfDisagreement.push(
      interpretation(
        `The split is evidential, not stylistic: provided coverage contains ${na.catalysts.length} bullish item(s) vs ${na.negativeFactors.length} bearish item(s), so news contradicts the market-data reading of "${ma.trend}" trend`,
      ),
    );
  } else {
    pointsOfDisagreement.push(
      interpretation(
        `The split is interpretive: the ${diff >= 0 ? "bull" : "bear"} advocate weights its reading higher by a ${Math.abs(diff)}-point conviction gap (${bull.confidence}% vs ${bear.confidence}%)`,
      ),
    );
  }

  const allEvidence = [...bull.evidence, ...bear.evidence];
  const cited = allEvidence.filter((e) => e.statement.includes("(source:"));
  const strongestEvidence =
    cited.length > 0
      ? cited.slice(0, 2)
      : [observation(`Grounded in market analysis: "${ma.supportingObservations[0]?.statement ?? "insufficient_data"}"`)];

  const weakestEvidence: AnalysisStatement[] = allEvidence
    .filter((e) => !e.statement.includes("(source:"))
    .slice(0, 1)
    .map((e) => interpretation(`Claim resting on interpretation rather than cited material: "${e.statement}"`));
  if (na.informationQuality !== "high") {
    weakestEvidence.push(
      interpretation(`Coverage quality "${na.informationQuality}" caps the evidential weight of every claim above`),
    );
  }

  const unresolvedQuestions: string[] = [];
  if (ma.trend === "insufficient_data" || ma.momentum === "insufficient_data") {
    unresolvedQuestions.push("What would the missing price/momentum context show, and could it flip the labels?");
  }
  if (conflict) {
    unresolvedQuestions.push("Do the cited catalysts outweigh the cited headwinds before the assessed horizon closes?");
  }
  if (na.timeHorizon === "mixed" || na.timeHorizon === "insufficient_data") {
    unresolvedQuestions.push("Over which time horizon do the competing forces actually resolve?");
  }
  if (na.informationQuality !== "high") {
    unresolvedQuestions.push("Is coverage beyond the provided articles materially different?");
  }
  if (unresolvedQuestions.length === 0) {
    unresolvedQuestions.push("Under what observed trigger would the losing advocate be vindicated?");
  }

  return DebateResultSchema.parse({
    symbol,
    bullCase: bull.arguments,
    bearCase: bear.arguments,
    pointsOfAgreement,
    pointsOfDisagreement,
    strongestEvidence,
    weakestEvidence,
    unresolvedQuestions,
    finalThesis: ctx.thesis,
    confidence: ctx.confidence,
  });
}

export function buildFallbackCommitteeProposal(input: CommitteeInput): TradeProposal {
  const { symbol, marketAnalysis: ma, newsAnalysis: na, bullOpinion: bull, bearOpinion: bear } = input;
  const evidenceQuality = evaluateEvidenceQuality(input);
  const conflict = hasConflictingEvidence(na);
  const diff = bull.confidence - bear.confidence;
  const action = decideCommitteeAction(input, evidenceQuality);
  const strategy = strategyFor(action);
  const leader = diff >= 0 ? bull : bear;
  const follower = diff >= 0 ? bear : bull;

  let supportingFactors: AnalysisStatement[];
  let contradictingFactors: AnalysisStatement[];
  if (action === "BUY" || action === "SELL") {
    supportingFactors = [
      ...leader.arguments.slice(0, 2),
      keyEvidenceQuote(leader),
      observation(
        `Shared market labels both advocates reason over: trend "${ma.trend}", momentum "${ma.momentum}", volatility regime "${ma.volatilityRegime}"`,
      ),
    ];
    contradictingFactors = follower.arguments.slice(0, 2);
  } else {
    supportingFactors = [
      interpretation(
        evidenceQuality === "insufficient"
          ? `Evidence quality "${evidenceQuality}" fails the desk's minimum bar for deploying capital regardless of advocate conviction`
          : conflict
            ? "Material conflict between catalysts and headwinds in the provided coverage keeps conviction below the action threshold"
            : "Advocate conviction gap does not clear the desk's action threshold",
      ),
    ];
    contradictingFactors = leader.arguments.slice(0, 1);
  }

  const riskCandidates = [
    ma.potentialConcerns[0]?.statement,
    na.negativeFactors[0]?.statement,
    bear.evidence[0]?.statement,
  ].filter((s): s is string => Boolean(s));
  const risks = riskCandidates
    .slice(0, 3)
    .map((statement) => interpretation(`Strongest risk under review: ${statement}`));

  const invalidationConditions: string[] =
    action === "BUY" || action === "SELL"
      ? [
          ...leader.invalidationConditions.slice(0, 3),
          `${follower.stance} advocate's failure scenario to monitor: ${follower.invalidationConditions[0]}`,
        ]
      : [
          "Any change in provided labels or arrival of new material news triggers a full desk re-run",
          "Existing positions are re-evaluated against updated analyses at every pipeline run",
        ];

  const thesis =
    action === "BUY" || action === "SELL"
      ? `Committee synthesis for ${symbol}: the ${leader.stance} reading prevails on advocate conviction (${leader.confidence}% vs ${follower.confidence}%) with ${evidenceQuality} evidence quality${conflict ? " and a noted bull/bear conflict retained in contradicting factors" : ""}. Recommendation: ${action} via ${strategy}. This is an AI research proposal requiring risk approval - not an executed or executable order.`
      : `Committee synthesis for ${symbol}: neither reading clears the desk's action threshold (advocate conviction ${bull.confidence}% bull vs ${bear.confidence}% bear, evidence quality ${evidenceQuality}${conflict ? ", conflicting coverage" : ""}). Recommendation: ${action}. Capital preservation preferred. This is an AI research proposal requiring risk approval - not an executed or executable order.`;

  const confidence = clampConfidence(
    48 +
      Math.floor(Math.abs(diff) / 4) +
      (evidenceQuality === "high" ? 10 : evidenceQuality === "medium" ? 5 : evidenceQuality === "low" ? 0 : -8) -
      (conflict ? 6 : 0) -
      Math.ceil(insufficiencyPenalty(ma, na) / 2),
  );

  return TradeProposalSchema.parse({
    symbol,
    action,
    strategy,
    instrument: null,
    thesis,
    confidence,
    supportingFactors,
    contradictingFactors,
    risks,
    invalidationConditions,
    suggestedHoldingPeriod: holdingPeriodFor(na.timeHorizon),
    evidenceQuality,
    requiresRiskApproval: true,
    debate: buildFallbackDebateResult(input, { action, confidence, thesis }),
    portfolioConsiderations: buildPortfolioConsiderations(input),
  });
}

export function buildCommitteePrompt(input: CommitteeInput): string {
  return `Symbol: ${input.symbol}

MARKET ANALYSIS (verbatim):
${JSON.stringify(input.marketAnalysis)}

NEWS ANALYSIS (verbatim):
${JSON.stringify(input.newsAnalysis)}

BULL ADVOCATE OPINION (verbatim):
${JSON.stringify(input.bullOpinion)}

BEAR ADVOCATE OPINION (verbatim):
${JSON.stringify(input.bearOpinion)}
${
  input.portfolioContext
    ? `
PORTFOLIO CONTEXT (may inform risk framing; do not invent positions):
${JSON.stringify(input.portfolioContext)}`
    : ""
}

Synthesize per your nine duties. Do not rubber-stamp either advocate; weigh evidence quality and conflicts. If option pricing was not provided above, set instrument to null.`;
}

export const investmentCommitteeAgentConfig: StructuredAgentConfig<CommitteeInput, TradeProposal> = {
  name: "InvestmentCommitteeAgent",
  role: "investment_committee",
  description:
    "Synthesizes the four research artifacts into an explainable, risk-gated trade proposal; never executes",
  systemPrompt: INVESTMENT_COMMITTEE_SYSTEM,
  inputSchema: CommitteeInputSchema,
  outputSchema: TradeProposalSchema,
  buildPrompt: buildCommitteePrompt,
  fallback: buildFallbackCommitteeProposal,
  maxAttempts: 2,
};

export const investmentCommitteeAgent = new StructuredAgent(investmentCommitteeAgentConfig);
