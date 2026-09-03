import { backendFetch } from "@/lib/backend/client";
import { PortfolioContextSchema, type PortfolioContext } from "@/lib/contracts/research";

// Maps the FastAPI portfolio endpoints (GET /portfolio, GET /orders) onto the
// research desk's PortfolioContext contract so the agents run portfolio-aware
// analysis (concentration considerations, HOLD-on-position) against the real
// book. Returns null whenever the backend is unavailable — callers then simply
// run without portfolio context.

const FETCH_TIMEOUT_MS = 5_000;

export interface BackendPosition {
  symbol?: string;
  sector?: string;
  quantity?: number;
  market_value?: number;
}

export interface BackendPortfolioSnapshot {
  equity?: number;
  cash?: number;
  positions?: BackendPosition[];
  sector_exposure?: Record<string, number>;
}

export interface BackendOrder {
  symbol?: string;
  side?: string;
  quantity?: number;
  filled_quantity?: number;
  status?: string;
  submitted_at?: string;
  filled_at?: string | null;
}

export function mapRecentTrades(
  orders: BackendOrder[],
  limit = 5,
): PortfolioContext["recentTrades"] {
  const trades: PortfolioContext["recentTrades"] = [];
  for (const order of orders) {
    if ((order.status ?? "").toUpperCase() !== "FILLED") continue;
    const side = (order.side ?? "").toUpperCase();
    if (side !== "BUY" && side !== "SELL") continue;
    const qty = order.filled_quantity ?? order.quantity ?? 0;
    const executedAt = order.filled_at ?? order.submitted_at ?? "";
    if (!order.symbol || qty <= 0 || !/^\d{4}-\d{2}-\d{2}/.test(executedAt)) continue;
    trades.push({ symbol: order.symbol.toUpperCase(), side, qty, executedAt });
    if (trades.length >= limit) break;
  }
  return trades;
}

export function mapPortfolioToContext(
  snapshot: BackendPortfolioSnapshot,
  orders: BackendOrder[] = [],
): PortfolioContext {
  const positions = (snapshot.positions ?? []).map((p) => ({
    symbol: String(p.symbol ?? "").toUpperCase(),
    qty: Number(p.quantity ?? 0),
    marketValueUsd: Number(p.market_value ?? 0),
    sector: p.sector ?? "other",
  }));

  // The backend reports sector exposure as a fraction of equity (0.07 = 7%).
  const sectorExposure = Object.entries(snapshot.sector_exposure ?? {}).map(([sector, fraction]) => ({
    sector,
    exposurePctOfBook: Math.min(100, Math.max(0, Number(fraction ?? 0) * 100)),
  }));

  const largestPositions = [...positions]
    .sort((a, b) => b.marketValueUsd - a.marketValueUsd)
    .slice(0, 3)
    .map((p) => p.symbol);

  return PortfolioContextSchema.parse({
    totalEquity: Number(snapshot.equity ?? 0),
    cash: Number(snapshot.cash ?? 0),
    positions,
    sectorExposure,
    largestPositions,
    recentTrades: mapRecentTrades(orders),
    // The backend does not model objective/risk tolerance yet; use the
    // neutral defaults the agents expect.
    portfolioObjective: "balanced",
    riskTolerance: "moderate",
  });
}

export async function fetchBackendPortfolioContext(): Promise<PortfolioContext | null> {
  try {
    const [snapshotResult, ordersResult] = await Promise.all([
      backendFetch<BackendPortfolioSnapshot>("/portfolio", { timeoutMs: FETCH_TIMEOUT_MS }),
      backendFetch<BackendOrder[]>("/orders?limit=10", { timeoutMs: FETCH_TIMEOUT_MS }),
    ]);
    if (!snapshotResult.ok || typeof snapshotResult.data !== "object" || snapshotResult.data === null) {
      return null;
    }
    const orders = ordersResult.ok && Array.isArray(ordersResult.data) ? ordersResult.data : [];
    return mapPortfolioToContext(snapshotResult.data, orders);
  } catch {
    return null;
  }
}