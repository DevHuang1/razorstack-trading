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

## Deployment

The frontend and API are deployable as separate services:

1. Create a Render Blueprint from [`render.yaml`](render.yaml). It deploys the
   FastAPI API from `backend/`, uses `/health` for health checks, and persists
   the mock broker SQLite data on a mounted disk.
2. Set Render's `CORS_ORIGINS` to the exact Vercel deployment URL (comma
   separated if more than one).
3. Import this repository into Vercel. The included [`vercel.json`](vercel.json)
   configures the Next.js build. Set `BACKEND_API_URL` to the Render HTTPS URL
   and `NEXT_PUBLIC_BACKEND_WS_URL` to its `wss://.../events/ws` URL.
4. Set the same strong value for Render's `API_KEY` and Vercel's
   `BACKEND_API_KEY`. Add `XAI_API_KEY` and Alpaca credentials only in the
   provider dashboards; never commit them. Render starts safely in mock mode
   unless `BROKER_MODE` is explicitly changed to `alpaca`.

For production trading, replace the default SQLite configuration with a
managed PostgreSQL setup and set a strong `API_KEY` before enabling Alpaca.
