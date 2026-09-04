import { NextRequest } from "next/server";
import { fetchMarketData } from "@/lib/agents/market-data";
import { runNewsAgent, runMarketResearchAgent, runBullAgent, runBearAgent, runCIOAgent, runCrisisNewsAgent, runCrisisMarketAgent, runCrisisRiskAgent, runCrisisOptionsAgent, runCrisisCommitteeAgent } from "@/lib/agents/agents";
export const dynamic = "force-dynamic";
export const maxDuration = 120;
const enc = new TextEncoder();
function ndjson(o: unknown) { return enc.encode(JSON.stringify(o) + "\n"); }
function status(s: string, d?: string) { return ndjson({ type: "status", step: s, detail: d }); }
export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => null);
  const symbol = body?.symbol.trim().toUpperCase();
  if (!symbol) return new Response(ndjson({ type: "error", step: "validate", detail: "Invalid symbol" }), { status: 400, headers: { "Content-Type": "application/x-ndjson" } });
  const crisis = Boolean(body?.crisis);
  const stream = new ReadableStream({
    async start(controller) {
      const enq = (c: Uint8Array) => { try { controller.enqueue(c); } catch {} };
      try {
        enq(status("Fetching market data"));
        const { snapshot, news } = await fetchMarketData(symbol);
        if (crisis) {
          const cN = await runCrisisNewsAgent(symbol, news); enq(ndjson({ type: "agent_message", message: cN }));
          const cM = await runCrisisMarketAgent(symbol, snapshot); enq(ndjson({ type: "agent_message", message: cM }));
          const cR = await runCrisisRiskAgent(symbol, snapshot, cM); enq(ndjson({ type: "agent_message", message: cR }));
          const cO = await runCrisisOptionsAgent(symbol, snapshot); enq(ndjson({ type: "agent_message", message: cO }));
          const { message, thesis } = await runCrisisCommitteeAgent(symbol, snapshot, cN, cM, cR, cO); enq(ndjson({ type: "agent_message", message })); enq(ndjson({ type: "thesis", thesis }));
        } else {
          const mN = await runNewsAgent(symbol, news); enq(ndjson({ type: "agent_message", message: mN }));
          const mM = await runMarketResearchAgent(symbol, snapshot); enq(ndjson({ type: "agent_message", message: mM }));
          const bM = await runBullAgent(symbol, snapshot, mN, mM); enq(ndjson({ type: "agent_message", message: bM }));
          const beM = await runBearAgent(symbol, snapshot, mN, mM); enq(ndjson({ type: "agent_message", message: beM }));
          const { message, thesis } = await runCIOAgent(symbol, snapshot, mN, mM, bM, beM); enq(ndjson({ type: "agent_message", message })); enq(ndjson({ type: "thesis", thesis }));
        }
        enq(ndjson({ type: "done" }));
      } catch (e) { enq(ndjson({ type: "error", step: "pipeline", detail: e instanceof Error ? e.message : String(e) })); }
      finally { try { controller.close(); } catch {} }
    }
  });
  return new Response(stream, { headers: { "Content-Type": "application/x-ndjson", "Transfer-Encoding": "chunked", "Cache-Control": "no-cache" } });
}
