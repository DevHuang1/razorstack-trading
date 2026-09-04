import { z } from "zod";
import { StructuredAgent, type StructuredAgentConfig } from "./base-agent";
import {
  MarketSnapshotSchema,
  NewsItemSchema,
  StanceSchema,
  type MarketSnapshot,
  type NewsItem,
  type Stance,
} from "@/lib/contracts/research";

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

export interface StanceBody {
  stance: Stance;
  headline: string;
  body: string;
  confidence: number;
}

export interface CommitteeRaw extends StanceBody {
  direction: string;
  catalysts?: string[];
  risks?: string[];
  recommendation: string;
}

const StanceBodySchema = z.object({
  stance: StanceSchema,
  headline: z.string(),
  body: z.string(),
  confidence: z.number(),
});

const CommitteeRawSchema = StanceBodySchema.extend({
  direction: z.string(),
  catalysts: z.array(z.string()),
  risks: z.array(z.string()),
  recommendation: z.string(),
});

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

const NewsInputSchema = z.object({ symbol: z.string(), news: z.array(NewsItemSchema) });
type NewsInput = z.infer<typeof NewsInputSchema>;

const MarketInputSchema = z.object({ symbol: z.string(), snapshot: MarketSnapshotSchema });
type MarketInput = z.infer<typeof MarketInputSchema>;

const BullBearInputSchema = z.object({
  symbol: z.string(),
  snapshot: MarketSnapshotSchema,
  news: z.object({ headline: z.string() }),
  market: z.object({ headline: z.string() }),
});
type BullBearInput = z.infer<typeof BullBearInputSchema>;

const CIOInputSchema = z.object({
  symbol: z.string(),
  snapshot: MarketSnapshotSchema,
  news: z.object({ headline: z.string() }),
  market: z.object({ headline: z.string() }),
  bull: z.object({ headline: z.string() }),
  bear: z.object({ headline: z.string() }),
});
type CIOInput = z.infer<typeof CIOInputSchema>;

const CrisisRiskInputSchema = z.object({
  symbol: z.string(),
  snapshot: MarketSnapshotSchema,
  market: z.object({ headline: z.string() }),
});
type CrisisRiskInput = z.infer<typeof CrisisRiskInputSchema>;

const CrisisCommitteeInputSchema = z.object({
  symbol: z.string(),
  snapshot: MarketSnapshotSchema,
  news: z.object({ headline: z.string() }),
  market: z.object({ headline: z.string() }),
  risk: z.object({ headline: z.string() }),
  options: z.object({ headline: z.string() }),
});
type CrisisCommitteeInput = z.infer<typeof CrisisCommitteeInputSchema>;

function pickStance(price: number, rsi: number): Stance {
  if (rsi >= 70) return "bearish";
  if (rsi <= 30) return "bullish";
  return "neutral";
}

const newsAgentConfig: StructuredAgentConfig<NewsInput, StanceBody> = {
  name: "NewsAgent",
  role: "news",
  description: "Sage — News Intelligence agent",
  systemPrompt:
    `You are Sage, the News Intelligence agent analysing supplied market news. ${J} Return: ` +
    `{"stance":"bullish"|"bearish"|"neutral","headline":"<one sentence>","body":"<2+ sentences>","confidence":<0-100>}`,
  inputSchema: NewsInputSchema,
  outputSchema: StanceBodySchema,
  buildPrompt: (i) =>
    i.news.length ? i.news.map((n) => n.headline).join("\n") : `No news for ${i.symbol}. Use training knowledge.`,
  fallback: (i) => {
    const bullish = i.news.filter((n) => (n.sentiment ?? 0) > 0.3).length;
    const bearish = i.news.filter((n) => (n.sentiment ?? 0) < -0.3).length;
    const stance: Stance = bearish > bullish ? "bearish" : bullish > bearish ? "bullish" : "neutral";
    const total = i.news.length || 0;
    const conf = total ? Math.round(50 + Math.abs(bullish - bearish) * 10) : 40;
    return {
      stance,
      headline: `${i.symbol}: ${i.news.length ? `\u0022${i.news[0].headline}\u0022` : "no supplied news"}`,
      body:
        i.news.length
          ? `${total} item(s) reviewed; sentiment leans ${stance}.`
          : `No supplied news for ${i.symbol}; relying on training knowledge.`,
      confidence: Math.min(100, Math.max(0, conf)),
    };
  },
};

const marketAgentConfig: StructuredAgentConfig<MarketInput, StanceBody> = {
  name: "MarketResearchAgent",
  role: "market_research",
  description: "Vector — Market Structure agent",
  systemPrompt:
    `You are Vector, the Market Structure agent. ${J} Return: ` +
    `{"stance":"bullish"|"bearish"|"neutral","headline":"<one sentence>","body":"<2+ sentences>","confidence":<0-100>}`,
  inputSchema: MarketInputSchema,
  outputSchema: StanceBodySchema,
  buildPrompt: (i) =>
    `${i.symbol} @ $${i.snapshot.price} RSI:${i.snapshot.rsi14} Regime:${i.snapshot.regime} Vol:${i.snapshot.realizedVol30dAnnPct}%`,
  fallback: (i) => ({
    stance: pickStance(i.snapshot.price, i.snapshot.rsi14),
    headline: `${i.symbol} @ $${i.snapshot.price} (RSI ${i.snapshot.rsi14}, regime ${i.snapshot.regime})`,
    body: `Market regime is ${i.snapshot.regime} with RSI ${i.snapshot.rsi14} and realized vol ${i.snapshot.realizedVol30dAnnPct}%.`,
    confidence: 60,
  }),
};

const bullAgentConfig: StructuredAgentConfig<BullBearInput, StanceBody> = {
  name: "BullAgent",
  role: "bull",
  description: "Atlas — Bull Case agent",
  systemPrompt:
    `You are Atlas, the Bull Case agent. ${J} Return: ` +
    `{"stance":"bullish","headline":"<one sentence>","body":"<2+ sentences>","confidence":<0-100>}`,
  inputSchema: BullBearInputSchema,
  outputSchema: StanceBodySchema,
  buildPrompt: (i) => `${i.symbol} @ $${i.snapshot.price} Sage: ${i.news.headline} Vector: ${i.market.headline}`,
  fallback: (i) => ({
    stance: "bullish",
    headline: `${i.symbol}: constructive price structure`,
    body: `Bull case: ${i.symbol} trades at $${i.snapshot.price}; Sage notes "${i.news.headline}" and Vector notes "${i.market.headline}".`,
    confidence: 58,
  }),
};

const bearAgentConfig: StructuredAgentConfig<BullBearInput, StanceBody> = {
  name: "BearAgent",
  role: "bear",
  description: "Mara — Risk Challenge agent",
  systemPrompt:
    `You are Mara, the Risk Challenge agent. ${J} Return: ` +
    `{"stance":"bearish","headline":"<one sentence>","body":"<2+ sentences>","confidence":<0-100>}`,
  inputSchema: BullBearInputSchema,
  outputSchema: StanceBodySchema,
  buildPrompt: (i) => `${i.symbol} @ $${i.snapshot.price} Sage: ${i.news.headline} Vector: ${i.market.headline}`,
  fallback: (i) => ({
    stance: "bearish",
    headline: `${i.symbol}: downside risks remain`,
    body: `Bear case: ${i.symbol} faces drawdown risk; Sage notes "${i.news.headline}" and Vector notes "${i.market.headline}".`,
    confidence: 55,
  }),
};

const cioAgentConfig: StructuredAgentConfig<CIOInput, CommitteeRaw> = {
  name: "CIOAgent",
  role: "investment_committee",
  description: "North — CIO",
  systemPrompt:
    `You are North, the CIO. ${J} Return: ` +
    `{"stance":"bullish"|"bearish"|"neutral","headline":"<one sentence>","body":"<2+ sentences>","confidence":<0-100>,` +
    `"direction":"BUY"|"SELL"|"HOLD","catalysts":[],"risks":[],"recommendation":"<actionable>"}`,
  inputSchema: CIOInputSchema,
  outputSchema: CommitteeRawSchema,
  buildPrompt: (i) =>
    `${i.symbol} Sage: ${i.news.headline} Vector: ${i.market.headline} Atlas: ${i.bull.headline} Mara: ${i.bear.headline}`,
  fallback: (i) => {
    const stance: Stance = i.bull.headline ? "bullish" : "neutral";
    return {
      stance,
      headline: `${i.symbol}: balanced view`,
      body: `CIO synthesis of Sage ("${i.news.headline}"), Vector ("${i.market.headline}"), Atlas ("${i.bull.headline}") and Mara ("${i.bear.headline}").`,
      confidence: 62,
      direction: stance === "bullish" ? "BUY" : "HOLD",
      catalysts: [],
      risks: [],
      recommendation: `Consider a measured ${stance === "bullish" ? "long" : "neutral"} stance on ${i.symbol}; monitor for confirmation.`,
    };
  },
};

const crisisNewsAgentConfig: StructuredAgentConfig<NewsInput, StanceBody> = {
  name: "CrisisNewsAgent",
  role: "crisis_news",
  description: "Sentinel — Crisis News agent",
  systemPrompt:
    `You are Sentinel, the Crisis News agent. ${J} Return: ` +
    `{"stance":"bullish"|"bearish"|"neutral","headline":"<one sentence>","body":"<2+ sentences>","confidence":<0-100>}`,
  inputSchema: NewsInputSchema,
  outputSchema: StanceBodySchema,
  buildPrompt: (i) => (i.news.length ? i.news.map((n) => n.headline).join("\n") : `No news for ${i.symbol}.`),
  fallback: (i) => ({
    stance: i.news.length ? "bearish" : "neutral",
    headline: `${i.symbol}: crisis coverage ${i.news.length ? "flagged" : "limited"}`,
    body: `Sentinel review: ${i.news.length} crisis headline(s) supplied for ${i.symbol}.`,
    confidence: Math.min(100, 45 + i.news.length * 8),
  }),
};

const crisisMarketAgentConfig: StructuredAgentConfig<MarketInput, StanceBody> = {
  name: "CrisisMarketAgent",
  role: "crisis_market",
  description: "Radar — Crisis Market agent",
  systemPrompt:
    `You are Radar, the Crisis Market agent. ${J} Return: ` +
    `{"stance":"bullish"|"bearish"|"neutral","headline":"<one sentence>","body":"<2+ sentences>","confidence":<0-100>}`,
  inputSchema: MarketInputSchema,
  outputSchema: StanceBodySchema,
  buildPrompt: (i) => `${i.symbol} @ $${i.snapshot.price} Vol: ${i.snapshot.realizedVol30dAnnPct}% RSI: ${i.snapshot.rsi14}`,
  fallback: (i) => ({
    stance: i.snapshot.regime === "risk_off" ? "bearish" : pickStance(i.snapshot.price, i.snapshot.rsi14),
    headline: `${i.symbol}: market stress ${i.snapshot.regime}`,
    body: `Regime ${i.snapshot.regime}, realized vol ${i.snapshot.realizedVol30dAnnPct}%, RSI ${i.snapshot.rsi14}.`,
    confidence: 60,
  }),
};

const crisisRiskAgentConfig: StructuredAgentConfig<CrisisRiskInput, StanceBody> = {
  name: "CrisisRiskAgent",
  role: "crisis_risk_analyst",
  description: "Gauge — Crisis Risk Analyst",
  systemPrompt:
    `You are Gauge, the Crisis Risk Analyst. ${J} Return: ` +
    `{"stance":"bullish"|"bearish"|"neutral","headline":"<one sentence>","body":"<2+ sentences>","confidence":<0-100>}`,
  inputSchema: CrisisRiskInputSchema,
  outputSchema: StanceBodySchema,
  buildPrompt: (i) => `${i.symbol} Radar: ${i.market.headline}`,
  fallback: (i) => ({
    stance: "bearish",
    headline: `${i.symbol}: elevated risk profile`,
    body: `Risk assessment for ${i.symbol} based on Radar ("${i.market.headline}").`,
    confidence: 58,
  }),
};

const crisisOptionsAgentConfig: StructuredAgentConfig<MarketInput, StanceBody> = {
  name: "CrisisOptionsAgent",
  role: "crisis_options",
  description: "Hedge — Crisis Options agent",
  systemPrompt:
    `You are Hedge, the Crisis Options agent. ${J} Return: ` +
    `{"stance":"bullish"|"bearish"|"neutral","headline":"<one sentence>","body":"<2+ sentences>","confidence":<0-100>}`,
  inputSchema: MarketInputSchema,
  outputSchema: StanceBodySchema,
  buildPrompt: (i) => `${i.symbol} Vol: ${i.snapshot.realizedVol30dAnnPct}%`,
  fallback: (i) => ({
    stance: pickStance(i.snapshot.price, i.snapshot.rsi14),
    headline: `${i.symbol}: options signal`,
    body: `Vol-derived read on ${i.symbol} using realized vol ${i.snapshot.realizedVol30dAnnPct}%.`,
    confidence: 55,
  }),
};

const crisisCommitteeAgentConfig: StructuredAgentConfig<CrisisCommitteeInput, CommitteeRaw> = {
  name: "CrisisCommitteeAgent",
  role: "crisis_committee",
  description: "Apex — Crisis Committee chair",
  systemPrompt:
    `You are Apex, the Crisis Committee chair. ${J} Return: ` +
    `{"stance":"bullish"|"bearish"|"neutral","headline":"<one sentence>","body":"<2+ sentences>","confidence":<0-100>,` +
    `"direction":"BUY"|"SELL"|"HOLD","catalysts":[],"risks":[],"recommendation":"<actionable>"}`,
  inputSchema: CrisisCommitteeInputSchema,
  outputSchema: CommitteeRawSchema,
  buildPrompt: (i) =>
    `${i.symbol} Sentinel: ${i.news.headline} Radar: ${i.market.headline} Gauge: ${i.risk.headline} Hedge: ${i.options.headline}`,
  fallback: (i) => {
    const stance: Stance = "bearish";
    return {
      stance,
      headline: `${i.symbol}: crisis committee stand`,
      body: `Crisis synthesis of Sentinel ("${i.news.headline}"), Radar ("${i.market.headline}"), Gauge ("${i.risk.headline}") and Hedge ("${i.options.headline}").`,
      confidence: 64,
      direction: "HOLD",
      catalysts: [],
      risks: ["unmodeled tail risk", "worsening liquidity"],
      recommendation: `Monitor ${i.symbol} and avoid adding risk until conditions stabilize.`,
    };
  },
};

const newsAgent = new StructuredAgent(newsAgentConfig);
const marketAgent = new StructuredAgent(marketAgentConfig);
const bullAgent = new StructuredAgent(bullAgentConfig);
const bearAgent = new StructuredAgent(bearAgentConfig);
const cioAgent = new StructuredAgent(cioAgentConfig);
const crisisNewsAgent = new StructuredAgent(crisisNewsAgentConfig);
const crisisMarketAgent = new StructuredAgent(crisisMarketAgentConfig);
const crisisRiskAgent = new StructuredAgent(crisisRiskAgentConfig);
const crisisOptionsAgent = new StructuredAgent(crisisOptionsAgentConfig);
const crisisCommitteeAgent = new StructuredAgent(crisisCommitteeAgentConfig);

export async function runNewsAgent(s: string, news: NewsItem[]): Promise<AgentMessage> {
  const r = await newsAgent.run({ symbol: s, news });
  return stanceMessage("news", r);
}

export async function runMarketResearchAgent(s: string, snap: MarketSnapshot): Promise<AgentMessage> {
  const r = await marketAgent.run({ symbol: s, snapshot: snap });
  return stanceMessage("market_research", r);
}

export async function runBullAgent(
  s: string,
  snap: MarketSnapshot,
  nM: AgentMessage,
  mM: AgentMessage,
): Promise<AgentMessage> {
  const r = await bullAgent.run({ symbol: s, snapshot: snap, news: nM, market: mM });
  return stanceMessage("bull", { ...r, stance: "bullish" });
}

export async function runBearAgent(
  s: string,
  snap: MarketSnapshot,
  nM: AgentMessage,
  mM: AgentMessage,
): Promise<AgentMessage> {
  const r = await bearAgent.run({ symbol: s, snapshot: snap, news: nM, market: mM });
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
  const raw = await cioAgent.run({ symbol: s, snapshot: snap, news: nM, market: mM, bull: bM, bear: beM });
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
  const r = await crisisNewsAgent.run({ symbol: s, news });
  return stanceMessage("crisis_news", r);
}

export async function runCrisisMarketAgent(s: string, snap: MarketSnapshot): Promise<AgentMessage> {
  const r = await crisisMarketAgent.run({ symbol: s, snapshot: snap });
  return stanceMessage("crisis_market", r);
}

export async function runCrisisRiskAgent(s: string, snap: MarketSnapshot, mM: AgentMessage): Promise<AgentMessage> {
  const r = await crisisRiskAgent.run({ symbol: s, snapshot: snap, market: mM });
  return stanceMessage("crisis_risk_analyst", r);
}

export async function runCrisisOptionsAgent(s: string, snap: MarketSnapshot): Promise<AgentMessage> {
  const r = await crisisOptionsAgent.run({ symbol: s, snapshot: snap });
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
  const raw = await crisisCommitteeAgent.run({
    symbol: s,
    snapshot: snap,
    news: nM,
    market: mM,
    risk: rM,
    options: oM,
  });
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
