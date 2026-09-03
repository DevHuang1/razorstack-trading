import type { NextRequest } from "next/server";
import { getAlpacaCredentials } from "@/lib/quant/datafeed/alpaca";

export const dynamic = "force-dynamic";

const DATA_BASE = "https://data.alpaca.markets";
const PAPER_TRADING_BASE = "https://paper-api.alpaca.markets";
const REQUEST_TIMEOUT_MS = 10000;

const ENDPOINTS = {
  clock: { url: `${PAPER_TRADING_BASE}/v2/clock`, forward: false },
  account: { url: `${PAPER_TRADING_BASE}/v2/account`, forward: false },
  positions: { url: `${PAPER_TRADING_BASE}/v2/positions`, forward: false },
  bars: { url: `${DATA_BASE}/v2/stocks/bars`, forward: true },
  quote: { url: `${DATA_BASE}/v2/stocks/quotes/latest`, forward: true },
  trade: { url: `${DATA_BASE}/v2/stocks/trades/latest`, forward: true },
  snapshot: { url: `${DATA_BASE}/v2/stocks/snapshots`, forward: true },
  news: { url: `${DATA_BASE}/v1beta1/news`, forward: true },
} as const;

type EndpointName = keyof typeof ENDPOINTS;

function parseEndpoint(raw: string | null): EndpointName | null {
  const name = raw?.trim() as EndpointName | undefined;
  if (!name || !(name in ENDPOINTS)) return null;
  return name;
}

export async function GET(request: NextRequest) {
  const creds = getAlpacaCredentials();
  if (!creds) {
    return Response.json(
      {
        ok: false,
        error:
          "Alpaca credentials missing. Set ALPACA_API_KEY_ID and ALPACA_API_SECRET_KEY in .env.local.",
      },
      { status: 500 },
    );
  }

  const params = request.nextUrl.searchParams;
  const endpoint = parseEndpoint(params.get("endpoint"));
  if (!endpoint) {
    return Response.json(
      {
        ok: false,
        error: `Unknown or missing "endpoint". Valid values: ${Object.keys(ENDPOINTS).join(", ")}.`,
      },
      { status: 400 },
    );
  }

  const config = ENDPOINTS[endpoint];
  const url = new URL(config.url);
  if (config.forward) {
    for (const [key, value] of params.entries()) {
      if (key === "endpoint" || !value) continue;
      url.searchParams.set(key, value);
    }
    if (!url.searchParams.has("feed")) {
      url.searchParams.set("feed", process.env.ALPACA_DATA_FEED ?? "iex");
    }
  }
  if (endpoint === "bars" && !url.searchParams.has("limit")) {
    url.searchParams.set("limit", "10");
  }
  if ((endpoint === "quote" || endpoint === "trade") && !url.searchParams.has("symbols")) {
    url.searchParams.set("symbols", "AAPL");
  }
  if (endpoint === "news" && !url.searchParams.has("limit")) {
    url.searchParams.set("limit", "5");
  }

  try {
    const res = await fetch(url, {
      headers: {
        "APCA-API-KEY-ID": creds.keyId,
        "APCA-API-SECRET-KEY": creds.secretKey,
      },
      signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
      cache: "no-store",
    });
    const text = await res.text();
    let body: unknown;
    try {
      body = JSON.parse(text);
    } catch {
      body = text.slice(0, 2000);
    }
    return Response.json({
      ok: res.ok,
      status: res.status,
      requestUrl: url.toString(),
      body,
    });
  } catch (err) {
    const message =
      err instanceof Error && err.name === "TimeoutError"
        ? `Request to ${url.host} timed out after ${REQUEST_TIMEOUT_MS / 1000}s (network/firewall may be blocking this host).`
        : err instanceof Error
          ? err.message
          : "Network request failed.";
    return Response.json({ ok: false, requestUrl: url.toString(), error: message });
  }
}
