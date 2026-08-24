import { generateText, Output } from "ai";
import { hasLLM, getModel, normalizeAgentMessage, normalizeConfidence } from "./llm";
import {
  AgentMessageSchema,
  type AgentMessage,
  type MarketSnapshot,
} from "@/lib/contracts/research";

const SYSTEM = `You are the Bull Agent on an autonomous AI trading desk.
Your job is to build the STRONGEST evidence-based case FOR a bullish position on the given symbol.
Use the market data and colleague reports provided. Be persuasive but honest about confidence levels.
Respond ONLY with the structured output requested.`;

function buildPrompt(
  symbol: string,
  snapshot: MarketSnapshot,
  colleagueReports: AgentMessage[],
): string {
  const reports = colleagueReports
    .map((m) => `[${m.role}] ${m.headline}\n${m.body}\nKey points: ${m.keyPoints.join("; ")}`)
    .join("\n\n");
  return `Symbol: ${symbol}
Price: $${snapshot.price} | 1-month change: ${snapshot.change1mPct}% | RSI(14): ${snapshot.rsi14}
Regime: ${snapshot.regime}

Colleague reports:
${reports}

Build the strongest bull case for ${symbol}.`;
}

function mockBullCase(symbol: string, snapshot: MarketSnapshot): AgentMessage {
  return {
    role: "bull",
    stance: "bullish",
    headline: `${symbol} offers attractive risk/reward for upside participation`,
    body: `The combination of positive news flow and ${
      snapshot.price > snapshot.sma20 ? "constructive" : "stabilizing"
    } price action supports a bullish thesis. Defined-risk options structures (bull call spreads) let the desk express this view while capping downside — well suited at realized volatility of ${snapshot.realizedVol30dAnnPct}%.`,
    confidence: 74,
    keyPoints: [
      "Earnings momentum and demand catalysts remain intact",
      `Trend structure ${snapshot.price > snapshot.sma20 ? "confirms" : "is early in confirming"} the move`,
      "Defined-risk spread limits capital at risk",
    ],
  };
}

export async function runBullAgent(
  symbol: string,
  snapshot: MarketSnapshot,
  colleagueReports: AgentMessage[],
): Promise<AgentMessage> {
  if (!hasLLM()) {
    return mockBullCase(symbol, snapshot);
  }
  const { output } = await generateText({
    model: getModel(),
    system: SYSTEM,
    prompt: buildPrompt(symbol, snapshot, colleagueReports),
    output: Output.object({ schema: AgentMessageSchema }),
  });
  return normalizeAgentMessage({ ...output, role: "bull", stance: "bullish", confidence: normalizeConfidence(output.confidence) });
}
