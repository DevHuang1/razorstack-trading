import { backendFetch } from "@/lib/backend/client";
import {
  QuantDataQualityRequestSchema,
  QuantDataQualityResponseSchema,
} from "@/lib/contracts/backend-quant";

// Bridge to the FastAPI data-quality authority: POST /quant/data-quality.
// Validates the payload, keeps the backend URL server-only, applies a timeout,
// and normalizes the backend error envelope before responding.

export const dynamic = "force-dynamic";

const REQUEST_TIMEOUT_MS = 10_000;

export async function POST(request: Request): Promise<Response> {
  let rawBody: unknown;
  try {
    rawBody = await request.json();
  } catch {
    return Response.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const parsed = QuantDataQualityRequestSchema.safeParse(rawBody);
  if (!parsed.success) {
    return Response.json(
      { error: "Invalid data-quality request", details: parsed.error.flatten() },
      { status: 422 },
    );
  }

  const result = await backendFetch("/quant/data-quality", {
    method: "POST",
    body: JSON.stringify(parsed.data),
    timeoutMs: REQUEST_TIMEOUT_MS,
  });

  if (!result.ok) {
    return Response.json({ error: result.error }, { status: result.status ?? 502 });
  }

  const validated = QuantDataQualityResponseSchema.safeParse(result.data);
  if (!validated.success) {
    return Response.json(
      { error: "Unexpected backend response shape", upstream: result.data },
      { status: 502 },
    );
  }

  return Response.json(validated.data);
}