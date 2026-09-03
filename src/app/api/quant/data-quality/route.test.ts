import { beforeEach, describe, expect, it, vi } from "vitest";

const backendFetchMock = vi.fn();

vi.mock("@/lib/backend/client", () => ({
  backendFetch: (...args: unknown[]) => backendFetchMock(...args),
}));

import { POST } from "./route";

const validRequest = {
  symbol: "NVDA",
  timeframe: "1Day",
  bars: [
    { t: "2026-08-28T00:00:00Z", o: 100, h: 110, l: 95, c: 105, v: 1000 },
    { t: "2026-08-29T00:00:00Z", o: 105, h: 115, l: 100, c: 112, v: 1200 },
  ],
};

const backendQuality = {
  symbol: "NVDA",
  timeframe: "1Day",
  bar_count: 2,
  first_bar_at: "2026-08-28T00:00:00Z",
  last_bar_at: "2026-08-29T00:00:00Z",
  expected_interval_seconds: 86400,
  duplicate_bar_count: 0,
  missing_bar_count: 0,
  max_gap_bars: 0,
  stale: false,
  is_actionable: true,
  warnings: [],
};

function post(body: unknown | string): Promise<Response> {
  return POST(
    new Request("http://localhost/api/quant/data-quality", {
      method: "POST",
      body: typeof body === "string" ? body : JSON.stringify(body),
      headers: { "Content-Type": "application/json" },
    }),
  );
}

beforeEach(() => {
  backendFetchMock.mockReset();
});

describe("POST /api/quant/data-quality", () => {
  it("forwards a valid payload and returns the backend verdict", async () => {
    backendFetchMock.mockResolvedValue({
      ok: true,
      status: 200,
      data: { quality: backendQuality },
    });

    const res = await post(validRequest);

    expect(res.status).toBe(200);
    const body = (await res.json()) as { quality: { is_actionable: boolean } };
    expect(body.quality.is_actionable).toBe(true);
    expect(backendFetchMock).toHaveBeenCalledWith(
      "/quant/data-quality",
      expect.objectContaining({ method: "POST" }),
    );
  });

  it("rejects invalid payloads with 422", async () => {
    const res = await post({ symbol: "NVDA", bars: [] });
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
    const body = (await res.json()) as { error: string };
    expect(body.error).toBe("Backend returned 503");
  });

  it("returns 502 when the backend is unreachable", async () => {
    backendFetchMock.mockResolvedValue({
      ok: false,
      status: null,
      error: "Backend is unavailable",
    });

    const res = await post(validRequest);

    expect(res.status).toBe(502);
  });

  it("returns 502 when the backend responds with an unexpected shape", async () => {
    backendFetchMock.mockResolvedValue({ ok: true, status: 200, data: { nonsense: true } });

    const res = await post(validRequest);

    expect(res.status).toBe(502);
  });
});