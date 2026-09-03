import { beforeEach, describe, expect, it, vi } from "vitest";

const backendFetchMock = vi.fn();

vi.mock("@/lib/backend/client", () => ({
  backendFetch: (...args: unknown[]) => backendFetchMock(...args),
}));

import { POST } from "./route";

const validRequest = {
  times: [0.0, 1.5, 3.0, 5.0, 8.0, 12.0, 16.0, 21.0, 27.0],
};

const backendHawkes = {
  n_events: 9,
  mu: 0.0123,
  alpha: 0.4,
  beta: 0.8,
  branching_ratio: 0.5,
  branching_pct: 50.0,
  log_likelihood: -12.34,
  stationary: true,
  converged: true,
};

function post(body: unknown | string): Promise<Response> {
  return POST(
    new Request("http://localhost/api/quant/hawkes", {
      method: "POST",
      body: typeof body === "string" ? body : JSON.stringify(body),
      headers: { "Content-Type": "application/json" },
    }),
  );
}

beforeEach(() => {
  backendFetchMock.mockReset();
});

describe("POST /api/quant/hawkes", () => {
  it("forwards a valid payload and returns the backend fit", async () => {
    backendFetchMock.mockResolvedValue({ ok: true, status: 200, data: backendHawkes });

    const res = await post(validRequest);

    expect(res.status).toBe(200);
    const body = (await res.json()) as { branching_ratio: number };
    expect(body.branching_ratio).toBe(0.5);
    expect(backendFetchMock).toHaveBeenCalledWith(
      "/quant/hawkes",
      expect.objectContaining({ method: "POST" }),
    );
  });

  it("rejects too few arrival times with 422", async () => {
    const res = await post({ times: [0.0, 1.0] });
    expect(res.status).toBe(422);
  });

  it("rejects malformed JSON with 400", async () => {
    const res = await post("not-json");
    expect(res.status).toBe(400);
  });

  it("normalizes backend failures to the error envelope", async () => {
    backendFetchMock.mockResolvedValue({
      ok: false,
      status: 503,
      error: "Backend returned 503",
    });

    const res = await post(validRequest);
    expect(res.status).toBe(503);
    expect((await res.json()).error).toBe("Backend returned 503");
  });

  it("returns 502 when the backend responds with an unexpected shape", async () => {
    backendFetchMock.mockResolvedValue({ ok: true, status: 200, data: { nonsense: true } });

    const res = await post(validRequest);
    expect(res.status).toBe(502);
  });
});