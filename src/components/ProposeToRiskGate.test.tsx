import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";

import { ProposeToRiskGate } from "./ProposeToRiskGate";
import type { TradeProposalWire } from "@/lib/contracts/research";

const fetchMock = vi.fn();

beforeEach(() => {
  fetchMock.mockReset();
  vi.stubGlobal("fetch", fetchMock);
});

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

const approvedResponse = {
  proposal: { id: "p1", status: "EXECUTED", quantity: 2 },
  risk: {
    status: "APPROVED",
    reason: "Within limits",
    code: "",
    risk_score: 0.4,
    original_quantity: 2,
    approved_quantity: 2,
  },
  order: {
    id: "o1",
    status: "FILLED",
    filled_quantity: 2,
    avg_fill_price: 334.13,
    reject_reason: null,
  },
  message: "done",
};

describe("ProposeToRiskGate", () => {
  it("posts the mapped payload to the trades bridge and renders the verdict", async () => {
    fetchMock.mockResolvedValue(
      new Response(JSON.stringify(approvedResponse), { status: 200 }),
    );

    render(
      <ProposeToRiskGate
        symbol="NVDA"
        side="buy"
        strategy="quant-composite-v1"
        confidence={0.72}
        reasoning="Composite score 0.4 → BUY"
        agentId="quant-engine-v1"
        defaultQuantity={2}
      />,
    );

    fireEvent.click(screen.getByRole("button", { name: "Propose to risk gate" }));

    await waitFor(() => expect(screen.getByText("Risk gate: APPROVED")).toBeTruthy());
    expect(screen.getByText(/Order FILLED/)).toBeTruthy();

    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toBe("/api/trades/propose");
    expect(JSON.parse(String(init.body))).toEqual({
      agent_id: "quant-engine-v1",
      symbol: "NVDA",
      side: "buy",
      quantity: 2,
      order_type: "market",
      strategy: "quant-composite-v1",
      confidence: 0.72,
      reasoning: "Composite score 0.4 → BUY",
    });
  });

  it("renders a REJECTED verdict verbatim", async () => {
    fetchMock.mockResolvedValue(
      new Response(
        JSON.stringify({
          risk: {
            status: "REJECTED",
            reason: "Post-trade cash below floor",
            code: "INSUFFICIENT_CASH",
            original_quantity: 10,
            approved_quantity: 0,
          },
          order: null,
          message: "rejected",
        }),
        { status: 200 },
      ),
    );

    render(
      <ProposeToRiskGate
        symbol="AAPL"
        side="sell"
        strategy="bear_put_spread"
        confidence={0.58}
        reasoning="test"
        agentId="ai-research-desk"
      />,
    );

    fireEvent.click(screen.getByRole("button", { name: "Propose to risk gate" }));

    await waitFor(() => expect(screen.getByText("Risk gate: REJECTED")).toBeTruthy());
    expect(screen.getByText(/Post-trade cash below floor \(INSUFFICIENT_CASH\)/)).toBeTruthy();
  });

  it("surfaces bridge errors instead of a verdict", async () => {
    fetchMock.mockResolvedValue(
      new Response(JSON.stringify({ error: "Trading backend is unavailable" }), { status: 502 }),
    );

    render(
      <ProposeToRiskGate
        symbol="NVDA"
        side="buy"
        strategy="quant-composite-v1"
        confidence={0.5}
        reasoning="test"
        agentId="quant-engine-v1"
      />,
    );

    fireEvent.click(screen.getByRole("button", { name: "Propose to risk gate" }));

    await waitFor(() =>
      expect(screen.getByText("Trading backend is unavailable")).toBeTruthy(),
    );
  });

  it("validates quantity locally without calling the backend", async () => {
    render(
      <ProposeToRiskGate
        symbol="NVDA"
        side="buy"
        strategy="quant-composite-v1"
        confidence={0.5}
        reasoning="test"
        agentId="quant-engine-v1"
      />,
    );

    const input = screen.getByDisplayValue("10");
    fireEvent.change(input, { target: { value: "0" } });
    fireEvent.click(screen.getByRole("button", { name: "Propose to risk gate" }));

    await waitFor(() =>
      expect(screen.getByText("Quantity must be a positive whole number.")).toBeTruthy(),
    );
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("disables the action with the given reason", () => {
    render(
      <ProposeToRiskGate
        symbol="NVDA"
        side="buy"
        strategy="quant-composite-v1"
        confidence={0.5}
        reasoning="test"
        agentId="quant-engine-v1"
        disabled
        disabledReason="not actionable"
      />,
    );

    expect((screen.getByRole("button") as HTMLButtonElement).disabled).toBe(true);
    expect(screen.getByText("not actionable")).toBeTruthy();
  });

  it("posts the full research proposal to the submit bridge when provided", async () => {
    fetchMock.mockResolvedValue(
      new Response(
        JSON.stringify({
          proposal: { id: "p-desk", status: "EXECUTED", quantity: 10 },
          risk: { status: "APPROVED", reason: "Within limits", original_quantity: 10, approved_quantity: 10 },
          order: { id: "o1", status: "FILLED", filled_quantity: 10 },
        }),
        { status: 200 },
      ),
    );

    const wireProposal: TradeProposalWire = {
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

    render(
      <ProposeToRiskGate
        symbol="NVDA"
        side="buy"
        strategy="long_call"
        confidence={0.82}
        reasoning="test"
        agentId="ai-research-desk"
        defaultQuantity={10}
        proposal={wireProposal}
      />,
    );

    fireEvent.click(screen.getByRole("button", { name: "Propose to risk gate" }));

    await waitFor(() => expect(screen.getByText("Risk gate: APPROVED")).toBeTruthy());
    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toBe("/api/research/submit");
    const body = JSON.parse(String(init.body)) as {
      proposal: { symbol: string };
      quantity: number;
      agent_id: string;
    };
    expect(body.proposal.symbol).toBe("NVDA");
    expect(body.quantity).toBe(10);
    expect(body.agent_id).toBe("ai-research-desk");
  });
});