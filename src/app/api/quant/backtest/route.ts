import type { NextRequest } from "next/server";
import type { Bar, StrategyId } from "@/lib/quant/types";
import { getBars } from "@/lib/quant/datafeed";
import { backtestStrategy, walkForwardBacktest } from "@/lib/quant/performance";
import { listStrategies } from "@/lib/quant/strategies";

export const dynamic = "force-dynamic";

const VALID_STRATEGIES = new Set<string>(listStrategies().map((s) => s.id));

function parseStrategy(raw: string | null): StrategyId | null {
  const id = raw?.toUpperCase() ?? "";
  return VALID_STRATEGIES.has(id) ? (id as StrategyId) : null;
}

function coerceBars(raw: unknown): Bar[] | null {
  if (!Array.isArray(raw) || raw.length === 0) return null;
  const bars = raw
    .filter(
      (b) =>
        b &&
        typeof (b as Record<string, unknown>).t === "string" &&
        typeof (b as Record<string, unknown>).c === "number" &&
        typeof (b as Record<string, unknown>).o === "number" &&
        typeof (b as Record<string, unknown>).h === "number" &&
        typeof (b as Record<string, unknown>).l === "number" &&
        typeof (b as Record<string, unknown>).v === "number",
    )
    .map((b) => {
      const r = b as Record<string, unknown>;
      return {
        t: r.t as string,
        o: r.o as number,
        h: r.h as number,
        l: r.l as number,
        c: r.c as number,
        v: r.v as number,
      };
    })
    .sort((a, b) => a.t.localeCompare(b.t));
  return bars;
}

interface BacktestBody {
  strategy?: string;
  symbol?: string;
  bars?: unknown;
  horizonDays?: number;
  walkForward?: boolean;
  trainWindow?: number;
}

export async function POST(request: NextRequest) {
  let body: BacktestBody;
  try {
    body = (await request.json()) as BacktestBody;
  } catch {
    return Response.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const strategy = parseStrategy(body.strategy ?? null);
  if (!strategy) {
    return Response.json(
      { error: "strategy must be one of " + [...VALID_STRATEGIES].join(", ") },
      { status: 400 },
    );
  }

  let bars: Bar[] | null = coerceBars(body.bars);
  if (bars && bars.length < 120) bars = null;
  if (!bars && body.symbol) {
    const result = await getBars(body.symbol.toUpperCase(), "1Day", 750);
    bars = result.bars;
  }
  if (!bars || bars.length < 120) {
    return Response.json(
      { error: "bars must contain at least 120 OHLCV records (or provide a symbol)" },
      { status: 400 },
    );
  }

  const horizonDays = body.horizonDays ?? 5;
  if (body.walkForward) {
    const result = walkForwardBacktest(strategy, bars, {
      horizonDays,
      trainWindow: body.trainWindow,
    });
    if (!result) {
      return Response.json({ error: "not enough bars for walk-forward backtest" }, { status: 400 });
    }
    return Response.json(result);
  }

  const result = backtestStrategy(strategy, bars, { horizonDays });
  if (!result) {
    return Response.json({ error: "not enough bars to backtest strategy" }, { status: 400 });
  }
  return Response.json(result);
}
