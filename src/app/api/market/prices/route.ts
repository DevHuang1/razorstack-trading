import { NextRequest, NextResponse } from "next/server";
import { getMultiSnapshots } from "@/lib/alpaca";

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const raw = searchParams.get("symbols") ?? "BTC,ETH,SOL";
  const syms = raw.split(",").map(s => s.trim().toUpperCase()).filter(Boolean);
  const snaps = await getMultiSnapshots(syms);
  return NextResponse.json(snaps, { headers: { "Cache-Control": "no-store" } });
}
