import { NextRequest, NextResponse } from "next/server";
import { getBars } from "@/lib/alpaca";

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const sym = searchParams.get("symbol") ?? "BTC";
  const tf  = searchParams.get("tf") ?? "5m";
  const lim = parseInt(searchParams.get("limit") ?? "120", 10);
  const bars = await getBars(sym, tf, lim);
  return NextResponse.json({ bars }, { headers: { "Cache-Control": "no-store" } });
}
