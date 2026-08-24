import { buildResearchInput, runResearchPipeline } from "@/lib/agents/cio";
import { AnalyzeOpportunityInputSchema, type AnalyzeOpportunityInput, type PipelineEvent } from "@/lib/contracts/research";

export const dynamic = "force-dynamic";

function symbolFromRequest(request: Request): string {
  if (request.method === "POST") {
    return "";
  }
  return new URL(request.url).searchParams.get("symbol") ?? "";
}

async function readBodyInput(request: Request): Promise<AnalyzeOpportunityInput | string | null> {
  try {
    const body = (await request.json()) as Record<string, unknown>;
    if (typeof body.symbol === "string" && body.marketData === undefined) {
      return body.symbol;
    }
    return AnalyzeOpportunityInputSchema.parse(body);
  } catch {
    return null;
  }
}

async function resolveInput(request: Request): Promise<AnalyzeOpportunityInput | Response> {
  const candidate = request.method === "POST" ? await readBodyInput(request) : symbolFromRequest(request).trim();
  if (candidate === null) {
    return Response.json({ error: "Invalid request body" }, { status: 400 });
  }
  const symbol = typeof candidate === "string" ? candidate.trim() : candidate.symbol;
  if (!symbol || !/^[A-Za-z]{1,6}$/.test(symbol)) {
    return Response.json({ error: "Provide a valid ticker symbol, e.g. NVDA" }, { status: 400 });
  }
  if (typeof candidate === "string") {
    try {
      return await buildResearchInput(candidate);
    } catch {
      return Response.json({ error: `No market data available for ${candidate}` }, { status: 404 });
    }
  }
  return candidate;
}

async function handleResearch(request: Request): Promise<Response> {
  const resolved = await resolveInput(request);
  if (resolved instanceof Response) {
    return resolved;
  }

  const encoder = new TextEncoder();
  const stream = new ReadableStream<Uint8Array>({
    async start(controller) {
      const send = (event: PipelineEvent) => {
        controller.enqueue(encoder.encode(`${JSON.stringify(event)}\n`));
      };
      for await (const event of runResearchPipeline(resolved)) {
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
  return handleResearch(request);
}

export async function GET(request: Request): Promise<Response> {
  return handleResearch(request);
}
