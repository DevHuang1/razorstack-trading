import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { POST } from "./route";

const validPayload = {
  agent_id: "quant-engine-v1",
  symbol: "aapl",
  side: "buy",
  quantity: 5,
  order_type: "market",
  strategy: "quant-composite-v1",
  confidence: 0.82,
  reasoning: "Trend and momentum agree.",
};

describe("POST /api/trades/propose", () => {
  beforeEach(() => {
    process.env.BACKEND_API_URL = "http://fastapi.test";
    vi.stubGlobal("fetch", vi.fn());
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    delete process.env.BACKEND_API_URL;
  });

  it("validates, normalizes, and forwards a proposal to FastAPI", async () => {
    const fetchMock = vi.mocked(fetch);
    fetchMock.mockResolvedValue(
      new Response(JSON.stringify({ proposal: { id: "p-1" }, risk: { status: "APPROVED" }, order: null }), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      }),
    );

    const response = await POST(
      new Request("http://localhost/api/trades/propose", {
        method: "POST",
        body: JSON.stringify(validPayload),
      }),
    );

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({
      proposal: { id: "p-1" },
      risk: { status: "APPROVED" },
      order: null,
    });
    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe("http://fastapi.test/trades/propose");
    expect(init?.method).toBe("POST");
    expect(JSON.parse(String(init?.body))).toMatchObject({ symbol: "AAPL", side: "buy", quantity: 5 });
  });

  it("rejects malformed proposals without contacting the backend", async () => {
    const fetchMock = vi.mocked(fetch);
    const response = await POST(
      new Request("http://localhost/api/trades/propose", {
        method: "POST",
        body: JSON.stringify({ ...validPayload, side: "hold", quantity: 0 }),
      }),
    );

    expect(response.status).toBe(422);
    expect((await response.json()).error).toBe("Invalid trade proposal");
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("normalizes the FastAPI error envelope and preserves the upstream status", async () => {
    const fetchMock = vi.mocked(fetch);
    fetchMock.mockResolvedValue(
      new Response(JSON.stringify({ error: { code: "RISK_REJECTED", message: "daily loss limit reached" } }), {
        status: 409,
        headers: { "Content-Type": "application/json" },
      }),
    );

    const response = await POST(
      new Request("http://localhost/api/trades/propose", {
        method: "POST",
        body: JSON.stringify(validPayload),
      }),
    );

    expect(response.status).toBe(409);
    expect(await response.json()).toMatchObject({
      error: "daily loss limit reached",
      upstream: { error: { code: "RISK_REJECTED" } },
    });
  });

  it("returns a 502 when FastAPI is unavailable", async () => {
    const fetchMock = vi.mocked(fetch);
    fetchMock.mockRejectedValue(new Error("connect ECONNREFUSED"));

    const response = await POST(
      new Request("http://localhost/api/trades/propose", {
        method: "POST",
        body: JSON.stringify(validPayload),
      }),
    );

    expect(response.status).toBe(502);
    expect(await response.json()).toEqual({ error: "Backend is unavailable" });
  });
});
