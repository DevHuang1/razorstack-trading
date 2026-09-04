import { backendFetch } from "@/lib/backend/client";

export const dynamic = "force-dynamic";

const TIMEOUT_MS = 10_000;

// GET /api/orders?limit=&status= — order audit trail from the FastAPI backend.
export async function GET(request: Request): Promise<Response> {
  const url = new URL(request.url);
  const limit = Math.min(Number(url.searchParams.get("limit") ?? 50) || 50, 200);
  const status = url.searchParams.get("status");
  const qs = new URLSearchParams({ limit: String(limit) });
  if (status) qs.set("status", status);

  const result = await backendFetch(`/orders?${qs.toString()}`, { timeoutMs: TIMEOUT_MS });
  if (!result.ok) {
    return Response.json({ error: result.error }, { status: result.status ?? 502 });
  }
  return Response.json(result.data);
}

// DELETE /api/orders?id=<order id> — cancel an open order.
export async function DELETE(request: Request): Promise<Response> {
  const url = new URL(request.url);
  const id = url.searchParams.get("id");
  if (!id) {
    return Response.json({ error: "id query parameter is required" }, { status: 400 });
  }

  const result = await backendFetch(`/orders/${encodeURIComponent(id)}`, {
    method: "DELETE",
    timeoutMs: TIMEOUT_MS,
  });
  if (!result.ok) {
    return Response.json({ error: result.error }, { status: result.status ?? 502 });
  }
  return Response.json(result.data);
}
