import { generateText, Output } from "ai";
import { hasLLM, getModel, normalizeAgentMessage, normalizeConfidence } from "./llm";
import { AgentMessageSchema, type AgentMessage, type MarketSnapshot } from "@/lib/contracts/research";

const SYSTEM = `You are the Market Research Agent on an autonomous AI trading desk.
You interpret quantitative market conditions: price action, momentum, trend, volatility and market regime.
You provide qualitative interpretation of measurable data, not trade recommendations.
Respond ONLY with the structured output requested.`;

function buildPrompt(symbol: string, s: MarketSnapshot): string {
  return `Symbol: ${symbol}
Price: $${s.price}
1-day change: ${s.change1dPct}% | 5-day: ${s.change5dPct}% | 1-month: ${s.change1mPct}%
RSI(14): ${s.rsi14}
Price vs SMA20: $${s.sma20} | SMA50: $${s.sma50}
Realized vol (30d annualized): ${s.realizedVol30dAnnPct}%
Sector: ${s.sector} | Market regime: ${s.regime}

Interpret these conditions for the desk.`;
}

function mockAnalysis(symbol: string, s: MarketSnapshot): AgentMessage {
  const aboveSma20 = s.price > s.sma20;
  const aboveSma50 = s.price > s.sma50;
  return {
    role: "market",
    stance: aboveSma20 && aboveSma50 ? "bullish" : !aboveSma20 && !aboveSma50 ? "bearish" : "neutral",
    headline: `${symbol} trading ${aboveSma20 ? "above" : "below"} key moving averages in a ${
      s.regime.replace("_", "-")
    } tape`,
    body: `Price of $${s.price} sits ${
      aboveSma20 ? "above" : "below"
    } the 20-day average ($${s.sma20}) and ${
      aboveSma50 ? "above" : "below"
    } the 50-day ($${s.sma50}). RSI at ${s.rsi14} indicates ${
      s.rsi14 > 70 ? "overbought" : s.rsi14 < 30 ? "oversold" : "balanced"
    } conditions. Realized volatility of ${s.realizedVol30dAnnPct}% is ${
      s.realizedVol30dAnnPct > 40 ? "elevated" : "contained"
    }, which matters for options pricing.`,
    confidence: 72,
    keyPoints: [
      `Trend: ${aboveSma20 && aboveSma50 ? "uptrend intact" : aboveSma20 ? "mixed" : "downtrend"}`,
      `RSI(14) ${s.rsi14} — ${
        s.rsi14 > 70 ? "stretched" : s.rsi14 < 30 ? "washed out" : "neutral zone"
      }`,
      `${s.sector} sector, regime reads ${s.regime.replace("_", "-")}`,
    ],
  };
}

export async function runMarketAgent(
  symbol: string,
  snapshot: MarketSnapshot,
): Promise<AgentMessage> {
  if (!hasLLM()) {
    return mockAnalysis(symbol, snapshot);
  }
  const { output } = await generateText({
    model: getModel(),
    system: SYSTEM,
    prompt: buildPrompt(symbol, snapshot),
    output: Output.object({ schema: AgentMessageSchema }),
  });
  return normalizeAgentMessage({ ...output, role: "market", confidence: normalizeConfidence(output.confidence) });
}
