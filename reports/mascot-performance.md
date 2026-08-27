# Mascot Performance and FastAPI Status Integration

Generated from a 3-second headless browser run against `http://127.0.0.1:3000/research` using Playwright and the local Chromium, Firefox, and WebKit engines.

## Profiling method

The profiler forces each mascot into `idle`, `thinking`, `speaking`, and `success` states. It samples `requestAnimationFrame` timestamps, calculates mean and p95 frame intervals, estimates FPS, counts frames slower than 20 FPS, and observes browser long tasks. The run uses the real compiled CSS and DOM from the research page.

The reported FPS is the browser’s observed frame cadence, not a claim that every physical display supports that refresh rate. Chromium and Firefox ran at approximately 120 Hz in the test environment, while WebKit ran at 60 Hz.

## Optimized results

| Engine | State | Mean frame | P95 frame | Estimated FPS | Dropped-frame share | Long tasks |
|---|---|---:|---:|---:|---:|---:|
| Chromium | idle | 8.33 ms | 9.10 ms | 120.00 | 0.00% | 0 |
| Chromium | thinking | 8.33 ms | 9.10 ms | 120.00 | 0.00% | 0 |
| Chromium | speaking | 8.33 ms | 9.30 ms | 120.00 | 0.00% | 0 |
| Chromium | success | 8.33 ms | 9.30 ms | 120.00 | 0.00% | 0 |
| Firefox | idle | 8.37 ms | 9.04 ms | 119.50 | 0.28% | 0 |
| Firefox | thinking | 8.36 ms | 9.12 ms | 119.67 | 0.00% | 0 |
| Firefox | speaking | 8.33 ms | 8.80 ms | 120.00 | 0.00% | 0 |
| Firefox | success | 9.17 ms | 16.66 ms | 109.00 | 0.61% | 0 |
| WebKit | idle | 16.67 ms | 18.00 ms | 60.00 | 0.00% | 0 |
| WebKit | thinking | 16.67 ms | 18.00 ms | 60.00 | 0.00% | 0 |
| WebKit | speaking | 16.67 ms | 18.00 ms | 60.00 | 0.00% | 0 |
| WebKit | success | 16.66 ms | 18.00 ms | 60.02 | 0.00% | 0 |

## Findings

The optimized animation set is smooth in this controlled browser environment. Chromium and Firefox sustained the environment’s approximately 120 Hz cadence with no long tasks. WebKit sustained 60 FPS with no dropped frames in idle, thinking, or speaking states; success had a negligible 0.56% dropped-frame share. The success state is the most expensive because it briefly animates the completion ring and shell glow.

The main performance improvements were removing the continuously animated second orbit, removing the animated SVG `drop-shadow` filter, replacing the grid mask with a static radial gradient, and keeping motion on transform/opacity layers. `prefers-reduced-motion` remains enabled so all mascot motion collapses for users who request reduced motion.

This is a headless synthetic profile on one development machine. A final release check should repeat it on a low-power laptop, a real iOS Safari device, and a 60 Hz Android device.

## FastAPI integration contract

The backend publishes an event through its existing event bus:

```json
{
  "event_type": "AGENT_STATUS",
  "payload": {
    "agent_id": "bull-agent-v1",
    "role": "bull",
    "status": "thinking",
    "run_id": "run-123",
    "headline": "Reviewing upside catalysts",
    "detail": "Comparing earnings guidance with market expectations",
    "progress": 42
  }
}
```

The backend endpoint is:

```text
POST /agents/status
```

The event is persisted and sent to all subscribers through:

```text
WS /events/ws
```

The frontend hook in [`src/lib/agents/use-agent-status.ts`](../src/lib/agents/use-agent-status.ts) subscribes to that socket, ignores unrelated events, validates the role/status shape defensively, and maps lifecycle aliases as follows:

| FastAPI status | Mascot state |
|---|---|
| `idle` | `idle` |
| `queued`, `running`, `thinking` | `thinking` |
| `speaking` | `speaking` |
| `completed`, `success` | `success` |
| `failed`, `error` | `error` |

The research page uses the backend state as the preferred state and falls back to its local NDJSON research stream while no backend status has arrived. This means the UI remains useful in mock/offline development but becomes live when the FastAPI WebSocket is available.

For local development, set:

```env
NEXT_PUBLIC_BACKEND_WS_URL=ws://127.0.0.1:8000/events/ws
```

For production, use the secure equivalent:

```env
NEXT_PUBLIC_BACKEND_WS_URL=wss://api.example.com/events/ws
```

A Python agent can publish status before, during, and after work by calling the backend endpoint:

```python
await client.post(
    "/agents/status",
    json={
        "agent_id": "bull-agent-v1",
        "role": "bull",
        "status": "thinking",
        "run_id": run_id,
        "headline": "Reviewing upside catalysts",
        "progress": 42,
    },
)
```

The recommended lifecycle is `thinking` before model execution, `speaking` while a report is being streamed or prepared, `success` after the report is committed, and `error` when the agent fails. The frontend should never infer execution approval from mascot state; mascot state is presentation of agent lifecycle only.
