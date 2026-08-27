# Alpaca AI Trading Backend

FastAPI backend that lets AI trading agents propose trades, runs every proposal
through a deterministic risk engine, executes approved orders against a broker
(AI-focused mock or Alpaca paper trading), and streams the full lifecycle as
events over REST and WebSocket.

```
AI agent ──POST /trades/propose──▶ Risk Engine ──approve──▶ Broker (mock/Alpaca)
                                     │                          │
                                     ▼                          ▼
                              risk_decisions table         orders / positions
                                     │                          │
                                     └──────── EventBus ◀───────┘
                                          │            │
                                    events table   WS /events/ws
```

## Quickstart

```powershell
cd backend
py -3.12 -m venv .venv
.\.venv\Scripts\python.exe -m pip install -r requirements.txt
copy .env.example .env        # optional; defaults run the mock broker
.\.venv\Scripts\python.exe -m alembic upgrade head
.\.venv\Scripts\python.exe -m uvicorn app.main:app --reload
```

Interactive docs: http://127.0.0.1:8000/docs

Docker:

```bash
docker compose up --build
```

## API

| Method | Path | Description |
|---|---|---|
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
| GET | `/portfolio/account` | Broker account (equity/cash/buying power) |
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

Errors use one envelope: `{"error": {"code", "message", "details?"}}`.

## Try it in 60 seconds

```powershell
# terminal 1
.\.venv\Scripts\python.exe -m uvicorn app.main:app --reload

# terminal 2 — guided walkthrough: approved / adjusted / rejected / tick-filled
.\.venv\Scripts\python.exe scripts\demo.py

# then open the dashboard and watch events stream live:
start http://127.0.0.1:8000/
```

## Trade lifecycle

`TRADE_PROPOSED → RISK_CHECK_STARTED → TRADE_APPROVED | TRADE_ADJUSTED | TRADE_REJECTED
→ ORDER_SUBMITTED → ORDER_FILLED | ORDER_CANCELED → POSITION_UPDATED`

Every step is published to the bus, persisted to the `events` table and fanned
out to WebSocket subscribers. Agent lifecycle updates use `AGENT_STATUS` events
with a payload such as `{"agent_id":"bull-agent-v1","role":"bull","status":"thinking","run_id":"run-123","progress":42}`;
the frontend maps `idle`, `thinking`, `speaking`, `success`, and `error` directly
to mascot animation states.

## Risk engine rules

Checked in order; halts reject everything, soft caps scale the quantity down
(`ADJUSTED`) when at least one share fits:

| Code | Trigger |
|---|---|
| `DAILY_LOSS_HALT` | Day loss ≥ `MAX_DAILY_LOSS_PERCENT` of day-start equity |
| `DRAWDOWN_HALT` | Drawdown from peak equity ≥ `MAX_DRAWDOWN_PERCENT` |
| `POSITION_CAP` | Post-trade symbol value > `MAX_POSITION_PERCENT` × equity |
| `SECTOR_CAP` | Post-trade sector value > `MAX_SECTOR_EXPOSURE_PERCENT` × equity |
| `INSUFFICIENT_CASH` | Post-trade cash < `MIN_CASH_PERCENT` × equity |

Sells bypass concentration caps (they reduce exposure). Limit orders are
evaluated at their limit price; market orders at the live broker price.

## Configuration

All settings come from environment / `.env` (see `.env.example`). Highlights:

- `BROKER_MODE=mock|alpaca` — mock needs no credentials; alpaca requires
  `ALPACA_API_KEY` / `ALPACA_SECRET_KEY` (paper by default).
- `DATABASE_URL` — any SQLAlchemy async driver; default SQLite.
- Risk limits as fractions of equity (0.15 = 15%).
- `QUANT_MIN_HISTORY_BARS`, `QUANT_MAX_GAP_BARS`, and `QUANT_STALE_AFTER_INTERVALS` control data-quality actionability.
- `EXECUTION_BASE_SLIPPAGE_BPS`, `EXECUTION_MARKET_IMPACT_BPS_PER_1PCT_ADV`, `EXECUTION_MAX_MARKET_IMPACT_BPS`, `EXECUTION_COMMISSION_PER_SHARE`, and `EXECUTION_FIXED_FEE` configure conservative pre-trade cost estimates.
- `SECTOR_MAP_JSON` — optional `{"TICKER":"sector"}` override.

## Development

```powershell
.\.venv\Scripts\python.exe -m pytest -q          # 41 tests
.\.venv\Scripts\python.exe -m alembic revision --autogenerate -m "..."
.\.venv\Scripts\python.exe -m alembic upgrade head
```

Layout:

```
app/
  api/        routers + deps (health, trades, orders, portfolio, risk, events)
  core/       settings, JSON logging, error envelope
  db/         async engine/session, UTCDateTime base
  events/     EventBus (persist + fan-out)
  integrations/  BrokerService ABC, MockAlpacaService, AlpacaService
  models/     6 tables (SQLAlchemy 2.0 style)
  schemas/    Pydantic contracts shared with AI/frontend teams
  services/   portfolio analytics, risk engine, order manager, trading flow
alembic/      migrations (async env)
tests/        unit + API + WebSocket integration suite
```
