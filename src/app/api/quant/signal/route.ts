import { generateSignalResponse } from "@/lib/quant/signal";
export const dynamic = "force-dynamic";
const DEF = ["NVDA", "AAPL", "MSFT", "SPY"];
export async function GET(req: Request) {
  const url = new URL(req.url);
  const p = url.searchParams.get("symbols");
  const symbols = p ? p.split(",").map(s => s.trim().toUpperCase()).filter(s => /^[A-Z]{1,6}$/.test(s)) : DEF;
  if (!symbols.length) return Response.json({ error: "No valid symbols" }, { status: 400 });
  try { return Response.json(await generateSignalResponse(symbols)); }
  catch (e) { return Response.json({ error: e instanceof Error ? e.message : "Unknown error" }, { status: 500 }); }
}
