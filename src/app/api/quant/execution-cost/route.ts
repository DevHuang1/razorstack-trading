import { backendFetch } from "@/lib/backend/client";
import {
  QuantExecutionCostEstimateSchema,
  QuantExecutionCostRequestSchema,
} from "@/lib/contracts/backend-quant";

// Bridge to the FastAPI execution-cost estimator: POST /quant/execution-cost.
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

  const parsed = QuantExecutionCostRequestSchema.safeParse(rawBody);
  if (!parsed.success) {
    return Response.json(
      { error: "Invalid execution-cost request", details: parsed.error.flatten() },
      { status: 422 },
    );
  }

  const result = await backendFetch("/quant/execution-cost", {
    method: "POST",
    body: JSON.stringify(parsed.data),
    timeoutMs: REQUEST_TIMEOUT_MS,
  });

  if (!result.ok) {
    return Response.json({ error: result.error }, { status: result.status ?? 502 });
  }

  const validated = QuantExecutionCostEstimateSchema.safeParse(result.data);
  if (!validated.success) {
    return Response.json(
      { error: "Unexpected backend response shape", upstream: result.data },
      { status: 502 },
    );
  }

  return Response.json(validated.data);
}