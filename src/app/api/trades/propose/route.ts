import { backendFetch } from "@/lib/backend/client";
import { TradeProposalRequestSchema } from "@/lib/contracts/trade";

export const dynamic = "force-dynamic";

const REQUEST_TIMEOUT_MS = 10_000;

export async function POST(request: Request): Promise<Response> {
  let rawBody: unknown;
  try {
    rawBody = await request.json();
  } catch {
    return Response.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const parsed = TradeProposalRequestSchema.safeParse(rawBody);
  if (!parsed.success) {
    return Response.json(
      { error: "Invalid trade proposal", details: parsed.error.flatten() },
      { status: 422 },
    );
  }

  const result = await backendFetch("/trades/propose", {
    method: "POST",
    body: JSON.stringify(parsed.data),
    timeoutMs: REQUEST_TIMEOUT_MS,
  });

  if (!result.ok) {
    return Response.json(
      {
        error: result.error,
        ...(result.upstream !== undefined ? { upstream: result.upstream } : {}),
      },
      { status: result.status ?? 502 },
    );
  }

  return Response.json(result.data, { status: result.status });
}
