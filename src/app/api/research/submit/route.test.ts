import { beforeEach, describe, expect, it, vi } from "vitest";

const backendFetchMock = vi.fn();

vi.mock("@/lib/backend/client", () => ({
  backendFetch: (...args: unknown[]) => backendFetchMock(...args),
}));

import { POST } from "./route";

const proposal = {
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

function post(body: unknown | string): Promise<Response> {
  return POST(
    new Request("http://localhost/api/research/submit", {
      method: "POST",
      body: typeof body === "string" ? body : JSON.stringify(body),
      headers: { "Content-Type": "application/json" },
    }),
  );
}

beforeEach(() => {
  backendFetchMock.mockReset();
});

describe("POST /api/research/submit", () => {
  it("forwards a valid research proposal to the risk gate", async () => {
    backendFetchMock.mockResolvedValue({
      ok: true,
      status: 200,
      data: { proposal: { id: "p1" }, risk: { status: "APPROVED" }, order: null },
    });

    const res = await post({ proposal, quantity: 5 });

    expect(res.status).toBe(200);
    const body = (await res.json()) as { risk: { status: string } };
    expect(body.risk.status).toBe("APPROVED");
    expect(backendFetchMock).toHaveBeenCalledWith(
      "/trades/propose",
      expect.objectContaining({ method: "POST" }),
    );
  });

  it("rejects a missing proposal with 422", async () => {
    const res = await post({});
    expect(res.status).toBe(422);
    expect(backendFetchMock).not.toHaveBeenCalled();
  });

  it("rejects a HOLD proposal with 400", async () => {
    const res = await post({ proposal: { ...proposal, action: "HOLD" } });
    expect(res.status).toBe(400);
    expect(backendFetchMock).not.toHaveBeenCalled();
  });

  it("rejects invalid quantities with 400", async () => {
    const res = await post({ proposal, quantity: 0 });
    expect(res.status).toBe(400);
    expect(backendFetchMock).not.toHaveBeenCalled();
  });

  it("normalizes backend rejection to the error envelope", async () => {
    backendFetchMock.mockResolvedValue({
      ok: false,
      status: 409,
      error: "daily loss limit reached",
    });

    const res = await post({ proposal });
    expect(res.status).toBe(409);
    expect((await res.json()).error).toBe("daily loss limit reached");
  });
});