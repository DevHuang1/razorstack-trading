import type { NextRequest } from "next/server";
import type { Bar, MarketRegime, QuantSignal, SignalResponse } from "@/lib/quant/types";
import type { QuantDataQualityMetadata } from "@/lib/contracts/backend-quant";
import { QuantDataQualityResponseSchema } from "@/lib/contracts/backend-quant";
import { backendFetch } from "@/lib/backend/client";
import { getBars } from "@/lib/quant/datafeed";
import { computeQuantSignal } from "@/lib/quant/engine";
import { detectRegime } from "@/lib/quant/regime";

export const dynamic = "force-dynamic";

const DEFAULT_SYMBOL = "NVDA";
const DEFAULT_TIMEFRAME = "1Day";
const MAX_BARS = 750;
const BACKEND_QUALITY_TIMEOUT_MS = 5_000;
const MAX_BARS_SENT_TO_BACKEND = 250;

// The FastAPI service owns data-quality configuration (min history, gap and
// staleness thresholds), so when it is reachable its verdict overrides the
// local computation; otherwise the local result stands.
async function backendDataQuality(
  symbol: string,
  timeframe: string,
  bars: Bar[],
): Promise<QuantDataQualityMetadata | null> {
  const result = await backendFetch("/quant/data-quality", {
    method: "POST",
    body: JSON.stringify({ symbol, timeframe, bars: bars.slice(-MAX_BARS_SENT_TO_BACKEND) }),
    timeoutMs: BACKEND_QUALITY_TIMEOUT_MS,
  });
  if (!result.ok) return null;
  const parsed = QuantDataQualityResponseSchema.safeParse(result.data);
  return parsed.success ? parsed.data.quality : null;
}

function mergeBackendQuality(
  signal: QuantSignal,
  quality: QuantDataQualityMetadata | null,
): QuantSignal {
  if (!quality || !signal.dataQuality) return signal;
  return {
    ...signal,
    dataQuality: {
      ...signal.dataQuality,
      isActionable: quality.is_actionable,
      stale: quality.stale,
      warnings: [...signal.dataQuality.warnings, ...quality.warnings.map((w) => `backend: ${w}`)],
    },
  };
}

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
  const symbolResults = await Promise.all(
    symbols.map((s) => getBars(s, timeframe, limit)),
  );
  const anyAlpaca =
    benchmarkResult.source === "ALPACA" ||
    symbolResults.some((r) => r.source === "ALPACA");

  const signals = symbols.map((symbol, i) =>
    computeQuantSignal({
      symbol,
      bars: symbolResults[i].bars,
      timeframe,
      source: symbolResults[i].source,
      regime,
    }),
  );

  const backendQuality = await Promise.all(
    signals.map((signal, i) => backendDataQuality(signal.symbol, timeframe, symbolResults[i].bars)),
  );
  const mergedSignals = signals.map((signal, i) => mergeBackendQuality(signal, backendQuality[i]));

  const response: SignalResponse = {
    generatedAt,
    source: anyAlpaca ? "ALPACA" : "SYNTHETIC",
    regime,
    signals: mergedSignals,
  };
  return Response.json(response);
}

interface SignalRequestBody {
  symbol?: string;
  timeframe?: string;
  bars?: unknown;
  benchmarkBars?: unknown;
  benchmarkSymbol?: string;
  regime?: unknown;
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

function coerceRegime(raw: unknown): MarketRegime | null {
  if (raw === null || typeof raw !== "object") return null;
  const r = raw as Record<string, unknown>;
  if (
    typeof r.trend !== "string" ||
    typeof r.volatility !== "string" ||
    typeof r.riskMultiplier !== "number"
  ) {
    return null;
  }
  return r as unknown as MarketRegime;
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
    regime: coerceRegime(body.regime) ?? undefined,
  });

  const benchmarkBars = coerceBars(body.benchmarkBars);
  const regime = benchmarkBars
    ? detectRegime(benchmarkBars, body.benchmarkSymbol ?? "BENCHMARK")
    : detectRegime([]);

  const quality = await backendDataQuality(body.symbol.toUpperCase(), signal.timeframe, bars);

  return Response.json({ signal: mergeBackendQuality(signal, quality), regime });
}
