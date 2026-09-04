# Razorstack Trading

Responsive quantitative research and paper-trading workspace. Market candles
and news may use live Alpaca data, but order execution is restricted to mock or
Alpaca paper environments. Live-money trading is rejected at application startup.

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

## Deployment configuration

Deployment infrastructure is managed outside this repository. Configure
`BACKEND_API_URL`, `BACKEND_API_KEY`, and `NEXT_PUBLIC_BACKEND_WS_URL` in the
hosting environment. Keep broker and model credentials in environment secrets;
never commit them. `ALPACA_PAPER` must remain `true` when `BROKER_MODE=alpaca`.
