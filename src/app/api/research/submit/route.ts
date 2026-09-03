import { submitTradeProposal } from "@/lib/backend/trading";
import { TradeProposalWireSchema } from "@/lib/contracts/research";

export const dynamic = "force-dynamic";

const DEFAULT_QUANTITY = 10;

interface SubmitBody {
  proposal?: unknown;
  quantity?: number;
  agent_id?: string;
}

export async function POST(request: Request): Promise<Response> {
  let rawBody: SubmitBody;
  try {
    rawBody = (await request.json()) as SubmitBody;
  } catch {
    return Response.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const parsed = TradeProposalWireSchema.safeParse(rawBody.proposal);
  if (!parsed.success) {
    return Response.json(
      { error: "Invalid research proposal", details: parsed.error.flatten() },
      { status: 422 },
    );
  }

  const quantity = Number(rawBody.quantity ?? DEFAULT_QUANTITY);
  if (!Number.isInteger(quantity) || quantity <= 0) {
    return Response.json({ error: "quantity must be a positive whole number" }, { status: 400 });
  }

  const result = await submitTradeProposal({
    proposal: parsed.data,
    agentId: rawBody.agent_id,
    quantity,
  });

  if (!result.ok) {
    return Response.json({ error: result.error }, { status: result.status ?? 502 });
  }
  return Response.json(result.data, { status: result.status ?? 200 });
}