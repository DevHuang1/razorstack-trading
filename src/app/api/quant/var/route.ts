import type { NextRequest } from "next/server";
import { getBars } from "@/lib/quant/datafeed";
import { computeTailRiskMetrics, gaussianVaR } from "@/lib/quant/extremeValue";
import { round } from "@/lib/quant/indicators";

export const dynamic = "force-dynamic";

function toReturns(closes: number[]): number[] {
  const out: number[] = [];
  for (let i = 1; i < closes.length; i++) {
    const prev = closes[i - 1];
    if (prev > 0) out.push(closes[i] / prev - 1);
  }
  return out;
}

export async function GET(request: NextRequest) {
  const params = request.nextUrl.searchParams;
  const symbol = (params.get("symbol") ?? "NVDA").toUpperCase();
  const level = Number(params.get("level") ?? 0.99);
  const horizonDays = Number(params.get("horizon") ?? 1);
  const limit = Math.min(Number(params.get("limit") ?? 500) || 500, 1000);

  if (!/^[A-Z0-9.\-]{1,12}$/.test(symbol)) {
    return Response.json({ error: "invalid symbol" }, { status: 400 });
  }
  if (level <= 0 || level >= 1) {
    return Response.json({ error: "level must be in (0,1)" }, { status: 400 });
  }

  const { bars } = await getBars(symbol, "1Day", limit);
  if (bars.length < 40) {
    return Response.json({ error: "not enough bars" }, { status: 400 });
  }
  const closes = bars.map((b) => b.c);
  const returns = toReturns(closes);
  const tail = computeTailRiskMetrics(returns, { level, horizonDays });

  const volAnnual = annualizedVolFromReturns(returns);

  return Response.json({
    symbol,
    level,
    horizonDays,
    barCount: bars.length,
    tailIndex: tail.tailIndex,
    tailThreshold: tail.tailThreshold,
    gaussianVaR: {
      pct: tail.gaussianVaR,
      zdays: gaussianVaR(volAnnual * 100, level, horizonDays),
    },
    nonGaussianVaR: tail.nonGaussianVaR,
    fatTail: tail.fatTail,
    volAnnualizedPct: round(volAnnual * 100, 2),
  });
}

function annualizedVolFromReturns(returns: number[]): number {
  if (returns.length < 2) return 0;
  const mean = returns.reduce((a, b) => a + b, 0) / returns.length;
  const variance =
    returns.reduce((acc, v) => acc + (v - mean) ** 2, 0) / (returns.length - 1);
  return Math.sqrt(Math.max(variance, 0)) * Math.sqrt(252);
}
