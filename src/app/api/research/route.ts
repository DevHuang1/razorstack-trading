import { runResearchPipeline } from "@/lib/agents/cio";
import type { PipelineEvent } from "@/lib/contracts/research";

export const dynamic = "force-dynamic";

function symbolFromRequest(request: Request): string {
  if (request.method === "POST") {
    return "";
  }
  return new URL(request.url).searchParams.get("symbol") ?? "";
}

async function readBodySymbol(request: Request): Promise<string> {
  try {
    const body = (await request.json()) as { symbol?: unknown };
    return typeof body.symbol === "string" ? body.symbol : "";
  } catch {
    return "";
  }
}

async function handleResearch(symbol: string): Promise<Response> {
  const trimmed = symbol.trim();
  if (!trimmed || !/^[A-Za-z]{1,6}$/.test(trimmed)) {
    return Response.json({ error: "Provide a valid ticker symbol, e.g. NVDA" }, { status: 400 });
  }

  const encoder = new TextEncoder();
  const stream = new ReadableStream<Uint8Array>({
    async start(controller) {
      const send = (event: PipelineEvent) => {
        controller.enqueue(encoder.encode(`${JSON.stringify(event)}\n`));
      };
      for await (const event of runResearchPipeline(trimmed)) {
        send(event);
      }
      controller.close();
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "application/x-ndjson; charset=utf-8",
      "Cache-Control": "no-cache, no-transform",
    },
  });
}

export async function POST(request: Request): Promise<Response> {
  return handleResearch(await readBodySymbol(request));
}

export async function GET(request: Request): Promise<Response> {
  return handleResearch(symbolFromRequest(request));
}
