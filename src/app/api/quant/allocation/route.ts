import type { NextRequest } from "next/server";
import type { MarketRegime } from "@/lib/quant/types";
import { getBars } from "@/lib/quant/datafeed";
import { allocatePortfolio } from "@/lib/quant/allocation";

export const dynamic = "force-dynamic";

interface AllocationBody {
  symbols?: string[];
  horizonDays?: number;
  regime?: MarketRegime | null;
  maxConcentration?: number;
}

export async function POST(request: NextRequest) {
  let body: AllocationBody;
  try {
    body = (await request.json()) as AllocationBody;
  } catch {
    return Response.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const symbols = (body.symbols ?? [])
    .map((s) => String(s).trim().toUpperCase())
    .filter((s) => /^[A-Z0-9.\-]{1,12}$/.test(s))
    .slice(0, 10);
  if (symbols.length < 2) {
    return Response.json({ error: "provide at least two symbols" }, { status: 400 });
  }

  try {
    const barsBySymbol = await Promise.all(
      symbols.map(async (s) => {
        const result = await getBars(s, "1Day", 300);
        return result.bars.map((b) => b.c);
      }),
    );

    const returnSeries: Record<string, number[]> = {};
    symbols.forEach((s, i) => {
      returnSeries[s] = toReturns(barsBySymbol[i]);
    });

    const result = allocatePortfolio({
      symbols,
      returnSeries,
      regime: body.regime ?? null,
      maxConcentration: body.maxConcentration,
    });

    return Response.json(result);
  } catch {
    return Response.json({ error: "failed to load bars for allocation" }, { status: 502 });
  }
}

function toReturns(closes: number[]): number[] {
  const out: number[] = [];
  for (let i = 1; i < closes.length; i++) {
    const prev = closes[i - 1];
    if (prev > 0) out.push(closes[i] / prev - 1);
  }
  return out;
}
