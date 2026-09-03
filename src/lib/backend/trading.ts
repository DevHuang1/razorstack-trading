import { backendFetch } from "@/lib/backend/client";
import type { TradeProposalWire } from "@/lib/contracts/research";
import type { TradeProposalRequest } from "@/lib/contracts/trade";

// Server-side mapping from the research desk's final `TradeProposalWire` to the
// FastAPI `/trades/propose` payload, plus a typed submit helper. The server
// (not the browser) owns the mapping so the backend URL/key stays server-only
// and the request/response are validated before the browser sees them.

const DEFAULT_TIMEOUT_MS = 10_000;

export interface SubmitTradeProposalInput {
  proposal: TradeProposalWire;
  agentId?: string;
  quantity?: number;
  orderType?: "market" | "limit";
  limitPrice?: number;
  timeoutMs?: number;
}

/**
 * Map a research-desk proposal to the FastAPI trade-proposal contract.
 * HOLD / neutral actions are not tradable and return null.
 */
export function proposalToTradePayload(
  proposal: TradeProposalWire,
  options: { quantity?: number; orderType?: "market" | "limit"; limitPrice?: number } = {},
): TradeProposalRequest | null {
  if (proposal.action === "HOLD") return null;
  const side = proposal.action === "SELL" ? "sell" : "buy";
  return {
    agent_id: "ai-research-desk",
    symbol: proposal.symbol,
    side,
    quantity: options.quantity ?? 1,
    order_type: options.orderType ?? "market",
    ...(options.limitPrice !== undefined ? { limit_price: options.limitPrice } : {}),
    strategy: proposal.strategy,
    confidence: proposal.confidence,
    reasoning: [
      `Committee thesis: ${proposal.thesis}`,
      proposal.instrument
        ? `Proposed structure: ${proposal.strategy} (options); the risk gate executes the directional equity equivalent.`
        : `Proposed structure: ${proposal.strategy}.`,
      proposal.invalidation_conditions.length > 0
        ? `Invalidation conditions: ${proposal.invalidation_conditions.join(" | ")}`
        : "",
      proposal.portfolio_considerations.length > 0
        ? `Portfolio considerations: ${proposal.portfolio_considerations.map((s) => s.statement).join(" | ")}`
        : "",
    ]
      .filter(Boolean)
      .join(" ")
      .slice(0, 4000),
  };
}

/**
 * Submit a research-desk proposal to the FastAPI risk gate through the shared
 * backend client. The backend keeps the URL and API key server-only.
 */
export async function submitTradeProposal(
  input: SubmitTradeProposalInput,
): Promise<ReturnType<typeof backendFetch>> {
  const payload = proposalToTradePayload(input.proposal, {
    quantity: input.quantity,
    orderType: input.orderType,
    limitPrice: input.limitPrice,
  });
  if (!payload) {
    return { ok: false, status: 400, error: "HOLD and neutral proposals cannot be submitted" };
  }
  if (input.agentId) payload.agent_id = input.agentId;

  return backendFetch("/trades/propose", {
    method: "POST",
    body: JSON.stringify(payload),
    timeoutMs: input.timeoutMs ?? DEFAULT_TIMEOUT_MS,
  });
}