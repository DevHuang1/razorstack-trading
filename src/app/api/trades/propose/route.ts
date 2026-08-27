import { TradeProposalRequestSchema } from "@/lib/contracts/trade";

export const dynamic = "force-dynamic";

const REQUEST_TIMEOUT_MS = 10_000;

function backendUrl(path: string): string {
  const base = process.env.BACKEND_API_URL ?? "http://127.0.0.1:8000";
  return `${base.replace(/\/$/, "")}${path}`;
}

function errorMessage(body: unknown, fallback: string): string {
  if (typeof body === "object" && body !== null && "error" in body) {
    const error = (body as { error?: unknown }).error;
    if (typeof error === "string") return error;
    if (typeof error === "object" && error !== null && "message" in error) {
      const message = (error as { message?: unknown }).message;
      if (typeof message === "string") return message;
    }
  }
  return fallback;
}

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

  try {
    const upstream = await fetch(backendUrl("/trades/propose"), {
      method: "POST",
      headers: { "Content-Type": "application/json", Accept: "application/json" },
      body: JSON.stringify(parsed.data),
      cache: "no-store",
      signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
    });
    const text = await upstream.text();
    let body: unknown;
    try {
      body = JSON.parse(text);
    } catch {
      body = { error: text.slice(0, 2000) };
    }

    if (!upstream.ok) {
      return Response.json(
        { error: errorMessage(body, `Backend returned ${upstream.status}`), upstream: body },
        { status: upstream.status },
      );
    }

    return Response.json(body, { status: upstream.status });
  } catch (error) {
    const message =
      error instanceof Error && error.name === "TimeoutError"
        ? `Trading backend timed out after ${REQUEST_TIMEOUT_MS / 1000}s`
        : "Trading backend is unavailable";
    return Response.json({ error: message }, { status: 502 });
  }
}
