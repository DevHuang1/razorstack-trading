import { generateText, Output } from "ai";
import { hasLLM, getModel, normalizeConfidence, normalizeText } from "./llm";
import { marketDataProvider } from "@/lib/data/market-data";
import { runNewsAgent } from "./news-agent";
import { runMarketAgent } from "./market-agent";
import { runBullAgent } from "./bull-agent";
import { runBearAgent } from "./bear-agent";
import {
  AIThesisSchema,
  type AIThesis,
  type AgentMessage,
  type MarketSnapshot,
  type OptionsStructure,
  type OptionInstrument,
  type EntryExitReasoning,
  type TradeProposal,
  type PipelineEvent,
} from "@/lib/contracts/research";

const CIO_SYSTEM = `You are the Chief Investment Officer (CIO) of an autonomous AI trading desk.
You synthesize the debate between your research agents into a single actionable investment thesis.
Rules you must follow:
- The desk trades OPTIONS on Alpaca paper trading. Your suggested strategy MUST be one of the allowed option structures.
- If conviction is low or risk/reward is poor, recommend "no_trade".
- estimatedMaxRiskUsd must be a realistic defined-risk number for a $100k portfolio (typically 500-4000).
- Be decisive: state direction, confidence and a clear recommendation.
Respond ONLY with the structured output requested.`;

function buildCioPrompt(
  symbol: string,
  snapshot: MarketSnapshot,
  messages: AgentMessage[],
): string {
  const debate = messages
    .map(
      (m) =>
        `[${m.role.toUpperCase()}] (${m.stance}, confidence ${m.confidence ?? "n/a"})\n${m.headline}\n${m.body}\n- ${m.keyPoints.join("\n- ")}`,
    )
    .join("\n\n");
  return `Symbol: ${symbol}
Price: $${snapshot.price} | Sector: ${snapshot.sector} | Regime: ${snapshot.regime}

Agent debate:
${debate}

Synthesize the final thesis.`;
}

function majorityStance(messages: AgentMessage[]): "bullish" | "bearish" | "neutral" {
  const score = messages.reduce((acc, m) => {
    if (m.stance === "bullish") return acc + (m.confidence ?? 50);
    if (m.stance === "bearish") return acc - (m.confidence ?? 50);
    return acc;
  }, 0);
  if (score > 40) return "bullish";
  if (score < -40) return "bearish";
  return "neutral";
}

function mockThesis(symbol: string, snapshot: MarketSnapshot, messages: AgentMessage[]): AIThesis {
  const stance = majorityStance(messages);
  const avgConfidence = Math.round(
    messages.reduce((acc, m) => acc + (m.confidence ?? 60), 0) / Math.max(messages.length, 1),
  );
  const direction =
    stance === "neutral" ? "NEUTRAL" : stance === "bullish" ? "BULLISH" : "BEARISH";
  const structure: OptionsStructure =
    stance === "bullish"
      ? "bull_call_spread"
      : stance === "bearish"
        ? "bear_put_spread"
        : "no_trade";

  return {
    symbol: symbol.toUpperCase(),
    generatedAt: new Date().toISOString(),
    direction,
    confidence: avgConfidence,
    summary: `Desk consensus on ${symbol.toUpperCase()} is ${direction.toLowerCase()} with moderate-to-high conviction after full agent debate.`,
    catalysts: [
      ...messages.filter((m) => m.role === "news").flatMap((m) => m.keyPoints.slice(0, 2)),
      ...(stance === "bullish" ? ["Momentum and trend alignment support upside"] : []),
    ],
    risks: [
      ...messages.filter((m) => m.role === "bear").flatMap((m) => m.keyPoints.slice(0, 2)),
      `Volatility at ${snapshot.realizedVol30dAnnPct}% raises premium costs`,
    ],
    recommendation:
      structure === "no_trade"
        ? "Stand aside — wait for clearer setup before deploying capital."
        : `Consider ${structure.replace(/_/g, " ")} to express ${
            stance === "bullish" ? "bullish" : "bearish"
          } exposure with defined risk.`,
    suggestedStrategy: {
      structure,
      rationale:
        structure === "no_trade"
          ? "Mixed signals across agents; capital preservation preferred."
          : "Defined-risk structure caps maximum loss while preserving upside participation.",
      estimatedMaxRiskUsd: structure === "no_trade" ? 0 : 750 + (avgConfidence % 3) * 250,
    },
  };
}

function nextExpiry(daysOut: number): string {
  const d = new Date();
  d.setDate(d.getDate() + daysOut);
  return d.toISOString().split("T")[0];
}

function roundStrike(price: number): number {
  if (price < 10) return Math.round(price * 10) / 10;
  if (price < 100) return Math.round(price);
  return Math.round(price / 5) * 5;
}

function deriveInstrument(
  snapshot: MarketSnapshot,
  structure: OptionsStructure,
  direction: AIThesis["direction"],
): OptionInstrument {
  const expiry = nextExpiry(30);
  let type: "call" | "put";
  let strike: number;

  if (structure === "bull_call_spread") {
    type = "call";
    strike = roundStrike(snapshot.price * 1.02);
  } else if (structure === "bear_put_spread") {
    type = "put";
    strike = roundStrike(snapshot.price * 0.98);
  } else if (structure === "long_call") {
    type = "call";
    strike = roundStrike(snapshot.price * 1.01);
  } else if (structure === "long_put") {
    type = "put";
    strike = roundStrike(snapshot.price * 0.99);
  } else if (structure === "protective_put") {
    type = "put";
    strike = roundStrike(snapshot.price * 0.95);
  } else if (structure === "cash_secured_put") {
    type = "put";
    strike = roundStrike(snapshot.price * 0.95);
  } else {
    type = direction === "BULLISH" ? "call" : "put";
    strike = roundStrike(snapshot.price);
  }

  const vol = snapshot.realizedVol30dAnnPct / 100;
  const timeValue = vol * snapshot.price * Math.sqrt(30 / 365);
  const intrinsic =
    type === "call"
      ? Math.max(0, snapshot.price - strike)
      : Math.max(0, strike - snapshot.price);
  const midPrice = Number(Math.max(0.1, intrinsic + timeValue * 0.6).toFixed(2));
  const halfSpread = Number((midPrice * 0.05).toFixed(2));
  const bid = Number(Math.max(0.01, midPrice - halfSpread).toFixed(2));
  const ask = Number((midPrice + halfSpread).toFixed(2));

  return {
    type,
    strike,
    expiry,
    midPrice,
    bid,
    ask,
    delta: type === "call" ? 0.42 : -0.42,
    theta: Number((-midPrice * 0.03).toFixed(2)),
    gamma: Number((0.015 / (vol * 0.8)).toFixed(4)),
    impliedVolPct: Number((snapshot.realizedVol30dAnnPct + 2).toFixed(1)),
  };
}

function deriveEntryExit(snapshot: MarketSnapshot, thesis: AIThesis): EntryExitReasoning {
  const support = snapshot.sma20;

  let entryCondition: string;
  let entryLimitPrice: number | undefined;

  if (thesis.direction === "BULLISH") {
    entryCondition = `Pullback to 20-day MA ($${support.toFixed(2)}) with RSI ${snapshot.rsi14} confirming support`;
    entryLimitPrice = Number((support * 1.005).toFixed(2));
  } else if (thesis.direction === "BEARISH") {
    entryCondition = `Break below 20-day MA ($${support.toFixed(2)}) with RSI ${snapshot.rsi14} confirming distribution`;
    entryLimitPrice = Number((support * 0.995).toFixed(2));
  } else {
    entryCondition = "No trade — insufficient conviction";
  }

  return {
    entryCondition,
    entryLimitPrice,
    profitTargetPct: thesis.direction === "NEUTRAL" ? undefined : 50,
    stopLossPct: thesis.direction === "NEUTRAL" ? undefined : 30,
    timeExit: "Close 30-DTE position by day 15 to minimize theta decay",
    rationale: `Strategy ${thesis.suggestedStrategy.structure.replace(/_/g, " ")} expresses ${thesis.direction.toLowerCase()} view with defined risk. Entry aligns with 20-day MA support/resistance. Time exit prevents excessive theta erosion in final 2 weeks.`,
  };
}

function buildTradeProposal(symbol: string, thesis: AIThesis, snapshot: MarketSnapshot): TradeProposal {
  const structure = thesis.suggestedStrategy.structure;
  const instrument =
    structure === "no_trade"
      ? deriveInstrument(snapshot, structure, "NEUTRAL")
      : deriveInstrument(snapshot, structure, thesis.direction);
  const entryExit = deriveEntryExit(snapshot, thesis);
  const maxRisk = thesis.suggestedStrategy.estimatedMaxRiskUsd;
  const maxReward = structure === "no_trade" ? 0 : Number((maxRisk * 1.5).toFixed(2));

  return {
    symbol: symbol.toUpperCase(),
    direction: thesis.direction,
    confidence: thesis.confidence,
    strategy: structure,
    instrument,
    contracts: structure === "no_trade" ? 0 : 2,
    entryExit,
    estimatedMaxRiskUsd: maxRisk,
    estimatedMaxRewardUsd: maxReward,
    summary: thesis.summary,
    generatedAt: new Date().toISOString(),
  };
}

export async function* runResearchPipeline(symbolInput: string): AsyncGenerator<PipelineEvent> {
  const symbol = symbolInput.trim().toUpperCase();
  try {
    yield { type: "status", step: "context", detail: `Fetching market data for ${symbol}` };
    const snapshot = await marketDataProvider.getMarketSnapshot(symbol);
    const news = await marketDataProvider.getRecentNews(symbol, 6);
    yield { type: "context", snapshot, newsCount: news.length };

    yield { type: "status", step: "news", detail: "News Agent analyzing headlines" };
    const newsMsg = await runNewsAgent(symbol, snapshot, news);
    yield { type: "agent_message", message: newsMsg };

    yield { type: "status", step: "market", detail: "Market Research Agent interpreting data" };
    const marketMsg = await runMarketAgent(symbol, snapshot);
    yield { type: "agent_message", message: marketMsg };

    yield { type: "status", step: "bull", detail: "Bull Agent building the case for" };
    const bullMsg = await runBullAgent(symbol, snapshot, [newsMsg, marketMsg]);
    yield { type: "agent_message", message: bullMsg };

    yield { type: "status", step: "bear", detail: "Bear Agent stress-testing the thesis" };
    const bearMsg = await runBearAgent(symbol, snapshot, bullMsg);
    yield { type: "agent_message", message: bearMsg };

    yield { type: "status", step: "cio", detail: "CIO synthesizing final thesis" };
    const messages = [newsMsg, marketMsg, bullMsg, bearMsg];
    let thesis: AIThesis;
    if (!hasLLM()) {
      thesis = mockThesis(symbol, snapshot, messages);
    } else {
      const { output } = await generateText({
        model: getModel(),
        system: CIO_SYSTEM,
        prompt: buildCioPrompt(symbol, snapshot, messages),
        output: Output.object({ schema: AIThesisSchema }),
      });
      thesis = {
        ...output,
        symbol: symbol.toUpperCase(),
        generatedAt: new Date().toISOString(),
        confidence: normalizeConfidence(output.confidence) ?? 50,
        summary: normalizeText(output.summary),
        catalysts: output.catalysts.map(normalizeText),
        risks: output.risks.map(normalizeText),
        recommendation: normalizeText(output.recommendation),
        suggestedStrategy: {
          ...output.suggestedStrategy,
          rationale: normalizeText(output.suggestedStrategy.rationale),
        },
      };
    }
    yield { type: "thesis", thesis };

    yield { type: "status", step: "proposal", detail: "CIO deriving trade proposal" };
    const proposal = buildTradeProposal(symbol, thesis, snapshot);
    yield { type: "trade_proposal", proposal };

    yield { type: "done" };
  } catch (error) {
    yield {
      type: "error",
      step: "pipeline",
      message: error instanceof Error ? error.message : "Unknown pipeline error",
    };
    yield { type: "done" };
  }
}
