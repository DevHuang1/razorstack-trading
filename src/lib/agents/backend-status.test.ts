import { beforeEach, describe, expect, it, vi } from "vitest";

const backendFetchMock = vi.fn();

vi.mock("@/lib/backend/client", () => ({
  backendFetch: (...args: unknown[]) => backendFetchMock(...args),
}));

import {
  agentIdForPipelineStep,
  fireAndForgetPublish,
  publishAgentStatus,
  roleForPipelineStep,
} from "./backend-status";

beforeEach(() => {
  backendFetchMock.mockReset();
});

describe("roleForPipelineStep", () => {
  it("maps pipeline steps to backend agent roles", () => {
    expect(roleForPipelineStep("market_research")).toBe("market");
    expect(roleForPipelineStep("news")).toBe("news");
    expect(roleForPipelineStep("advocates")).toBe("bull");
    expect(roleForPipelineStep("investment_committee")).toBe("cio");
    expect(roleForPipelineStep("unknown_step")).toBe("cio");
  });

  it("builds stable agent ids from step names", () => {
    expect(agentIdForPipelineStep("market_research")).toBe("market-research-agent-v1");
  });
});

describe("publishAgentStatus", () => {
  it("posts a snake_case payload to /agents/status", async () => {
    backendFetchMock.mockResolvedValue({ ok: true, status: 200, data: {} });

    const published = await publishAgentStatus({
      agent_id: "bull-agent-v1",
      role: "bull",
      status: "thinking",
      run_id: "run-1",
    });

    expect(published).toBe(true);
    expect(backendFetchMock).toHaveBeenCalledWith(
      "/agents/status",
      expect.objectContaining({ method: "POST" }),
    );
    const options = backendFetchMock.mock.calls[0][1] as { body: string };
    expect(JSON.parse(options.body)).toMatchObject({
      agent_id: "bull-agent-v1",
      role: "bull",
      status: "thinking",
      run_id: "run-1",
    });
  });

  it("returns false instead of throwing when the backend is unavailable", async () => {
    backendFetchMock.mockResolvedValue({ ok: false, status: null, error: "Backend is unavailable" });

    await expect(
      publishAgentStatus({ agent_id: "pipeline", role: "cio", status: "error" }),
    ).resolves.toBe(false);
  });
});

describe("fireAndForgetPublish", () => {
  it("never rejects even when the client crashes", async () => {
    backendFetchMock.mockRejectedValue(new Error("boom"));

    expect(() =>
      fireAndForgetPublish({ agent_id: "news-agent-v1", role: "news", status: "idle" }),
    ).not.toThrow();

    // Let the rejected promise settle; an unhandled rejection would fail the test.
    await new Promise((resolve) => setTimeout(resolve, 0));
  });
});