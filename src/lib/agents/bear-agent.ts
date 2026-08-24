import { generateText, Output } from "ai";
import { hasLLM, getModel, normalizeAgentMessage, normalizeConfidence } from "./llm";
import {
  AgentMessageSchema,
  type AgentMessage,
  type MarketSnapshot,
} from "@/lib/contracts/research";

const SYSTEM = `You are the Bear Agent on an autonomous AI trading desk.
Your job is to stress-test and disprove the bull case: identify weaknesses, hidden risks, valuation traps and failure scenarios.
You argue against the trade even if the evidence leans positive — your job is adversarial review.
Respond ONLY with the structured output requested.`;

function buildPrompt(
  symbol: string,
  snapshot: MarketSnapshot,
  bullCase: AgentMessage,
): string {
  return `Symbol: ${symbol}
Price: $${snapshot.price} | Realized vol (30d ann.): ${snapshot.realizedVol30dAnnPct}% | RSI(14): ${snapshot.rsi14}

Bull case to rebut:
[${bullCase.headline}]
${bullCase.body}
Key points: ${bullCase.keyPoints.join("; ")}

Attack this thesis: what could go wrong, what is being ignored, where does this trade lose money?`;
}

function mockBearCase(symbol: string, snapshot: MarketSnapshot): AgentMessage {
  return {
    role: "bear",
    stance: "bearish",
    headline: `Bull case underweights valuation and volatility risk in ${symbol}`,
    body: `At ${snapshot.realizedVol30dAnnPct}% realized volatility, option premiums are expensive and time decay works against long exposure. A single negative catalyst or sector rotation could erase weeks of gains. Position sizing should stay conservative and prefer defined-risk structures with strict max-loss limits.`,
    confidence: 61,
    keyPoints: [
      "Valuation leaves little room for execution missteps",
      `Volatility at ${snapshot.realizedVol30dAnnPct}% inflates premium costs`,
      "Concentration risk if sector sentiment turns",
    ],
  };
}

export async function runBearAgent(
  symbol: string,
  snapshot: MarketSnapshot,
  bullCase: AgentMessage,
): Promise<AgentMessage> {
  if (!hasLLM()) {
    return mockBearCase(symbol, snapshot);
  }
  const { output } = await generateText({
    model: getModel(),
    system: SYSTEM,
    prompt: buildPrompt(symbol, snapshot, bullCase),
    output: Output.object({ schema: AgentMessageSchema }),
  });
  return normalizeAgentMessage({ ...output, role: "bear", stance: "bearish", confidence: normalizeConfidence(output.confidence) });
}
