import { beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import type { NextRequest } from "next/server";
import type { MarketSnapshot } from "@/lib/contracts/research";
import type { AgentMessage, AgentRoleName, CIOSynthesis } from "@/lib/agents/agents";

vi.mock("@/lib/agents/market-data", () => ({
  fetchMarketData: vi.fn(),
}));

vi.mock("@/lib/agents/agents", () => ({
  runNewsAgent: vi.fn(),
  runMarketResearchAgent: vi.fn(),
  runBullAgent: vi.fn(),
  runBearAgent: vi.fn(),
  runCIOAgent: vi.fn(),
  runCrisisNewsAgent: vi.fn(),
  runCrisisMarketAgent: vi.fn(),
  runCrisisRiskAgent: vi.fn(),
  runCrisisOptionsAgent: vi.fn(),
  runCrisisCommitteeAgent: vi.fn(),
}));

import { fetchMarketData } from "@/lib/agents/market-data";
import {
  runNewsAgent,
  runMarketResearchAgent,
  runBullAgent,
  runBearAgent,
  runCIOAgent,
  runCrisisNewsAgent,
  runCrisisMarketAgent,
  runCrisisRiskAgent,
  runCrisisOptionsAgent,
  runCrisisCommitteeAgent,
} from "@/lib/agents/agents";
import { POST } from "./route";

const mockedFetchMarketData = vi.mocked(fetchMarketData);

const snapshot: MarketSnapshot = {
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
  regime: "risk_on",
  latestVolume: 1_000_000,
  averageVolume30d: 900_000,
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

function message(role: AgentRoleName): AgentMessage {
  return {
    role,
    stance: "bullish",
    headline: `${role} headline`,
    body: `${role} body`,
    confidence: 70,
  };
}

const CIO: { message: AgentMessage; thesis: CIOSynthesis } = {
  message: message("investment_committee"),
  thesis: {
    symbol: "NVDA",
    direction: "BUY",
    confidence: 70,
    summary: "CIO summary",
    catalysts: ["data center demand"],
    risks: ["valuation"],
    recommendation: "Buy NVDA",
  },
};

beforeAll(() => {
  process.env.OPENAI_API_KEY = "";
});

beforeEach(() => {
  mockedFetchMarketData
    .mockReset()
    .mockResolvedValue({ snapshot, news } as Awaited<ReturnType<typeof fetchMarketData>>);
  vi.mocked(runNewsAgent).mockReset().mockResolvedValue(message("news"));
  vi.mocked(runMarketResearchAgent).mockReset().mockResolvedValue(message("market_research"));
  vi.mocked(runBullAgent).mockReset().mockResolvedValue(message("bull"));
  vi.mocked(runBearAgent).mockReset().mockResolvedValue(message("bear"));
  vi.mocked(runCIOAgent).mockReset().mockResolvedValue(CIO);
  vi.mocked(runCrisisNewsAgent).mockReset().mockResolvedValue(message("crisis_news"));
  vi.mocked(runCrisisMarketAgent).mockReset().mockResolvedValue(message("crisis_market"));
  vi.mocked(runCrisisRiskAgent).mockReset().mockResolvedValue(message("crisis_risk_analyst"));
  vi.mocked(runCrisisOptionsAgent).mockReset().mockResolvedValue(message("crisis_options"));
  vi.mocked(runCrisisCommitteeAgent).mockReset().mockResolvedValue({
    message: message("crisis_committee"),
    thesis: { ...CIO.thesis, symbol: "NVDA" },
  });
});

async function readEvents(res: Response): Promise<Record<string, unknown>[]> {
  expect(res.status).toBe(200);
  const text = await res.text();
  return text
    .trim()
    .split("\n")
    .map((line) => JSON.parse(line) as Record<string, unknown>);
}

function post(body: unknown): Promise<Response> {
  return POST(
    new Request("http://localhost/api/research", {
      method: "POST",
      body: JSON.stringify(body),
      headers: { "Content-Type": "application/json" },
    }) as unknown as NextRequest,
  );
}

describe("POST /api/research", () => {
  it("streams agent messages and a thesis for a bull desk run", async () => {
    const events = await readEvents(await post({ symbol: "NVDA" }));

    expect(events[0]).toMatchObject({ type: "status", step: "Fetching market data" });
    expect(events.some((e) => e.type === "agent_message")).toBe(true);
    expect(events.find((e) => e.type === "thesis")).toMatchObject({ thesis: { symbol: "NVDA" } });
    expect(events.at(-1)).toEqual({ type: "done" });
  });

  it("runs the crisis committee when crisis is enabled", async () => {
    const events = await readEvents(await post({ symbol: "NVDA", crisis: true }));

    expect(vi.mocked(runCrisisNewsAgent)).toHaveBeenCalled();
    expect(vi.mocked(runCrisisCommitteeAgent)).toHaveBeenCalled();
    expect(events.find((e) => e.type === "thesis")).toBeDefined();
  });

  it("rejects an invalid symbol with 400", async () => {
    const res = await post({ symbol: " " });
    expect(res.status).toBe(400);
  });
});
