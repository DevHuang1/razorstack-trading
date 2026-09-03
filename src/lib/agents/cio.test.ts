import { beforeAll, describe, expect, it } from "vitest";
import { runResearchPipeline, buildResearchInput } from "@/lib/agents/cio";
import {
  PipelineEventSchema,
  TradeProposalWireSchema,
  type AnalyzeOpportunityInput,
  type PipelineEvent,
} from "@/lib/contracts/research";

beforeAll(() => {
  process.env.OPENAI_API_KEY = "";
});

async function collectEvents(input: AnalyzeOpportunityInput): Promise<PipelineEvent[]> {
  const events: PipelineEvent[] = [];
  for await (const event of runResearchPipeline(input)) {
    events.push(event);
  }
  return events;
}

describe("runResearchPipeline (v2 DAG, mock mode)", () => {
  it("streams market analysis, news analysis, both opinions and a final proposal", async () => {
    const input = await buildResearchInput("NVDA");
    const events = await collectEvents(input);

    expect(events[0].type).toBe("status");
    expect(events.at(-1)?.type).toBe("done");
    expect(events.some((e) => e.type === "error")).toBe(false);

    expect(events.some((e) => e.type === "market_analysis")).toBe(true);
    expect(events.some((e) => e.type === "news_analysis")).toBe(true);
    const opinions = events.filter(
      (e): e is Extract<PipelineEvent, { type: "agent_opinion" }> => e.type === "agent_opinion",
    );
    expect(opinions.map((o) => o.role)).toEqual(["bull", "bear"]);
    expect(opinions[0].opinion.stance).toBe("bullish");

    const proposalIndex = events.findIndex((e) => e.type === "trade_proposal");
    const opinionIndex = events.findIndex((e) => e.type === "agent_opinion");
    expect(proposalIndex).toBeGreaterThan(opinionIndex);

    const proposal = (events[proposalIndex] as Extract<PipelineEvent, { type: "trade_proposal" }>).proposal;
    expect(TradeProposalWireSchema.parse(proposal)).toBeTruthy();
    expect(proposal.requires_risk_approval).toBe(true);
    expect(proposal.instrument).toBeNull();
    expect(proposal.confidence).toBeLessThanOrEqual(1);
    expect(events.every((e) => PipelineEventSchema.safeParse(e).success)).toBe(true);
  });

  it("is deterministic for the same provider-backed input", async () => {
    const input = await buildResearchInput("AAPL");
    const [a, b] = await Promise.all([collectEvents(input), collectEvents(input)]);
    // generated_at is the wall-clock serialization stamp; determinism here is
    // about agent output, so normalize it before comparing.
    const normalize = (events: PipelineEvent[]) =>
      events.map((event) =>
        event.type === "trade_proposal"
          ? { ...event, proposal: { ...event.proposal, generated_at: "" } }
          : event,
      );
    expect(normalize(a)).toEqual(normalize(b));
  });

  it("yields an error event instead of throwing when agents fail", async () => {
    const broken = { symbol: "", marketData: {} as never, news: [] };
    const events = await collectEvents(broken as unknown as AnalyzeOpportunityInput);
    expect(events).toHaveLength(1);
    expect(events[0].type).toBe("error");
  });
});
