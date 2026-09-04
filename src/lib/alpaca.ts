// ─── Alpaca Data Client ───────────────────────────────────────────────────────
const BASE = "https://data.alpaca.markets";

function h() {
  return {
    "APCA-API-KEY-ID": process.env.ALPACA_API_KEY_ID ?? "",
    "APCA-API-SECRET-KEY": process.env.ALPACA_API_SECRET_KEY ?? "",
    Accept: "application/json",
  };
}

const CRYPTO_SET = new Set([
  "BTC","ETH","SOL","BNB","XRP","DOGE","USDT","USDC","AVAX","MATIC","LINK",
  "LTC","ADA","DOT","ATOM","NEAR","UNI","AAVE","CRV","MKR","COMP","SNX",
]);

export const isCrypto = (sym: string) => CRYPTO_SET.has(sym.toUpperCase());

const TF: Record<string, string> = {
  "1m":"1Min","5m":"5Min","15m":"15Min",
  "1H":"1Hour","4H":"4Hour","1D":"1Day","1W":"1Week",
};
export const tfToAlpaca = (tf: string) => TF[tf] ?? "5Min";

export interface Bar { t: string; o: number; h: number; l: number; c: number; v: number; }

type RawBar = Bar;


export interface Snapshot {
  price: number; bid: number; ask: number;
  open: number; high: number; low: number; prevClose: number;
  volume: number; change: number; changePct: number;
}

// ─── Historical bars ──────────────────────────────────────────────────────────
export async function getBars(sym: string, tf: string, limit = 120): Promise<Bar[]> {
  const upper = sym.toUpperCase();
  const timeframe = tfToAlpaca(tf);

  try {
    if (isCrypto(upper)) {
      const url = `${BASE}/v1beta3/crypto/us/bars?symbols=${upper}/USD&timeframe=${timeframe}&limit=${limit}&sort=asc`;
      const res = await fetch(url, { headers: h(), cache: "no-store" });
      if (!res.ok) return [];
      const data = await res.json();
      return (data.bars?.[`${upper}/USD`] ?? []).map((b: RawBar) => ({
        t: b.t, o: b.o, h: b.h, l: b.l, c: b.c, v: b.v,
      }));
    } else {
      const url = `${BASE}/v2/stocks/${upper}/bars?timeframe=${timeframe}&limit=${limit}&sort=asc&feed=iex`;
      const res = await fetch(url, { headers: h(), cache: "no-store" });
      if (!res.ok) return [];
      const data = await res.json();
      return (data.bars ?? []).map((b: RawBar) => ({
        t: b.t, o: b.o, h: b.h, l: b.l, c: b.c, v: b.v,
      }));
    }
  } catch { return []; }
}

// ─── Single snapshot ──────────────────────────────────────────────────────────
interface RawSnapshotNode {
  latestTrade?: { p?: number };
  latestQuote?: { ap?: number; bp?: number };
  dailyBar?: RawBar;
  prevDailyBar?: RawBar;
}

function parseSnap(s: RawSnapshotNode): Snapshot {
  const price = s.latestTrade?.p ?? s.latestQuote?.ap ?? s.latestQuote?.bp ?? 0;
  const open  = s.dailyBar?.o ?? price;
  const change    = price - open;
  const changePct = open ? (change / open) * 100 : 0;
  return {
    price,
    bid:      s.latestQuote?.bp ?? price * 0.9999,
    ask:      s.latestQuote?.ap ?? price * 1.0001,
    open,
    high:     s.dailyBar?.h ?? price,
    low:      s.dailyBar?.l ?? price,
    prevClose: s.prevDailyBar?.c ?? open,
    volume:   s.dailyBar?.v ?? 0,
    change, changePct,
  };
}

export async function getSnapshot(sym: string): Promise<Snapshot | null> {
  const upper = sym.toUpperCase();
  try {
    if (isCrypto(upper)) {
      const url = `${BASE}/v1beta3/crypto/us/snapshots?symbols=${upper}/USD`;
      const res = await fetch(url, { headers: h(), cache: "no-store" });
      if (!res.ok) return null;
      const data = await res.json();
      const s = data.snapshots?.[`${upper}/USD`];
      return s ? parseSnap(s) : null;
    } else {
      const url = `${BASE}/v2/stocks/${upper}/snapshot?feed=iex`;
      const res = await fetch(url, { headers: h(), cache: "no-store" });
      if (!res.ok) return null;
      return parseSnap(await res.json());
    }
  } catch { return null; }
}

// ─── Batch snapshots ──────────────────────────────────────────────────────────
export async function getMultiSnapshots(
  syms: string[]
): Promise<Record<string, Snapshot>> {
  const result: Record<string, Snapshot> = {};
  const cryptoList = syms.filter(isCrypto);
  const stockList  = syms.filter(s => !isCrypto(s));

  await Promise.allSettled([
    (async () => {
      if (!cryptoList.length) return;
      const pairs = cryptoList.map(s => `${s.toUpperCase()}/USD`).join(",");
      const url = `${BASE}/v1beta3/crypto/us/snapshots?symbols=${pairs}`;
      const res = await fetch(url, { headers: h(), cache: "no-store" });
      if (!res.ok) return;
      const data = await res.json();
      for (const sym of cryptoList) {
        const s = data.snapshots?.[`${sym.toUpperCase()}/USD`];
        if (s) result[sym.toUpperCase()] = parseSnap(s);
      }
    })(),
    (async () => {
      if (!stockList.length) return;
      const url = `${BASE}/v2/stocks/snapshots?symbols=${stockList.join(",")}&feed=iex`;
      const res = await fetch(url, { headers: h(), cache: "no-store" });
      if (!res.ok) return;
      const data = await res.json();
      for (const sym of stockList) {
        const s = data[sym.toUpperCase()];
        if (s) result[sym.toUpperCase()] = parseSnap(s);
      }
    })(),
  ]);

  return result;
}
