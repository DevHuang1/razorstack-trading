import { beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { TradeProposalWireSchema } from "@/lib/contracts/research";
import { marketDataProvider } from "@/lib/data/market-data";

vi.mock("@/lib/data/market-data", () => ({
  marketDataProvider: {
    getMarketSnapshot: vi.fn(),
    getRecentNews: vi.fn(),
  },
}));

import { GET, POST } from "./route";

const mockedSnapshot = vi.mocked(marketDataProvider.getMarketSnapshot);
const mockedNews = vi.mocked(marketDataProvider.getRecentNews);

const snapshot = {
  symbol: "NVDA",
  price: 334.13,
  change1dPct: -0.01,
  change5dPct: 5.64,
  change1mPct: 18.06,
  rsi14: 63.7,
  sma20: 325.15,
  sma50: 336.58,
  realizedVol30dAnnPct: 18.6,
  sector: "Technology",
  regime: "risk_on" as const,
};

const news = [
  {
    id: "n1",
    headline: "NVDA beats quarterly earnings and raises data-center guidance",
    summary: "Results exceeded consensus expectations.",
    source: "Reuters",
    publishedAt: "2026-08-21",
    sentiment: 0.7,
  },
];

beforeAll(() => {
  process.env.OPENAI_API_KEY = "";
});

beforeEach(() => {
  mockedSnapshot.mockReset().mockResolvedValue(snapshot);
  mockedNews.mockReset().mockResolvedValue(news);
});

async function readEvents(res: Response): Promise<Record<string, unknown>[]> {
  expect(res.status).toBe(200);
  const text = await res.text();
  return text
    .trim()
    .split("\n")
    .map((line) => JSON.parse(line) as Record<string, unknown>);
}

describe("GET /api/research", () => {
  it("streams the full v2 event DAG ending in a wire-format proposal", async () => {
    const res = await GET(new Request("http://localhost/api/research?symbol=nvda"));
    const events = await readEvents(res);

    expect(events[0]).toMatchObject({ type: "status", step: "market_research" });
    expect(events.at(-1)).toEqual({ type: "done" });
    expect(events.some((e) => e.type === "error")).toBe(false);

    const proposalEvent = events.find((e) => e.type === "trade_proposal") as {
      proposal: unknown;
    };
    const wire = TradeProposalWireSchema.parse(proposalEvent.proposal);
    expect(wire.symbol).toBe("NVDA");
    expect(wire.requires_risk_approval).toBe(true);
    expect(wire.confidence).toBeLessThanOrEqual(1);
  });

  it("rejects malformed symbols with 400", async () => {
    const res = await GET(new Request("http://localhost/api/research?symbol=TOOLONGTICKER"));
    expect(res.status).toBe(400);
  });

  it("returns 404 when the provider has no data", async () => {
    mockedSnapshot.mockRejectedValue(new Error("no data"));
    const res = await GET(new Request("http://localhost/api/research?symbol=NVDA"));
    expect(res.status).toBe(404);
  });
});

describe("POST /api/research", () => {
  it("accepts a symbol-only body", async () => {
    const res = await POST(
      new Request("http://localhost/api/research", {
        method: "POST",
        body: JSON.stringify({ symbol: "NVDA" }),
        headers: { "Content-Type": "application/json" },
      }),
    );
    const events = await readEvents(res);
    expect(events.some((e) => e.type === "trade_proposal")).toBe(true);
  });

  it("accepts a full input document without touching the provider", async () => {
    const res = await POST(
      new Request("http://localhost/api/research", {
        method: "POST",
        body: JSON.stringify({ symbol: "AAPL", marketData: { ...snapshot, symbol: "AAPL" }, news }),
        headers: { "Content-Type": "application/json" },
      }),
    );
    const events = await readEvents(res);
    const proposal = (events.find((e) => e.type === "trade_proposal") as { proposal: { symbol: string } })
      .proposal;
    expect(proposal.symbol).toBe("AAPL");
    expect(mockedSnapshot).not.toHaveBeenCalled();
  });

  it("rejects an invalid input document with 400", async () => {
    const res = await POST(
      new Request("http://localhost/api/research", {
        method: "POST",
        body: JSON.stringify({ marketData: "junk" }),
        headers: { "Content-Type": "application/json" },
      }),
    );
    expect(res.status).toBe(400);
  });
});
