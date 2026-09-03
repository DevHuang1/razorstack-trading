import type {
  AgentMessage,
  AIThesis,
  AgentOpinion,
  MarketAnalysis,
  NewsAnalysis,
  Stance,
  TradeProposal,
} from "@/lib/contracts/research";

function stanceFromScore(score: number): Stance {
  if (score > 5) return "bullish";
  if (score < -5) return "bearish";
  return "neutral";
}

function statementsToText(statements: { kind: string; statement: string }[]): string {
  if (!statements.length) return "";
  return statements.slice(0, 3).map((s) => s.statement).join(" · ");
}

export function newsMessage(analysis: NewsAnalysis): AgentMessage {
  const stance = stanceFromScore(analysis.sentiment * 100);
  const headline =
    analysis.catalysts[0]?.statement ??
    analysis.materialEvents[0]?.statement ??
    `${analysis.symbol} ${stance}`;
  const body = [statementsToText(analysis.notes), statementsToText(analysis.negativeFactors)]
    .filter(Boolean)
    .join(" · ");
  return {
    role: "news",
    stance,
    headline,
    body: body || analysis.timeHorizon,
    confidence: analysis.confidence,
  };
}

export function marketMessage(analysis: MarketAnalysis): AgentMessage {
  const stance =
    analysis.trend === "up" || analysis.momentum.startsWith("positive")
      ? "bullish"
      : analysis.trend === "down" || analysis.momentum.startsWith("negative")
        ? "bearish"
        : "neutral";
  const headline = `Trend ${analysis.trend} · momentum ${analysis.momentum.replaceAll("_", " ")}`;
  const body = statementsToText(analysis.supportingObservations);
  return {
    role: "market_research",
    stance,
    headline,
    body: body || analysis.volatilityRegime,
    confidence: analysis.confidence,
  };
}

export function opinionMessage(
  role: "bull" | "bear",
  opinion: AgentOpinion,
): AgentMessage {
  const stance: Stance = role === "bull" ? "bullish" : "bearish";
  const headline = opinion.arguments[0]?.statement ?? `${role} case for ${opinion.symbol}`;
  const body = statementsToText(opinion.evidence);
  return {
    role,
    stance,
    headline,
    body: body || (opinion.risks[0]?.statement ?? ""),
    confidence: opinion.confidence,
  };
}

function stanceFromAction(action: TradeProposal["action"]): Stance {
  if (action === "BUY") return "bullish";
  if (action === "SELL") return "bearish";
  return "neutral";
}

export function committeeMessage(proposal: TradeProposal): AgentMessage {
  return {
    role: "investment_committee",
    stance: stanceFromAction(proposal.action),
    headline: proposal.thesis,
    body: statementsToText(proposal.portfolioConsiderations),
    confidence: proposal.confidence,
  };
}

export function toAIThesis(proposal: TradeProposal): AIThesis {
  return {
    symbol: proposal.symbol,
    direction: proposal.action,
    confidence: Math.round(proposal.confidence),
    summary: proposal.thesis,
    catalysts: proposal.supportingFactors.map((f) => f.statement),
    risks: proposal.risks.map((r) => r.statement),
    recommendation: `${proposal.symbol} ${proposal.action} via ${proposal.strategy.replaceAll("_", " ")}`,
  };
}
