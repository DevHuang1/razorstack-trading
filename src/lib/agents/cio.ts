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
