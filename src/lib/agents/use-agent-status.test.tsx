import { renderHook, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { mascotStateForAgentStatus, useAgentStatusStream } from "./use-agent-status";

class MockWebSocket {
  static instances: MockWebSocket[] = [];
  onopen: (() => void) | null = null;
  onclose: (() => void) | null = null;
  onerror: (() => void) | null = null;
  onmessage: ((event: { data: string }) => void) | null = null;

  constructor(public url: string) {
    MockWebSocket.instances.push(this);
  }

  close() {
    this.onclose?.();
  }

  emitOpen() {
    this.onopen?.();
  }

  emitMessage(data: unknown) {
    this.onmessage?.({ data: JSON.stringify(data) });
  }
}

describe("useAgentStatusStream", () => {
  it.each([
    ["queued", "thinking"],
    ["running", "thinking"],
    ["completed", "success"],
    ["failed", "error"],
  ])("maps backend status %s to mascot state %s", (status, expected) => {
    expect(mascotStateForAgentStatus(status)).toBe(expected);
  });

  it("rejects unknown statuses", () => {
    expect(mascotStateForAgentStatus("not-a-status")).toBeNull();
  });

  beforeEach(() => {
    MockWebSocket.instances = [];
    vi.stubGlobal("WebSocket", MockWebSocket);
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("maps AGENT_STATUS events to mascot states and keeps connection state", async () => {
    const { result } = renderHook(() => useAgentStatusStream());
    const socket = MockWebSocket.instances[0];
    expect(socket.url).toMatch(/:8000\/events\/ws$/);

    socket.emitOpen();
    await waitFor(() => expect(result.current.connected).toBe(true));

    socket.emitMessage({
      event_type: "AGENT_STATUS",
      payload: {
        agent_id: "bear-agent-v1",
        role: "bear",
        status: "speaking",
        headline: "Stress test complete",
        progress: 100,
      },
    });

    await waitFor(() => expect(result.current.states.bear).toBe("speaking"));
    expect(result.current.updates.bear).toMatchObject({
      agent_id: "bear-agent-v1",
      headline: "Stress test complete",
      progress: 100,
    });
  });

  it("ignores unrelated and malformed events", async () => {
    const { result } = renderHook(() => useAgentStatusStream());
    const socket = MockWebSocket.instances[0];
    socket.emitMessage({ event_type: "ORDER_FILLED", payload: { role: "bull", status: "success" } });
    socket.onmessage?.({ data: "not-json" });

    await new Promise((resolve) => setTimeout(resolve, 10));
    expect(result.current.states).toEqual({});
  });
});
