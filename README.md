# Razorstack Trading

> A responsive quantitative research and paper-trading workspace where AI
> agents propose trades, a deterministic risk engine approves them, and
> execution runs against a mock broker or Alpaca paper — never live money.

Razorstack Trading is a two-tier system:

- **`backend/`** — FastAPI service that owns the trade lifecycle, risk
  engine, broker integration, and event bus. All orders flow through
  `TradeProposed → RiskChecked → Approved|Adjusted|Rejected → Submitted → Filled|Canceled → PositionUpdated`,
  every transition is persisted, and the full stream is fanned out over
  REST and WebSocket.
- **`src/`** — Next.js 16 dashboard (App Router, React 19, Tailwind 4)
  that talks to the backend. An AI Research Desk runs a multi-agent
  pipeline (Sage, Vector, Atlas, Mara, North, Sentinel, Radar, Gauge,
  Hedge, Apex) orchestrated by a CIO; a Quant Engine produces signals,
  strategies, and backtests; a Risk/Execution layer (Person 3) wires
  portfolio accounting to Alpaca or the mock broker.

Live-money trading is rejected at startup. Order execution is restricted
to `mock` or `alpaca` paper environments. Market candles and news may use
live Alpaca data, but no real capital is ever at risk.

---

## Table of contents

- [Features](#features)
- [Architecture](#architecture)
- [Repository layout](#repository-layout)
- [Team ownership map](#team-ownership-map)
- [Quickstart](#quickstart)
  - [1. Backend (FastAPI)](#1-backend-fastapi)
  - [2. Frontend (Next.js)](#2-frontend-nextjs)
  - [3. Try it in 60 seconds](#3-try-it-in-60-seconds)
- [Configuration](#configuration)
- [Trade lifecycle](#trade-lifecycle)
- [Risk engine rules](#risk-engine-rules)
- [AI Research Desk](#ai-research-desk)
- [Quant Engine](#quant-engine)
- [Dashboard](#dashboard)
- [API reference (summary)](#api-reference-summary)
- [WebSocket events](#websocket-events)
- [Data quality & execution cost](#data-quality--execution-cost)
- [Testing](#testing)
- [Deployment](#deployment)
- [Project conventions](#project-conventions)
- [Security](#security)
- [Roadmap](#roadmap)
- [License](#license)
- [Acknowledgements](#acknowledgements)

---

## Features

- **Deterministic risk engine** — every proposal is checked in order
  against five guardrails (daily-loss halt, drawdown halt, position cap,
  sector cap, cash floor). Soft caps scale the quantity down to whatever
  still fits inside the limits; hard halts reject outright.
- **Multi-agent research desk** — bull/bear, news, market, sector,
  crisis, and structured-output agents stream their reasoning as NDJSON
  events. The CIO agent orchestrates the workflow and produces a final
  trade plan.
- **Quant toolkit** — OHLCV data-quality validation (gaps, staleness,
  history depth), VaR and CVaR, extreme-value theory, signal generation,
  strategies, and backtesting. Conservative pre-trade cost estimates
  cover slippage, market impact, and commission.
- **Dual broker mode** — `BROKER_MODE=mock` for hermetic offline testing
  (with admin endpoints to advance prices and force-fill resting limit
  orders), or `BROKER_MODE=alpaca` for paper trading against the real
  Alpaca API.
- **Live event stream** — every state transition is persisted and
  published over WebSocket (`/events/ws`) and surfaced as NDJSON
  (`/api/research`). The frontend maps `AGENT_STATUS` payloads to
  mascot animation states (idle / thinking / speaking / success / error).
- **Passphrase-gated dashboard** — a single shared passphrase yields a
  7-day signed session cookie (`AUTH_SESSION_SECRET`). No public sign-up,
  no leaked user database.
- **Contracts-first cross-team handoffs** — zod DTOs in
  `src/lib/contracts/<domain>.ts` are the only blessed way for one
  workstream to talk to another.

## Architecture

```
┌──────────────────────────────┐         ┌──────────────────────────────┐
│  Next.js 16 dashboard (App)  │         │  FastAPI trading backend     │
│  ─────────────────────────   │         │  ─────────────────────────   │
│  • AI Research Desk          │         │  • Trade proposal router     │
│  • Quant Engine UI           │ REST    │  • Risk engine (5 rules)     │
│  • Portfolio / Orders / Risk │ ──────▶ │  • Order manager             │
│  • Settings                  │ ◀────── │  • Portfolio analytics       │
│  • Live WS event feed        │   WS    │  • EventBus (persist+fanout) │
└──────────────┬───────────────┘         └──────────────┬───────────────┘
               │                                        │
               │ NDJSON /api/research (streaming)       │
               ▼                                        ▼
        ┌────────────────────┐               ┌────────────────────┐
        │  LLM (Groq, etc.)  │               │  Broker            │
        │  via Vercel AI SDK │               │  • MockAlpaca      │
        └────────────────────┘               │  • AlpacaService   │
                                            │    (paper only)    │
                                            └────────────────────┘
```

The data-flow contract is intentionally narrow: every domain (research,
quant, risk, account, orders) exposes a single typed DTO in
`src/lib/contracts/`. Layers never reach into each other's internals.

## Repository layout

```
.
├── backend/                  FastAPI trading service
│   ├── app/
│   │   ├── api/              routers + deps (health, trades, orders,
│   │   │                     portfolio, risk, events, market, quant,
│   │   │                     agents, admin)
│   │   ├── core/             settings, JSON logging, error envelope
│   │   ├── db/               async engine/session, UTCDateTime base
│   │   ├── events/           EventBus (persist + fan-out)
│   │   ├── integrations/     BrokerService ABC, MockAlpacaService,
│   │   │                     AlpacaService
│   │   ├── models/           6 tables (SQLAlchemy 2.0 style)
│   │   ├── schemas/          Pydantic contracts shared with AI/frontend
│   │   └── services/         portfolio analytics, risk engine,
│   │                         order manager, trading flow
│   ├── alembic/              migrations (async env)
│   ├── tests/                unit + API + WebSocket integration suite
│   └── scripts/              demo.py walkthrough
├── src/                      Next.js 16 dashboard
│   ├── app/                  App Router (page, layout, login, api/*)
│   ├── components/           shared UI primitives
│   └── lib/
│       ├── agents/           AI Research Desk (Person 1)
│       ├── alpaca.ts         broker client (Person 3)
│       ├── auth.ts           passphrase + signed cookie (Person 3)
│       ├── contracts/        zod DTOs — cross-team handoffs
│       ├── data/             MarketDataProvider (Person 3)
│       ├── demo/             paper-trading walkthroughs
│       └── quant/            Quant Engine (Person 2)
├── docs/                     RESEARCH_API.md, agent-quant-integration.md
├── fixtures/                 seeded data for demos / tests
├── reports/                  generated analytics output
├── scripts/                  frontend-side dev helpers
├── test/                     Vitest + Playwright suites
├── docker-compose.yml        one-shot backend stack
├── railway.toml / nixpacks.toml  hosted deploy targets
├── .env.example              every env var, with safe defaults
├── AGENTS.md                 team ownership map & shared rules
└── CLAUDE.md                 points at AGENTS.md
```

## Team ownership map

One folder per workstream. Don't edit folders you don't own. Cross-layer
data shapes live in `src/lib/contracts/<domain>.ts`; each person adds
only their own domain file there.

| Path | Owner |
| --- | --- |
| `src/lib/agents/` | Person 1 — AI Research Desk (news/market/bull/bear agents, CIO orchestration, LLM config in `llm.ts`) |
| `src/app/api/research/` | Person 1 — streaming research pipeline endpoint (NDJSON events) |
| `src/lib/quant/` + `src/app/api/quant/` | Person 2 — Quant Engine (signals, strategies, backtesting) |
| `src/lib/risk/`, `src/lib/alpaca/` + `src/app/api/risk/`, `src/app/api/orders/`, `src/app/api/account/` | Person 3 — Portfolio/Risk/Execution |
| `src/lib/data/` | Person 3 implements `MarketDataProvider`; mock impl is the offline fallback used by Person 1's agents |
| `src/components/`, `src/app/page.tsx`, other `src/app/**` pages | Person 4 — Dashboard/UI |

Shared rules (full version in [`AGENTS.md`](AGENTS.md)):

- **Contracts first** — define handoff DTOs (zod) in `src/lib/contracts/`
  before wiring layers together.
- **`.env.example` documents every env var**; never commit real keys.
- **Before pushing**, run
  `npx next typegen && npx tsc --noEmit && npm run lint`.

## Quickstart

You'll need **Python 3.12+** and **Node 22+**. The backend is optional —
the frontend runs offline with the mock broker and a deterministic
fallback for the AI agents when no `GROQ_API_KEY` is set.

### 1. Backend (FastAPI)

```bash
cd backend
py -3.12 -m venv .venv
# Windows
.\.venv\Scripts\python.exe -m pip install -r requirements.txt
# macOS / Linux
source .venv/bin/activate && pip install -r requirements.txt

cp .env.example .env        # optional; defaults run the mock broker
.\.venv\Scripts\python.exe -m alembic upgrade head
.\.venv\Scripts\python.exe -m uvicorn app.main:app --reload
```

Interactive API docs: <http://127.0.0.1:8000/docs>
Live web dashboard: <http://127.0.0.1:8000/>

Or run the full stack in Docker:

```bash
docker compose up --build
```

### 2. Frontend (Next.js)

```bash
cp .env.example .env.local  # optional; defaults work for local dev
npm install
npm run dev                 # http://localhost:3000
```

The Next.js dev server replaces `create-next-app` defaults; the relevant
Next.js 16 docs ship inside the installed package at
`node_modules/next/dist/docs/` — read those before writing any new
framework code (see the warning in [`AGENTS.md`](AGENTS.md)).

### 3. Try it in 60 seconds

In one terminal, start the backend:

```bash
cd backend
.\.venv\Scripts\python.exe -m uvicorn app.main:app --reload
```

In another, run the guided walkthrough (proposes a trade, watches the
risk engine approve/adjust/reject it, ticks prices, and force-fills a
resting limit order):

```bash
cd backend
.\.venv\Scripts\python.exe scripts/demo.py
```

Then open the dashboard:

- FastAPI dashboard: <http://127.0.0.1:8000/>
- Next.js dashboard: <http://localhost:3000> (default passphrase: `ALPACA`)

## Configuration

All settings come from environment / `.env` (see `.env.example`).
Highlights:

| Var | Purpose |
| --- | --- |
| `BACKEND_API_URL` | Public URL the frontend uses to reach the FastAPI service. |
| `BACKEND_API_KEY` | Shared secret sent with frontend → backend calls (if enabled). |
| `NEXT_PUBLIC_BACKEND_WS_URL` | WebSocket endpoint for live events (default `ws://127.0.0.1:8000/events/ws`). |
| `PASSPHRASE` | Judge / shared passphrase for the dashboard login. |
| `AUTH_SESSION_SECRET` | HMAC key for the 7-day signed session cookie (generate with `openssl rand -hex 32`). |
| `GROQ_API_KEY` | Required for the AI Research Desk agents. Without it, the desk runs in deterministic offline/fallback mode. |
| `GROQ_MODEL`, `GROQ_BASE_URL` | Optional LLM overrides. |
| `ALPACA_API_KEY_ID`, `ALPACA_API_SECRET_KEY` | Optional. Enables live OHLCV bars and news headlines. Without them, the system falls back to synthetic GBM data. |
| `BROKER_MODE` (backend) | `mock` or `alpaca`. |
| `ALPACA_PAPER` (backend) | Must remain `true` when `BROKER_MODE=alpaca`. |
| Risk limits (backend) | `MAX_DAILY_LOSS_PERCENT`, `MAX_DRAWDOWN_PERCENT`, `MAX_POSITION_PERCENT`, `MAX_SECTOR_EXPOSURE_PERCENT`, `MIN_CASH_PERCENT` — all fractions of equity. |
| `QUANT_MIN_HISTORY_BARS`, `QUANT_MAX_GAP_BARS`, `QUANT_STALE_AFTER_INTERVALS` | Data-quality actionability thresholds. |
| `EXECUTION_BASE_SLIPPAGE_BPS`, `EXECUTION_MARKET_IMPACT_BPS_PER_1PCT_ADV`, `EXECUTION_MAX_MARKET_IMPACT_BPS`, `EXECUTION_COMMISSION_PER_SHARE`, `EXECUTION_FIXED_FEE` | Pre-trade cost model. |
| `SECTOR_MAP_JSON` | Optional `{"TICKER":"sector"}` override. |

> **Never commit real keys.** `.env.example` documents everything; your
> `.env.local` / `.env` is gitignored.

## Trade lifecycle

```
TRADE_PROPOSED
    └─▶ RISK_CHECK_STARTED
            ├─▶ TRADE_APPROVED    ──▶ ORDER_SUBMITTED ──▶ ORDER_FILLED    ──▶ POSITION_UPDATED
            ├─▶ TRADE_ADJUSTED    ──▶ ORDER_SUBMITTED ──▶ ORDER_FILLED    ──▶ POSITION_UPDATED
            └─▶ TRADE_REJECTED
                                   ORDER_CANCELED
```

Every step is published to the bus, persisted to the `events` table, and
fanned out to WebSocket subscribers.

## Risk engine rules

Checked in order; halts reject everything, soft caps scale the quantity
down (`ADJUSTED`) when at least one share fits.

| Code | Trigger |
| --- | --- |
| `DAILY_LOSS_HALT` | Day loss ≥ `MAX_DAILY_LOSS_PERCENT` × day-start equity |
| `DRAWDOWN_HALT` | Drawdown from peak equity ≥ `MAX_DRAWDOWN_PERCENT` |
| `POSITION_CAP` | Post-trade symbol value > `MAX_POSITION_PERCENT` × equity |
| `SECTOR_CAP` | Post-trade sector value > `MAX_SECTOR_EXPOSURE_PERCENT` × equity |
| `INSUFFICIENT_CASH` | Post-trade cash < `MIN_CASH_PERCENT` × equity |

Sells bypass concentration caps (they reduce exposure). Limit orders are
evaluated at their limit price; market orders at the live broker price.

## AI Research Desk

The dashboard's "Research" tab drives a multi-agent pipeline implemented
in `src/lib/agents/` and exposed at `src/app/api/research/`:

| Agent | Role |
| --- | --- |
| Sage | News & macro context |
| Vector | Quant signal summary |
| Atlas | Sector rotation |
| Mara | Crisis / drawdown watch |
| North | Long-horizon thesis |
| Sentinel | Risk flagging |
| Radar | Event-driven catalysts |
| Gauge | Valuation & fundamentals |
| Hedge | Pair / hedge ideas |
| Apex | Final synthesis & order proposal |

The CIO agent orchestrates the pipeline and writes the final trade plan.
Progress and reasoning stream to the client as **NDJSON** events
(`type: "agent_status" | "agent_token" | "agent_done" | "agent_error" |
"final"`). The full wire format is documented in
[`docs/RESEARCH_API.md`](docs/RESEARCH_API.md).

Without a `GROQ_API_KEY` the desk falls back to deterministic offline
output so the UI is fully usable for development and demos.

## Quant Engine

`src/lib/quant/` (frontend) and the `/quant/*` routes (backend) provide:

- **Data quality** (`dataQuality.ts`) — minimum history, gap detection,
  staleness, and an overall `actionable: true|false` verdict.
- **VaR / CVaR** (`var/route.ts`) — historical and parametric estimators.
- **Extreme value theory** (`extremeValue.ts`) — tail risk modeling.
- **Strategies** (`strategies.ts`) — pluggable signal → position logic.
- **Execution cost** — pre-trade preview of slippage, market impact,
  commission, and all-in notional (`POST /quant/execution-cost`).

## Dashboard

`src/app/page.tsx` is the operator console. It polls the backend for
portfolio / orders / risk state, subscribes to the WebSocket event feed,
and renders each `AGENT_STATUS` payload to a mascot animation. Other
pages cover login (`/login`), the landing variant (`/home`), and the
detailed section views (research, quant, risk, orders, account).

The login flow is a single shared passphrase (`PASSPHRASE`) minted into
a 7-day signed session cookie by `src/lib/auth.ts`.

## API reference (summary)

The FastAPI surface is documented in full at `/docs` when the backend
is running. A high-level map:

| Method | Path | Description |
| --- | --- | --- |
| GET | `/health` | Liveness + broker mode |
| GET | `/` | Live web dashboard (polls REST + streams WS events) |
| POST | `/trades/propose` | Submit a `TradeProposal`; risk-checked then executed if approved |
| POST | `/trades/execute` | Re-run risk + execution for a stored proposal id |
| POST | `/trades/cancel` | Cancel by order id (body) |
| GET | `/trades/proposals` | Proposal history (`?limit=`) |
| GET | `/orders` | Local order audit trail (`?limit=&status=`) |
| GET | `/orders/{id}` | Single order (refreshes from broker when open) |
| DELETE | `/orders/{id}` | Cancel an open order |
| GET | `/portfolio` | Live snapshot (`?persist=true` to store it) |
| GET | `/portfolio/positions` | Current positions with sector + weight |
| GET | `/portfolio/history` | Stored snapshots (oldest first) |
| GET | `/portfolio/account` | Broker account (equity / cash / buying power) |
| GET | `/risk/status` | Limits echo, live metrics, halt flags |
| GET | `/events` | Event history (`?limit=&type=`) |
| GET | `/events/recent` | In-memory buffer (no DB read) |
| WS | `/events/ws` | Live event stream (one JSON object per event) |
| GET | `/market/{symbol}` | Current broker quote |
| POST | `/quant/data-quality` | Validate OHLCV history and return actionability metadata |
| POST | `/quant/execution-cost` | Preview slippage, market impact, commission, and all-in notional |
| POST | `/agents/status` | Publish agent lifecycle status to the event bus |
| POST | `/admin/reset` | Wipe mock broker + all local tables (mock mode only) |
| POST | `/admin/tick` | Advance mock prices once; fill crossed limits (mock only) |
| POST | `/admin/fill-now/{id}` | Force-fill a resting limit order (mock only) |

Errors share one envelope: `{"error": {"code", "message", "details?"}}`.

The frontend adds the streaming surface at `POST /api/research`, which
returns NDJSON.

## WebSocket events

`/events/ws` emits one JSON object per transition. The shape is
documented in `backend/app/schemas/`, but the common fields are:

```json
{
  "id": "evt_...",
  "type": "ORDER_FILLED",
  "ts": "2026-09-04T17:09:47Z",
  "payload": { "...": "..." }
}
```

`AGENT_STATUS` payloads map directly to the dashboard mascot:

```json
{
  "agent_id": "bull-agent-v1",
  "role": "bull",
  "status": "thinking",
  "run_id": "run-123",
  "progress": 42
}
```

## Data quality & execution cost

Before any quant strategy is allowed to fire, its underlying series is
fed through `POST /quant/data-quality`, which returns:

- `actionable: true|false` — overall verdict
- `history_bars`, `min_history_bars`
- `largest_gap_bars`, `max_gap_bars`
- `stale: true|false`, `stale_after_intervals`
- `issues: string[]` — human-readable diagnostics

`POST /quant/execution-cost` returns a conservative pre-trade preview:

- `slippage_bps` — base slippage scaled by participation
- `market_impact_bps` — capped at `EXECUTION_MAX_MARKET_IMPACT_BPS`
- `commission_per_share` + `fixed_fee`
- `all_in_notional` — total cost including the fill

## Testing

```bash
# Backend
cd backend
.\.venv\Scripts\python.exe -m pytest -q          # full unit + API + WS suite

# Frontend
npm test                # vitest
npm run lint            # eslint
npx tsc --noEmit        # type-check
npx next typegen        # regenerate Next.js type bindings

# End-to-end
npx playwright test
```

CI should run, at minimum: `pytest -q`, `npm run lint`, `npx tsc --noEmit`,
`npx next typegen`, and the Playwright suite.

## Deployment

The Next.js dashboard is the only piece designed to be exposed to the
public internet — and it should only talk to the backend over the
documented REST + WebSocket surface. Deployment configuration is managed
outside this repository; in the hosting environment, set:

- `BACKEND_API_URL`
- `BACKEND_API_KEY`
- `NEXT_PUBLIC_BACKEND_WS_URL`

Keep broker and model credentials in environment secrets; never commit
them. **`ALPACA_PAPER` must remain `true` when `BROKER_MODE=alpaca`.**

This repo ships two deployment descriptors:

- `docker-compose.yml` — one-shot local stack (backend + supporting
  services).
- `railway.toml` + `nixpacks.toml` — hosted backend target.

## Project conventions

- **TypeScript everywhere on the frontend** — `strict: true` is enforced
  via `tsconfig.json`. New routes must come with their zod contract in
  `src/lib/contracts/` first.
- **No comments in code unless asked** — code should be self-documenting.
- **One folder per workstream** — see the ownership map above.
- **Async/await, never `.then` chains** in React Server Components.
- **Errors share one envelope** on the backend:
  `{"error": {"code", "message", "details?"}}`.
- **Events are the source of truth** — anything that mutates state
  emits an event; the dashboard rebuilds by replaying the stream.

## Security

- **No live trading.** The backend refuses to start if a non-paper
  broker endpoint is detected.
- **Passphrase login** keeps the dashboard out of the public's hands;
  rotate `AUTH_SESSION_SECRET` if you suspect leakage.
- **Secrets in environment only** — `.env.local`, hosting env, or a
  secrets manager. Never in source.
- **CORS, rate limiting, and auth middleware** are configured in
  `backend/app/api/deps.py` — keep them enabled in any non-local deploy.
- **Audit trail is permanent** — every order and risk decision is
  persisted. Don't add code paths that mutate portfolio state without
  emitting an event.

## Roadmap

- Pluggable broker interface — add a second live-paper provider behind
  the existing `BrokerService` ABC.
- Backtesting UI in the dashboard, driven by the existing
  `src/lib/quant/strategies.ts` engine.
- Walk-forward evaluation of the AI Research Desk against historical
  regime windows.
- SSO and per-user portfolios for a hosted deployment.

## License

This project is released under the **MIT License** — see
[`LICENSE`](LICENSE) for the full text.

## Acknowledgements

- [Next.js](https://nextjs.org) — App Router + Server Components.
- [FastAPI](https://fastapi.tiangolo.com) + [SQLAlchemy 2.0](https://docs.sqlalchemy.org) + [Alembic](https://alembic.sqlalchemy.org).
- [Vercel AI SDK](https://sdk.vercel.ai) and [Groq](https://groq.com) for
  the research-desk LLM.
- [Alpaca](https://alpaca.markets) for paper-trading and market data.
- [Tailwind CSS](https://tailwindcss.com) for the dashboard styling.
- [Vitest](https://vitest.dev) and [Playwright](https://playwright.dev)
  for the test pyramid.
