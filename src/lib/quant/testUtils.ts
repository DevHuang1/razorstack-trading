import type { Bar } from "./types";

export function makeBars(
  closes: number[],
  options: { start?: string; stepHours?: number; volume?: number } = {},
): Bar[] {
  const start = options.start ?? "2026-01-01T00:00:00.000Z";
  const stepMs = (options.stepHours ?? 24) * 3600 * 1000;
  const volume = options.volume ?? 100_000;
  const t0 = new Date(start).getTime();
  return closes.map((c, i) => {
    const o = i === 0 ? c : closes[i - 1];
    const h = Math.max(o, c) * 1.01;
    const l = Math.min(o, c) * 0.99;
    return {
      t: new Date(t0 + i * stepMs).toISOString(),
      o,
      h,
      l,
      c,
      v: volume,
    };
  });
}

export function ascendingCloses(n: number, start = 100): number[] {
  const out: number[] = [];
  for (let i = 0; i < n; i++) out.push(start + i);
  return out;
}

export function descendingCloses(n: number, start = 100): number[] {
  const out: number[] = [];
  for (let i = 0; i < n; i++) out.push(start - i);
  return out;
}
