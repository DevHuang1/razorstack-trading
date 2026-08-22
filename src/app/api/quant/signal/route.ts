import type { NextRequest } from "next/server";
import type { SignalResponse } from "@/lib/quant/types";
import { getBars } from "@/lib/quant/datafeed";
import { computeQuantSignal } from "@/lib/quant/engine";
import { detectRegime } from "@/lib/quant/regime";

export const dynamic = "force-dynamic";

const DEFAULT_SYMBOL = "NVDA";
const DEFAULT_TIMEFRAME = "1Day";
const MAX_BARS = 750;

function parseSymbols(raw: string | null): string[] {
  return (raw ?? DEFAULT_SYMBOL)
    .split(",")
    .map((s) => s.trim().toUpperCase())
    .filter((s) => /^[A-Z0-9.\-]{1,12}$/.test(s))
    .slice(0, 10);
}

export async function GET(request: NextRequest) {
  const params = request.nextUrl.searchParams;
  const symbols = parseSymbols(
    params.get("symbols") ?? params.get("symbol"),
  );
  if (symbols.length === 0) {
    return Response.json({ error: "No valid symbols provided" }, { status: 400 });
  }
  const timeframe = params.get("timeframe") ?? DEFAULT_TIMEFRAME;
  const limit = Math.min(Number(params.get("limit") ?? 300) || 300, MAX_BARS);
  const benchmarkSymbol = params.get("benchmark") ?? "SPY";

  const benchmarkResult = await getBars(benchmarkSymbol, timeframe, limit);
  const regime =
    benchmarkResult.bars.length >= 60
      ? detectRegime(benchmarkResult.bars, benchmarkSymbol)
      : detectRegime([], benchmarkSymbol);

  const generatedAt = new Date().toISOString();
  let anyAlpaca = benchmarkResult.source === "ALPACA";
  const signals = [];
  for (const symbol of symbols) {
    const { bars, source } = await getBars(symbol, timeframe, limit);
    if (source === "ALPACA") anyAlpaca = true;
    signals.push(computeQuantSignal({ symbol, bars, timeframe, source }));
  }

  const response: SignalResponse = {
    generatedAt,
    source: anyAlpaca ? "ALPACA" : "SYNTHETIC",
    regime,
    signals,
  };
  return Response.json(response);
}

interface SignalRequestBody {
  symbol?: string;
  timeframe?: string;
  bars?: unknown;
  benchmarkBars?: unknown;
  benchmarkSymbol?: string;
}

function coerceBars(raw: unknown) {
  if (!Array.isArray(raw)) return null;
  const bars = raw
    .map((b) => b as Record<string, unknown>)
    .filter(
      (b) =>
        typeof b.t === "string" &&
        typeof b.o === "number" &&
        typeof b.h === "number" &&
        typeof b.l === "number" &&
        typeof b.c === "number" &&
        typeof b.v === "number",
    )
    .map((b) => ({ t: b.t as string, o: b.o as number, h: b.h as number, l: b.l as number, c: b.c as number, v: b.v as number }))
    .sort((a, b) => a.t.localeCompare(b.t));
  return bars.length > 0 ? bars : null;
}

export async function POST(request: NextRequest) {
  let body: SignalRequestBody;
  try {
    body = (await request.json()) as SignalRequestBody;
  } catch {
    return Response.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  if (!body.symbol || !/^[A-Za-z0-9.\-]{1,12}$/.test(body.symbol)) {
    return Response.json({ error: "symbol is required" }, { status: 400 });
  }
  const bars = coerceBars(body.bars);
  if (!bars || bars.length < 30) {
    return Response.json(
      { error: "bars must contain at least 30 OHLCV records" },
      { status: 400 },
    );
  }

  const signal = computeQuantSignal({
    symbol: body.symbol,
    bars,
    timeframe: body.timeframe ?? DEFAULT_TIMEFRAME,
    source: "EXTERNAL",
  });

  const benchmarkBars = coerceBars(body.benchmarkBars);
  const regime = benchmarkBars
    ? detectRegime(benchmarkBars, body.benchmarkSymbol ?? "BENCHMARK")
    : detectRegime([]);

  return Response.json({ signal, regime });
}
