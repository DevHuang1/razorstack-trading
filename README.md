# Alpaca AI Trading Backend

Risk-gated trading backend for AI agents: proposals are risk-checked,
executed against a mock or Alpaca paper broker, and streamed as events.

See [`backend/README.md`](backend/README.md) for the full documentation.

```bash
docker compose up --build     # API on http://localhost:8000/docs
```

## Frontend scaffold (Next.js)

This is a [Next.js](https://nextjs.org) project bootstrapped with [`create-next-app`](https://nextjs.org/docs/app/api-reference/cli/create-next-app).

First, run the development server:

```bash
npm run dev
# or
yarn dev
# or
pnpm dev
# or
bun dev
```

Open [http://localhost:3000](http://localhost:3000) with your browser to see the result.
