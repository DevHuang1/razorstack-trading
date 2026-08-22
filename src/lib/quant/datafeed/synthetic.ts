import type { Bar } from "../types";

function hashSeed(s: string): number {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export function syntheticBars(symbol: string, limit: number): Bar[] {
  const dayBucket = Math.floor(Date.now() / 86400000);
  const rand = mulberry32(hashSeed(`${symbol}:${dayBucket}`));
  const gauss = () => {
    const u = Math.max(rand(), 1e-9);
    const v = Math.max(rand(), 1e-9);
    return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v);
  };

  let price = 40 + (hashSeed(symbol) % 360);
  let drift = (rand() - 0.45) * 0.002;
  let vol = 0.012 + rand() * 0.012;

  const dates: Date[] = [];
  const cursor = new Date();
  cursor.setUTCHours(0, 0, 0, 0);
  while (dates.length < limit) {
    const dow = cursor.getUTCDay();
    if (dow !== 0 && dow !== 6) dates.push(new Date(cursor));
    cursor.setUTCDate(cursor.getUTCDate() - 1);
  }
  dates.reverse();

  const bars: Bar[] = [];
  for (const d of dates) {
    if (rand() < 0.04) {
      drift = (rand() - 0.45) * 0.003;
      vol = 0.01 + rand() * 0.02;
    }
    if (rand() < 0.02) vol *= 1.8;
    vol = Math.min(vol, 0.05);

    const ret = drift + vol * gauss();
    const open = price;
    const close = open * (1 + ret);
    const high = Math.max(open, close) * (1 + Math.abs(gauss()) * vol * 0.5);
    const low = Math.min(open, close) * (1 - Math.abs(gauss()) * vol * 0.5);
    const volume = Math.round(
      (3e6 + rand() * 2e6) *
        (1 + Math.abs(ret) / vol) *
        (symbol.length <= 3 ? 1.5 : 1),
    );
    bars.push({
      t: d.toISOString().slice(0, 10),
      o: round2(open),
      h: round2(high),
      l: round2(low),
      c: round2(close),
      v: volume,
    });
    price = close;
  }
  return bars;
}

function round2(x: number): number {
  return Math.round(x * 100) / 100;
}
