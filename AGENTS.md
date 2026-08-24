<!-- BEGIN:nextjs-agent-rules -->

# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` (resolved from this file's directory; in monorepos the `next` package may not be visible from the repo root) before writing any code. Heed deprecation notices.

This block is written and re-added by `next dev` — verify at `node_modules/next/dist/server/lib/generate-agent-files.js`. Removing it from a diff only re-creates the uncommitted change; committing it with your work keeps the tree clean.

<!-- END:nextjs-agent-rules -->

# Team Ownership Map

One folder per workstream — do not edit folders you don't own. Cross-layer data
shapes live in `src/lib/contracts/<domain>.ts`; each person adds only their own
domain file there.

| Path | Owner |
| --- | --- |
| `src/lib/agents/` | Person 1 — AI Research Desk (news/market/bull/bear agents, CIO orchestration, LLM config in `llm.ts`) |
| `src/app/api/research/` | Person 1 — streaming research pipeline endpoint (NDJSON events) |
| `src/lib/quant/` + `src/app/api/quant/` | Person 2 — Quant Engine (signals, strategies, backtesting) |
| `src/lib/risk/`, `src/lib/alpaca/` + `src/app/api/risk/`, `src/app/api/orders/`, `src/app/api/account/` | Person 3 — Portfolio/Risk/Execution |
| `src/lib/data/` | Person 3 implements `MarketDataProvider`; mock impl is the offline fallback used by Person 1's agents |
| `src/components/`, `src/app/page.tsx`, other `src/app/**` pages | Person 4 — Dashboard/UI |

Shared rules:

- Contracts first: define handoff DTOs (zod) in `src/lib/contracts/` before wiring layers together.
- `.env.example` documents every env var; never commit real keys.
- Run `npx next typegen && npx tsc --noEmit && npm run lint` before pushing.
