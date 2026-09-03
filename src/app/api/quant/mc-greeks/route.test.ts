import { beforeEach, describe, expect, it, vi } from "vitest";

const backendFetchMock = vi.fn();

vi.mock("@/lib/backend/client", () => ({
  backendFetch: (...args: unknown[]) => backendFetchMock(...args),
}));

import { POST } from "./route";

const validRequest = {
  spot: 100,
  strike: 100,
  risk_free: 0.05,
  sigma: 0.2,
  maturity: 1.0,
  option_type: "call",
  n_paths: 50_000,
};

const backendGreeks = {
  spot: 100,
  strike: 100,
  risk_free: 0.05,
  sigma: 0.2,
  maturity: 1.0,
  option_type: "call",
  price: 10.45,
  delta: 0.6368,
  gamma: 0.0198,
  vega: 39.67,
  theta: -6.32,
  rho: 54.1,
  ad_method: "algorithmic differentiation",
  n_paths: 50_000,
};

function post(body: unknown | string): Promise<Response> {
  return POST(
    new Request("http://localhost/api/quant/mc-greeks", {
      method: "POST",
      body: typeof body === "string" ? body : JSON.stringify(body),
      headers: { "Content-Type": "application/json" },
    }),
  );
}

beforeEach(() => {
  backendFetchMock.mockReset();
});

describe("POST /api/quant/mc-greeks", () => {
  it("forwards a valid payload and returns the backend greeks", async () => {
    backendFetchMock.mockResolvedValue({ ok: true, status: 200, data: backendGreeks });

    const res = await post(validRequest);

    expect(res.status).toBe(200);
    const body = (await res.json()) as { delta: number; price: number };
    expect(body.delta).toBe(0.6368);
    expect(body.price).toBe(10.45);
    expect(backendFetchMock).toHaveBeenCalledWith(
      "/quant/mc-greeks",
      expect.objectContaining({ method: "POST" }),
    );
  });

  it("rejects invalid option types with 422", async () => {
    const res = await post({ ...validRequest, option_type: "straddle" });
    expect(res.status).toBe(422);
  });

  it("rejects malformed JSON with 400", async () => {
    const res = await post("not-json");
    expect(res.status).toBe(400);
  });

  it("normalizes backend failures to the error envelope", async () => {
    backendFetchMock.mockResolvedValue({
      ok: false,
      status: 422,
      error: "sigma must be in (0, 2]",
    });

    const res = await post(validRequest);
    expect(res.status).toBe(422);
    expect((await res.json()).error).toBe("sigma must be in (0, 2]");
  });

  it("returns 502 when the backend responds with an unexpected shape", async () => {
    backendFetchMock.mockResolvedValue({ ok: true, status: 200, data: { weird: true } });
    const res = await post(validRequest);
    expect(res.status).toBe(502);
  });
});