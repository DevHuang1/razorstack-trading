# Quantitative Strategy Engine — Build Notes & Roadmap

Owner: Person 2 (Quant Engineer)

This document covers what the Quant Engine does today and what remains to reach the
full spec in the project brief ("What does the measurable data say?" layer that sits
between the AI Research Desk and the Portfolio/Risk Manager).

---

## 1. What is built

All code lives in `src/lib/quant/` plus one API route and one dashboard page.
Zero external dependencies — every indicator is hand-rolled TypeScript.

### File map

| File | Purpose |
| --- | --- |
| `src/lib/quant/types.ts` | Shared contracts: `Bar`, `QuantSignal`, `MarketRegime`, `StrategyVote`, `RiskMetrics`, `SignalResponse` |
| `src/lib/quant/indicators.ts` | Pure math: SMA, EMA, RSI(14) Wilder, ROC, stdev/daily returns, rolling realized vol + percentile rank, ATR(14), Bollinger bands, relative volume, OBV, drawdown stats, Pearson correlation, EMA slope |
| `src/lib/quant/engine.ts` | Aggregates indicator components into a signed score -> `BUY/SELL/HOLD` + strength % |
| `src/lib/quant/strategies.ts` | Strategy runners + registry (`runStrategies`, `getStrategy`, add new ones here) |
| `src/lib/quant/performance.ts` | Walk-forward backtest per strategy (win rate, avg/cum return, Sharpe, max DD) |
| `src/lib/quant/regime.ts` | Benchmark trend x volatility-percentile regime with `riskMultiplier` and `crisis` flag |
| `src/lib/quant/datafeed/alpaca.ts` | Alpaca Market Data v2 bars client (env-key auth, timeout, sorted ascending) |
| `src/lib/quant/datafeed/synthetic.ts` | Deterministic seeded synthetic OHLCV for offline demos (flagged `SYNTHETIC`) |
| `src/lib/quant/datafeed/index.ts` | `getBars()`: Alpaca if keys present and >= 60 bars, else synthetic fallback |
| `src/app/api/quant/signal/route.ts` | GET (live/computed signals) + POST (compute from externally supplied bars) |
| `src/app/quant/page.tsx` | Quant Desk dashboard for demos |

### Signal pipeline

Five weighted components, each a signed score in [-1, 1] (+1 bullish, -1 bearish):

| Component | Weight | Inputs |
| --- | --- | --- |
| Momentum | 0.30 | tanh-blended ROC over 5/10/21 days, normalized by recent daily vol |
| Trend | 0.30 | price vs SMA20/SMA50/SMA200 stack, SMA crossovers, EMA20 slope |
| Volume | 0.15 | relative volume (vs 20d avg) confirming direction of 5d move |
| Mean-Reversion bias | 0.15 | contrarian RSI stretch + Bollinger band touches |
| Volatility quality | 0.10 | inverse percentile of current realized vol within its own history |

Overall = weighted sum, clamped to [-1, 1].
Direction thresholds: > +0.06 BUY, < -0.06 SELL, else HOLD.
Strength = |score| * 150 capped at 100.

Every signal also carries `riskMetrics`: realized vol (annualized + percentile),
ATR %, max/current drawdown (1y window), 20d Sharpe, average dollar-volume.

### Market regime

Computed from a benchmark (default SPY): MA-stack trend score crossed with the
vol percentile of its own trailing history.

| Vol percentile | Label | riskMultiplier |
| --- | --- | --- |
| >= 0.90 | CRISIS | 0.00 (crisis=true) |
| >= 0.70 | VOLATILE | 0.50 |
| <= 0.30 | QUIET | 1.25 |
| else | NORMAL | 1.00 |

`regime.crisis` + `riskMultiplier` are the hand-off points for Person 3's Risk
Engine / AI Crisis Room: when the benchmark vol is in its top decile the engine
already says "size to zero".

### Strategies

Implemented runners (each returns `{direction, strength, rationale}`):

- **MOMENTUM** — ROC(10)/ROC(21), SMA20/50 alignment, RSI filter (backs off above 75)
- **MEAN_REVERSION** — Bollinger band pierce + RSI oversold/overbought stretch

Registry pattern: implement `StrategyDefinition.evaluate(bars)` and register it in
`strategies.ts`; engine, dashboard, and backtester pick it up automatically.

### Datafeed

- Env vars: `ALPACA_API_KEY_ID` + `ALPACA_API_SECRET_KEY` (or `APCA_*` variants).
  Optional `ALPACA_DATA_FEED` (default `iex` — works on free accounts).
- No keys / fetch failure / short history -> deterministic synthetic bars for the
  current UTC day, always flagged `"source": "SYNTHETIC"` so demo data is never
  mistaken for real data.

### API contract

`GET /api/quant/signal?symbols=NVDA,AAPL&timeframe=1Day&limit=300&benchmark=SPY`

```jsonc
{
  "generatedAt": "...",
  "source": "ALPACA" | "SYNTHETIC",
  "regime": { "label": "BULL_TREND / NORMAL", "crisis": false, "riskMultiplier": 1.25, "...": "..." },
  "signals": [
    {
      "symbol": "NVDA",
      "price": 450.97,
      "components": [{ "name": "Momentum", "score": 0.661, "weight": 0.3, "detail": "..." }],
      "overall": { "direction": "BUY", "score": 0.339, "strength": 51 },
      "strategies": [{ "id": "MOMENTUM", "direction": "BUY", "strength": 0.98, "rationale": "..." }],
      "riskMetrics": { "realizedVolAnnualized": 97, "atrPct": 3.1, "maxDrawdownPct": 22.4, "...": "..." }
    }
  ]
}
```

`POST /api/quant/signal` accepts `{ symbol, bars[], benchmarkBars? }` and computes
from supplied OHLCV (`source: "EXTERNAL"`). Useful for tests and for Person 1 to
feed curated data.

### Verified

- `tsc --noEmit`, ESLint, `next build` all clean.
- Live smoke test: GET returns full payload, POST validates input (400 on < 30 bars),
  invalid symbols rejected, `/quant` renders.
- Tested against synthetic bars only so far — the Alpaca path is written but not yet
  exercised with real credentials.

---

## 2. Gap analysis vs the project spec

| Spec item | Status |
| --- | --- |
| Momentum | Done (component + strategy) |
| RSI | Done (indicator + mean-reversion usage) |
| Moving averages | Done (SMA 20/50/200, EMA 20 slope) |
| Volume | Done (relative-volume confirmation) |
| Volatility | Done (realized vol percentile, ATR%) |
| Trend | Done (MA stack + slopes) |
| Drawdown | Done (max + current, 1y window) |
| Market regime | Done (trend x vol, crisis flag, size multiplier) |
| Historical performance | Partially — on-demand walk-forward backtest; no persisted tracking |
| Correlation | Partially — function exists, not exposed through any API yet |
| Options metrics | Not started (needs Alpaca options data) |
| Strategies: Momentum | Done |
| Strategies: Mean Reversion | Done |
| Strategies: News | Not started (quant-side hook missing; depends on AI desk sentiment) |
| Strategies: Value | Not started (needs fundamentals source or proxies) |
| Strategies: Options | Not started |
| Strategy performance tracked | Partially — recomputable, no persistence or live paper-tracking |

---

## 3. Remaining work (prioritized)

### P0 — before wiring into the team demo

1. **Validate the Alpaca path with real keys.** Put `ALPACA_API_KEY_ID` /
   `ALPACA_API_SECRET_KEY` in `.env.local`, hit the endpoint, confirm `source: "ALPACA"`
   and sane values. Coordinate feed choice (`iex` vs `sip`) with Person 3's plan.
2. **Correlation endpoint.** Expose `indicators.correlation` via e.g.
   `GET /api/quant/correlation?symbols=A,B,C` returning a return-correlation matrix.
   The Risk Engine needs this for sector-concentration checks.
3. **Unit tests.** No test framework is installed yet. Add `node:test` or vitest;
   cover RSI against known reference values, SMA/EMA edges, engine determinism,
   POST route validation.
4. **Persist strategy performance.** Currently `backtestStrategy()` runs on demand
   from bars. Snapshot results to a JSON/KV store keyed by symbol+strategy+date so
   the Arena leaderboard survives restarts and doesn't drift.

### P1 — full spec parity

5. **Options metrics module.** IV rank/percentile, expected move, put/call volume
   ratio via Alpaca options snapshot/bars endpoints; surface in `QuantSignal`.
6. **Options strategy runner.** e.g. bullish trend + elevated IV rank suggests a
   call *spread* (defined-risk); emit structured legs so Person 3 can size/approve
   and Alpaca can execute multi-leg orders.
7. **Value strategy runner.** Quant proxies until fundamentals are available:
   distance from 200d/week MA, long-horizon ROC z-score, or plug in a fundamentals API.
8. **News strategy quant hook.** Accept sentiment scores from the AI Research Desk
   (extend POST body with `sentiment`), normalize into a [-1, 1] vote with decay over
   days-since-news, so News competes fairly in the Arena.
9. **Live paper-tracking.** Daily cron/route that records each strategy's signal and
   forward outcome into the performance store (real tracking instead of re-backtest).

### P2 — polish for judges

10. **Weight tuning.** Small CLI/script that grid-searches component weights and
    thresholds against the backtest harness; record chosen config.
11. **Intraday timeframes.** Annualization factors for 1Min-1Hour exist but are
    untested; verify bar counts and session alignment.
12. **Bars caching.** Cache Alpaca responses (~5 min TTL) to avoid rate limits
    during live demos.
13. **Sector-relative scoring.** Score symbols vs their sector ETF instead of only
    absolute readings; feeds better concentration logic downstream.
14. **Dashboard upgrades.** Equity-curve charts per strategy once the performance
    store exists; sparkline of recent closes per card.

### Known limitations to disclose honestly

- Backtest assumes fixed-horizon exits, no slippage/fees/borrow costs, and treats
  SELL votes as short positions (may not be executable in a cash account).
- Sharpe figures come from small samples; treat as directional only.
- `iex` feed is a partial market picture vs `sip`.
- Synthetic mode is for UI/demo only — every consumer should branch on `source`.

---

## 4. Running it

```bash
npm run dev
# Dashboard: http://localhost:3000/quant
# API:       http://localhost:3000/api/quant/signal?symbols=NVDA,AAPL

# Optional live data
echo 'ALPACA_API_KEY_ID=...'     >> .env.local
echo 'ALPACA_API_SECRET_KEY=...' >> .env.local
```
