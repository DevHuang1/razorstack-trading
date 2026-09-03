import type { NextRequest } from "next/server";
import type { Direction, StrategyId } from "@/lib/quant/types";
import { listPaperRecords, recordSignal } from "@/lib/quant/paper-store";
import { listStrategies } from "@/lib/quant/strategies";

export const dynamic = "force-dynamic";

const VALID_STRATEGIES = new Set<string>(listStrategies().map((s) => s.id));
const VALID_DIRECTIONS: Direction[] = ["BUY", "SELL", "HOLD"];

export async function GET() {
  const records = await listPaperRecords();
  return Response.json({ records });
}

interface PaperBody {
  symbol?: string;
  strategy?: string;
  modelVersion?: string;
  timeframe?: string;
  horizonDays?: number;
  entryPrice?: number;
  direction?: string;
}

export async function POST(request: NextRequest) {
  let body: PaperBody;
  try {
    body = (await request.json()) as PaperBody;
  } catch {
    return Response.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const symbol = body.symbol?.trim().toUpperCase() ?? "";
  if (!/^[A-Z0-9.\-]{1,12}$/.test(symbol)) {
    return Response.json({ error: "A valid symbol is required" }, { status: 400 });
  }
  const strategy = body.strategy?.toUpperCase() ?? "";
  if (!VALID_STRATEGIES.has(strategy)) {
    return Response.json(
      { error: "strategy must be one of " + [...VALID_STRATEGIES].join(", ") },
      { status: 400 },
    );
  }
  const direction = body.direction?.toUpperCase() ?? "";
  if (!VALID_DIRECTIONS.includes(direction as Direction)) {
    return Response.json(
      { error: "direction must be one of " + VALID_DIRECTIONS.join(", ") },
      { status: 400 },
    );
  }
  const entryPrice = Number(body.entryPrice);
  if (!Number.isFinite(entryPrice) || entryPrice <= 0) {
    return Response.json({ error: "entryPrice must be a positive number" }, { status: 400 });
  }

  const record = await recordSignal({
    symbol,
    strategy: strategy as StrategyId,
    modelVersion: body.modelVersion ?? "quant-composite-v1",
    timeframe: body.timeframe ?? "1Day",
    horizonDays: Number(body.horizonDays) || 5,
    entryPrice,
    direction: direction as Direction,
  });
  return Response.json({ record });
}
