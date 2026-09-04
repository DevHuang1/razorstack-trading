# AI Research Layer — Public Interface

The AI research layer exposes exactly one entry point for downstream services:

```
analyzeOpportunity(input) -> TradeProposal
```

It runs the five-agent desk (MarketResearch → News → Bull ∥ Bear → InvestmentCommittee)
and returns a fully structured, JSON-serializable research proposal.

**Boundary guarantee:** this layer identifies opportunities and concerns only. It does NOT
calculate or enforce risk limits, position sizes or approvals. The Portfolio/Risk/Execution
layer receives the proposal and independently decides whether to approve it. Nothing in this
layer places orders or contacts a broker.

## 1. Input

```ts
// src/lib/agents/analyze-opportunity.ts
import { analyzeOpportunity } from "@/lib/agents/analyze-opportunity";

const proposal = await analyzeOpportunity({
  symbol: "NVDA",
  marketData: MarketSnapshot,        // OHLC-adjacent snapshot: price, SMAs, RSI, vol, sector...
  news: NewsItem[],                  // pre-fetched articles with source + sentiment
  portfolioContext?: PortfolioContext, // optional book context: positions, sector exposure, trades
});
```

Schemas (zod, the TS equivalent of Pydantic): `AnalyzeOpportunityInputSchema`,
`MarketSnapshotSchema`, `NewsItemSchema`, `PortfolioContextSchema` — all in
`src/lib/contracts/research.ts`. Malformed input throws before any agent runs.

Without a `GROQ_API_KEY` (or the legacy `XAI_API_KEY` / `GROK_API_KEY` /
`OPENAI_API_KEY` alias) the
desk runs fully offline in deterministic mock mode
(same input ⇒ same output), which is what the committed fixture relies on.

## 2. Output wire format (stable contract)

Downstream systems should consume the serialized form, produced by:

```ts
import { serializeTradeProposalToJson, parseTradeProposalJson } from "@/lib/agents/analyze-opportunity";

const json = serializeTradeProposalToJson(proposal); // string, pretty-printed
const wire = parseTradeProposalJson(json);           // validated re-parse for consumers
```

Wire keys are snake_case; `confidence` is on a 0–1 scale. Validated by
`TradeProposalWireSchema`.

| Field | Type | Notes |
|---|---|---|
| `symbol` | string | |
| `action` | enum | `BUY`, `SELL`, `HOLD`, `NO_TRADE` |
| `strategy` | enum id | e.g. `bull_call_spread` (a defined-risk bullish structure), `no_trade` |
| `instrument` | object \| null | Full option instrument **or null**. Pricing is never invented: without an option chain in the input it stays null and the execution layer derives/fills it |
| `thesis` | string | Human-readable synthesis incl. the not-executable disclaimer |
| `confidence` | number 0–1 | Committee conviction (advocate agreement × evidence quality) |
| `supporting_factors` | `{kind, statement}[]` | `kind`: `observation` (grounded fact) or `interpretation` |
| `contradicting_factors` | `{kind, statement}[]` | Evidence against the leading thesis |
| `risks` | `{kind, statement}[]` | Strongest risks across both sides |
| `invalidation_conditions` | string[] ≥ 1 | What observed change would kill the thesis |
| `portfolio_considerations` | `{kind, statement}[]` | Advisory only — e.g. concentration risk, new-sector exposure |
| `requires_risk_approval` | literal `true` | Schema-enforced; cannot be false |
| `generated_at` | ISO timestamp | When this wire document was serialized (pass `{generatedAt}` to pin it in tests) |

Example: [`fixtures/trade-proposal.example.json`](../fixtures/trade-proposal.example.json),
generated from [`fixtures/analyze-opportunity.example-input.json`](../fixtures/analyze-opportunity.example-input.json).

## 3. Consuming from another service

**Option A — same TypeScript monorepo:** call `analyzeOpportunity()` directly.

**Option B — any language / separate process:** exchange the JSON document over your
transport of choice (queue, file, HTTP body). Validate before acting:

```py
# Python consumer example (e.g. the Risk Engine)
import json, pydantic

class Statement(pydantic.BaseModel):
    kind: str          # "observation" | "interpretation"
    statement: str

class TradeProposal(pydantic.BaseModel):
    symbol: str
    action: str                        # BUY | SELL | HOLD | NO_TRADE
    strategy: str
    instrument: dict | None            # null => derive pricing yourself
    thesis: str
    confidence: float                  # 0..1
    supporting_factors: list[Statement]
    contradicting_factors: list[Statement]
    risks: list[Statement]
    invalidation_conditions: list[str]
    portfolio_considerations: list[Statement]
    requires_risk_approval: bool       # will always be True

wire = TradeProposal.model_validate_json(raw_text)
assert wire.requires_risk_approval   # independent gate — do not trust, verify
# ... run YOUR risk checks here; approval/rejection is entirely your decision ...
```

A proposal must never be treated as approved, executed or executable. `NO_TRADE`
proposals carry `strategy: "no_trade"` and `instrument: null`.

## 4. Testing

```bash
npx vitest run src/lib/agents/analyze-opportunity.test.ts
```

Covers: end-to-end mock-mode run, golden-fixture determinism, wire-shape pinning,
JSON round-trip, and rejection of tampered proposals (`requires_risk_approval: false`
fails schema validation on both serialize and consume sides).

## 5. Streaming endpoint (NDJSON)

`POST /api/research` — body is either a full input document (section 1) or
`{"symbol": "NVDA"}` to have the server assemble the input from the configured
`MarketDataProvider`. `GET /api/research?symbol=NVDA` is equivalent for quick checks.
Note: the symbol-only paths run without portfolio context, so portfolio-aware
analysis (concentration considerations, HOLD-on-position) requires POSTing a full
input document that includes `portfolioContext`.

Response is newline-delimited JSON, one event per line. Every line validates
against `PipelineEventSchema` (exported from `src/lib/contracts/research.ts`):

| Event | Payload |
| --- | --- |
| `status` | `{step, detail}` — step lifecycle markers |
| `market_analysis` | `{analysis}` — internal camelCase research artifact |
| `news_analysis` | `{analysis}` — internal camelCase research artifact |
| `agent_opinion` | `{role: "bull" \| "bear", opinion}` — internal camelCase artifact |
| `trade_proposal` | `{proposal}` — final artifact in the **stable wire format of section 2** |
| `error` | `{step, message}` — terminal; no further events follow |
| `done` | `{}` |

The `trade_proposal` payload is exactly what `serializeTradeProposalToJson`
produces for the same run (same snake_case shape, 0–1 confidence,
`generated_at`), so frontend consumers can render progress from early events and
hand the last `trade_proposal` straight to the risk layer without reshaping.
