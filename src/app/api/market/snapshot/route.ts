import { NextRequest, NextResponse } from "next/server";
import { getSnapshot } from "@/lib/alpaca";

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const sym = searchParams.get("symbol") ?? "BTC";
  const snap = await getSnapshot(sym);
  if (!snap) return NextResponse.json({ error: "not found" }, { status: 404 });
  return NextResponse.json(snap, { headers: { "Cache-Control": "no-store" } });
}
