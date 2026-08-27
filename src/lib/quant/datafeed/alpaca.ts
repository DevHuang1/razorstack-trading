import type { Bar } from "../types";

const DEFAULT_FEED = "iex";
const REQUEST_TIMEOUT_MS = 8000;

interface AlpacaBar {
  t: string;
  o: number;
  h: number;
  l: number;
  c: number;
  v: number;
}

export interface AlpacaCredentials {
  keyId: string;
  secretKey: string;
}

export function getAlpacaCredentials(): AlpacaCredentials | null {
  const keyId =
    process.env.ALPACA_API_KEY_ID ?? process.env.APCA_API_KEY_ID ?? "";
  const secretKey =
    process.env.ALPACA_API_SECRET_KEY ?? process.env.APCA_API_SECRET_KEY ?? "";
  if (!keyId || !secretKey) return null;
  return { keyId, secretKey };
}

export async function fetchAlpacaBars(
  symbol: string,
  timeframe: string,
  limit: number,
): Promise<Bar[] | null> {
  const creds = getAlpacaCredentials();
  if (!creds) return null;

  try {
    const url = new URL("https://data.alpaca.markets/v2/stocks/bars");
    url.searchParams.set("symbols", symbol.toUpperCase());
    url.searchParams.set("timeframe", timeframe);
    url.searchParams.set("limit", String(Math.min(limit, 10000)));
    url.searchParams.set("adjustment", "splits");
    url.searchParams.set("feed", process.env.ALPACA_DATA_FEED ?? DEFAULT_FEED);

    const start = new Date();
    start.setUTCDate(start.getUTCDate() - Math.ceil(limit * 2) - 10);
    url.searchParams.set("start", start.toISOString().slice(0, 19) + "Z");

    const res = await fetch(url, {
      headers: {
        "APCA-API-KEY-ID": creds.keyId,
        "APCA-API-SECRET-KEY": creds.secretKey,
      },
      signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
      cache: "no-store",
    });
    if (!res.ok) return null;

    const json = (await res.json()) as { bars?: Record<string, AlpacaBar[]> };
    const raw = json.bars?.[symbol.toUpperCase()];
    if (!Array.isArray(raw) || raw.length === 0) return null;

    const bars: Bar[] = raw.map((b) => ({
      t: b.t,
      o: b.o,
      h: b.h,
      l: b.l,
      c: b.c,
      v: b.v,
    }));
    bars.sort((a, b) => a.t.localeCompare(b.t));
    return bars.slice(-limit);
  } catch {
    return null;
  }
}
