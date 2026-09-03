import { beforeEach, describe, expect, it, vi } from "vitest";

const backendFetchMock = vi.fn();

vi.mock("@/lib/backend/client", () => ({
  backendFetch: (...args: unknown[]) => backendFetchMock(...args),
}));

import { proposalToTradePayload, submitTradeProposal } from "./trading";
import type { TradeProposalWire } from "@/lib/contracts/research";

const proposal: TradeProposalWire = {
  symbol: "NVDA",
  action: "BUY",
  strategy: "long_call",
  instrument: null,
  thesis: "Momentum + news reinforce upside",
  confidence: 0.82,
  supporting_factors: [{ kind: "observation", statement: "Strong trend" }],
  contradicting_factors: [],
  risks: [{ kind: "interpretation", statement: "Volatility" }],
  invalidation_conditions: ["breakdown"],
  portfolio_considerations: [],
  requires_risk_approval: true,
  generated_at: "2026-09-01T12:00:00.000Z",
};

beforeEach(() => {
  backendFetchMock.mockReset();
});

describe("proposalToTradePayload", () => {
  it("maps a BUY research proposal to the FastAPI trade payload", () => {
    const payload = proposalToTradePayload(proposal, { quantity: 5 });
    expect(payload).toMatchObject({
      agent_id: "ai-research-desk",
      symbol: "NVDA",
      side: "buy",
      quantity: 5,
      order_type: "market",
      strategy: "long_call",
      confidence: 0.82,
    });
    expect(payload?.reasoning).toContain("Committee thesis: Momentum + news reinforce upside");
  });

  it("maps a SELL proposal to sell", () => {
    const payload = proposalToTradePayload({ ...proposal, action: "SELL" });
    expect(payload?.side).toBe("sell");
  });

  it("rejects HOLD proposals", () => {
    expect(proposalToTradePayload({ ...proposal, action: "HOLD" })).toBeNull();
  });

  it("does not allow a limit price without specifying it", () => {
    const payload = proposalToTradePayload(proposal, { orderType: "limit", limitPrice: 120 });
    expect(payload?.order_type).toBe("limit");
    expect(payload?.limit_price).toBe(120);
  });
});

describe("submitTradeProposal", () => {
  it("posts the mapped payload to /trades/propose via the shared client", async () => {
    backendFetchMock.mockResolvedValue({
      ok: true,
      status: 200,
      data: { proposal: { id: "p1" }, risk: { status: "APPROVED" }, order: null },
    });

    const result = await submitTradeProposal({ proposal, quantity: 10, agentId: "desk-agent" });

    expect(result.ok).toBe(true);
    expect(backendFetchMock).toHaveBeenCalledWith(
      "/trades/propose",
      expect.objectContaining({ method: "POST" }),
    );
    const options = backendFetchMock.mock.calls[0][1] as { body: string };
    const body = JSON.parse(options.body) as { agent_id: string; quantity: number };
    expect(body.agent_id).toBe("desk-agent");
    expect(body.quantity).toBe(10);
  });

  it("returns a client-side rejection without calling the backend for HOLD", async () => {
    const result = await submitTradeProposal({ proposal: { ...proposal, action: "HOLD" } });
    if (result.ok) throw new Error("HOLD should not submit");
    expect(result.status).toBe(400);
    expect(result.error).toBe("HOLD and neutral proposals cannot be submitted");
    expect(backendFetchMock).not.toHaveBeenCalled();
  });

  it("forwards backend failures through the result envelope", async () => {
    backendFetchMock.mockResolvedValue({
      ok: false,
      status: 409,
      error: "daily loss limit reached",
    });

    const result = await submitTradeProposal({ proposal });
    if (result.ok) throw new Error("expected backend rejection");
    expect(result.status).toBe(409);
    expect(result.error).toBe("daily loss limit reached");
  });
});