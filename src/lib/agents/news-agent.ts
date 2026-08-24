import { generateText, Output } from "ai";
import { hasLLM, getModel, normalizeAgentMessage, normalizeConfidence } from "./llm";
import {
  AgentMessageSchema,
  type AgentMessage,
  type MarketSnapshot,
  type NewsItem,
} from "@/lib/contracts/research";

const SYSTEM = `You are the News Agent on an autonomous AI trading desk.
You analyze recent news for a stock: earnings, company events, macro catalysts and sentiment.
Be specific, cite what in the news drives your view, and stay factual.
Respond ONLY with the structured output requested.`;

function buildPrompt(symbol: string, snapshot: MarketSnapshot, news: NewsItem[]): string {
  const newsBlock = news
    .map(
      (n) =>
        `- [${n.publishedAt}] (${n.source}, sentiment ${n.sentiment ?? "n/a"}) ${n.headline} — ${n.summary}`,
    )
    .join("\n");
  return `Symbol: ${symbol}
Current price: $${snapshot.price} (${snapshot.change1dPct}% today, ${snapshot.change1mPct}% past month)
Sector: ${snapshot.sector}

Recent news:
${newsBlock || "(no recent news found)"}

Analyze the news flow and report sentiment, catalysts and risks.`;
}

function mockAnalysis(symbol: string, snapshot: MarketSnapshot, news: NewsItem[]): AgentMessage {
  const avgSentiment =
    news.reduce((acc, n) => acc + (n.sentiment ?? 0), 0) / Math.max(news.length, 1);
  const bullish = avgSentiment >= 0;
  return {
    role: "news",
    stance: bullish ? "bullish" : "bearish",
    headline: bullish
      ? `News flow around ${symbol} skews positive`
      : `News flow around ${symbol} raises concerns`,
    body: `Across ${news.length} recent items, aggregate sentiment is ${
      bullish ? "constructive" : "negative"
    }. Earnings-related coverage dominates, with product-cycle and partnership stories providing potential catalysts. ${
      bullish
        ? "Momentum in coverage suggests continued institutional interest."
        : "Competitive and margin-related headlines warrant caution."
    }`,
    confidence: Math.round(55 + Math.abs(avgSentiment) * 30),
    keyPoints: [
      `${news.length} relevant items analyzed`,
      `Average tagged sentiment: ${avgSentiment.toFixed(2)}`,
      bullish
        ? "Earnings beat and AI demand headlines stand out"
        : "Margin pressure and competition headlines stand out",
    ],
  };
}

export async function runNewsAgent(
  symbol: string,
  snapshot: MarketSnapshot,
  news: NewsItem[],
): Promise<AgentMessage> {
  if (!hasLLM()) {
    return mockAnalysis(symbol, snapshot, news);
  }
  const { output } = await generateText({
    model: getModel(),
    system: SYSTEM,
    prompt: buildPrompt(symbol, snapshot, news),
    output: Output.object({ schema: AgentMessageSchema }),
  });
  return normalizeAgentMessage({ ...output, role: "news", confidence: normalizeConfidence(output.confidence) });
}
