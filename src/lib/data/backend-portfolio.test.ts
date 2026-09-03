import { describe, expect, it } from "vitest";

import { mapPortfolioToContext, mapRecentTrades } from "./backend-portfolio";

const snapshot = {
  equity: 100_000,
  cash: 25_000,
  positions: [
    { symbol: "NVDA", sector: "Technology", quantity: 100, market_value: 50_000 },
    { symbol: "JPM", sector: "Financials", quantity: 50, market_value: 25_000 },
  ],
  sector_exposure: { Technology: 0.5, Financials: 0.25 },
};

const orders = [
  {
    symbol: "NVDA",
    side: "buy",
    quantity: 10,
    filled_quantity: 10,
    status: "FILLED",
    submitted_at: "2026-08-30T15:00:00Z",
    filled_at: "2026-08-30T15:00:01Z",
  },
  {
    symbol: "AAPL",
    side: "sell",
    quantity: 5,
    filled_quantity: 5,
    status: "FILLED",
    submitted_at: "2026-08-29T15:00:00Z",
    filled_at: null,
  },
  {
    symbol: "KO",
    side: "buy",
    quantity: 7,
    filled_quantity: 0,
    status: "PENDING",
    submitted_at: "2026-08-28T15:00:00Z",
    filled_at: null,
  },
];

describe("mapPortfolioToContext", () => {
  it("maps the backend snapshot to the research PortfolioContext contract", () => {
    const context = mapPortfolioToContext(snapshot, orders);

    expect(context.totalEquity).toBe(100_000);
    expect(context.cash).toBe(25_000);
    expect(context.positions).toEqual([
      { symbol: "NVDA", qty: 100, marketValueUsd: 50_000, sector: "Technology" },
      { symbol: "JPM", qty: 50, marketValueUsd: 25_000, sector: "Financials" },
    ]);
    expect(context.sectorExposure).toEqual([
      { sector: "Technology", exposurePctOfBook: 50 },
      { sector: "Financials", exposurePctOfBook: 25 },
    ]);
    expect(context.largestPositions).toEqual(["NVDA", "JPM"]);
    expect(context.recentTrades).toEqual([
      { symbol: "NVDA", side: "BUY", qty: 10, executedAt: "2026-08-30T15:00:01Z" },
      { symbol: "AAPL", side: "SELL", qty: 5, executedAt: "2026-08-29T15:00:00Z" },
    ]);
    expect(context.portfolioObjective).toBe("balanced");
    expect(context.riskTolerance).toBe("moderate");
  });

  it("produces a valid empty context when the backend has no data", () => {
    const context = mapPortfolioToContext({ equity: 0, cash: 0, positions: [] }, []);
    expect(context.positions).toEqual([]);
    expect(context.sectorExposure).toEqual([]);
    expect(context.largestPositions).toEqual([]);
    expect(context.recentTrades).toEqual([]);
  });

  it("keeps only filled buy/sell orders in recent trades", () => {
    expect(mapRecentTrades(orders)).toHaveLength(2);
    expect(mapRecentTrades([{ side: "sideways", status: "FILLED" }])).toEqual([]);
    expect(mapRecentTrades([{ symbol: "KO", side: "buy", status: "PENDING" }])).toEqual([]);
  });
});