import { askClaudeJson } from "./llm";
import type { MarketSnapshot, NewsItem, Stance } from "@/lib/contracts/research";

export interface AgentMessage {
  role: AgentRoleName;
  stance: Stance;
  headline: string;
  body: string;
  confidence: number | null;
}

export type AgentRoleName =
  | "news"
  | "market_research"
  | "bull"
  | "bear"
  | "crisis_news"
  | "crisis_market"
  | "crisis_risk_analyst"
  | "crisis_options"
  | "investment_committee"
  | "crisis_committee";

export interface CIOSynthesis {
  symbol: string;
  direction: string;
  confidence: number;
  summary: string;
  catalysts: string[];
  risks: string[];
  recommendation: string;
}

export interface CommitteeSynthesis extends CIOSynthesis {
  stance: Stance;
}

interface StanceBody {
  stance: Stance;
  headline: string;
  body: string;
  confidence: number;
}

interface CommitteeRaw extends StanceBody {
  direction: string;
  catalysts?: string[];
  risks?: string[];
  recommendation: string;
}

const J = "Respond with valid JSON only. No markdown or code fences.";

function stanceMessage(role: AgentRoleName, r: StanceBody): AgentMessage {
  return { role, stance: r.stance, headline: r.headline, body: r.body, confidence: r.confidence };
}

function synthesize(symbol: string, raw: CommitteeRaw): CommitteeSynthesis {
  return {
    symbol,
    direction: raw.direction,
    confidence: raw.confidence,
    summary: raw.headline,
    catalysts: raw.catalysts ?? [],
    risks: raw.risks ?? [],
    recommendation: raw.recommendation,
    stance: raw.stance,
  };
}

export async function runNewsAgent(s: string, news: NewsItem[]): Promise<AgentMessage> {
  const r = await askClaudeJson<StanceBody>(
    `You are Sage, the News Intelligence agent. ${J} Return: {"stance":"bullish"|"bearish"|"neutral","headline":"<one sentence>","body":"<2+ sentences>","confidence":<0-100>}`,
    news.length ? news.map((n) => n.headline).join("\n") : `No news for ${s}. Use training knowledge.`,
  );
  return stanceMessage("news", r);
}

export async function runMarketResearchAgent(s: string, snap: MarketSnapshot): Promise<AgentMessage> {
  const r = await askClaudeJson<StanceBody>(
    `You are Vector, the Market Structure agent. ${J} Return: {"stance":"bullish"|"bearish"|"neutral","headline":"<one sentence>","body":"<2+ sentences>","confidence":<0-100>}`,
    `${s} @ $${snap.price} RSI:${snap.rsi14} Regime:${snap.regime} Vol:${snap.realizedVol30dAnnPct}%`,
  );
  return stanceMessage("market_research", r);
}

export async function runBullAgent(
  s: string,
  snap: MarketSnapshot,
  nM: AgentMessage,
  mM: AgentMessage,
): Promise<AgentMessage> {
  const r = await askClaudeJson<StanceBody>(
    `You are Atlas, the Bull Case agent. ${J} Return: {"stance":"bullish","headline":"<one sentence>","body":"<2+ sentences>","confidence":<0-100>}`,
    `${s} @ $${snap.price} Sage: ${nM.headline} Vector: ${mM.headline}`,
  );
  return stanceMessage("bull", { ...r, stance: "bullish" });
}

export async function runBearAgent(
  s: string,
  snap: MarketSnapshot,
  nM: AgentMessage,
  mM: AgentMessage,
): Promise<AgentMessage> {
  const r = await askClaudeJson<StanceBody>(
    `You are Mara, the Risk Challenge agent. ${J} Return: {"stance":"bearish","headline":"<one sentence>","body":"<2+ sentences>","confidence":<0-100>}`,
    `${s} @ $${snap.price} Sage: ${nM.headline} Vector: ${mM.headline}`,
  );
  return stanceMessage("bear", { ...r, stance: "bearish" });
}

export async function runCIOAgent(
  s: string,
  snap: MarketSnapshot,
  nM: AgentMessage,
  mM: AgentMessage,
  bM: AgentMessage,
  beM: AgentMessage,
): Promise<{ message: AgentMessage; thesis: CIOSynthesis }> {
  const raw = await askClaudeJson<CommitteeRaw>(
    `You are North, the CIO. ${J} Return: {"stance":"bullish"|"bearish"|"neutral","headline":"<one sentence>","body":"<2+ sentences>","confidence":<0-100>,"direction":"BUY"|"SELL"|"HOLD","catalysts":[],"risks":[],"recommendation":"<actionable>"}`,
    `${s} Sage: ${nM.headline} Vector: ${mM.headline} Atlas: ${bM.headline} Mara: ${beM.headline}`,
  );
  return {
    message: stanceMessage("investment_committee", {
      stance: raw.stance,
      headline: raw.headline,
      body: raw.body,
      confidence: raw.confidence,
    }),
    thesis: synthesize(s, raw),
  };
}

export async function runCrisisNewsAgent(s: string, news: NewsItem[]): Promise<AgentMessage> {
  const r = await askClaudeJson<StanceBody>(
    `You are Sentinel, Crisis News agent. ${J} Return: {"stance":"bullish"|"bearish"|"neutral","headline":"<one sentence>","body":"<2+ sentences>","confidence":<0-100>}`,
    news.length ? news.map((n) => n.headline).join("\n") : `No news for ${s}.`,
  );
  return stanceMessage("crisis_news", r);
}

export async function runCrisisMarketAgent(s: string, snap: MarketSnapshot): Promise<AgentMessage> {
  const r = await askClaudeJson<StanceBody>(
    `You are Radar, Crisis Market agent. ${J} Return: {"stance":"bullish"|"bearish"|"neutral","headline":"<one sentence>","body":"<2+ sentences>","confidence":<0-100>}`,
    `${s} @ $${snap.price} Vol: ${snap.realizedVol30dAnnPct}% RSI: ${snap.rsi14}`,
  );
  return stanceMessage("crisis_market", r);
}

export async function runCrisisRiskAgent(s: string, snap: MarketSnapshot, mM: AgentMessage): Promise<AgentMessage> {
  const r = await askClaudeJson<StanceBody>(
    `You are Gauge, Crisis Risk Analyst. ${J} Return: {"stance":"bullish"|"bearish"|"neutral","headline":"<one sentence>","body":"<2+ sentences>","confidence":<0-100>}`,
    `${s} Radar: ${mM.headline}`,
  );
  return stanceMessage("crisis_risk_analyst", r);
}

export async function runCrisisOptionsAgent(s: string, snap: MarketSnapshot): Promise<AgentMessage> {
  const r = await askClaudeJson<StanceBody>(
    `You are Hedge, Crisis Options agent. ${J} Return: {"stance":"bullish"|"bearish"|"neutral","headline":"<one sentence>","body":"<2+ sentences>","confidence":<0-100>}`,
    `${s} Vol: ${snap.realizedVol30dAnnPct}%`,
  );
  return stanceMessage("crisis_options", r);
}

export async function runCrisisCommitteeAgent(
  s: string,
  snap: MarketSnapshot,
  nM: AgentMessage,
  mM: AgentMessage,
  rM: AgentMessage,
  oM: AgentMessage,
): Promise<{ message: AgentMessage; thesis: CIOSynthesis }> {
  const raw = await askClaudeJson<CommitteeRaw>(
    `You are Apex, Crisis Committee chair. ${J} Return: {"stance":"bullish"|"bearish"|"neutral","headline":"<one sentence>","body":"<2+ sentences>","confidence":<0-100>,"direction":"BUY"|"SELL"|"HOLD","catalysts":[],"risks":[],"recommendation":"<actionable>"}`,
    `${s} Sentinel: ${nM.headline} Radar: ${mM.headline} Gauge: ${rM.headline} Hedge: ${oM.headline}`,
  );
  return {
    message: stanceMessage("crisis_committee", {
      stance: raw.stance,
      headline: raw.headline,
      body: raw.body,
      confidence: raw.confidence,
    }),
    thesis: synthesize(s, raw),
  };
}
