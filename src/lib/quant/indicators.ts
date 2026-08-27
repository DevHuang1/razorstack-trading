import type { Bar } from "./types";

export type Series = (number | null)[];

export function clamp(x: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, x));
}

export function lastValue(series: Series): number | null {
  for (let i = series.length - 1; i >= 0; i--) {
    const v = series[i];
    if (v !== null && Number.isFinite(v)) return v;
  }
  return null;
}

export function sma(values: number[], period: number): Series {
  const out: Series = new Array(values.length).fill(null);
  if (period <= 0 || values.length < period) return out;
  let sum = 0;
  for (let i = 0; i < values.length; i++) {
    sum += values[i];
    if (i >= period) sum -= values[i - period];
    if (i >= period - 1) out[i] = sum / period;
  }
  return out;
}

export function ema(values: number[], period: number): Series {
  const out: Series = new Array(values.length).fill(null);
  if (period <= 0 || values.length < period) return out;
  const k = 2 / (period + 1);
  let prev = 0;
  for (let i = 0; i < period; i++) prev += values[i];
  prev /= period;
  out[period - 1] = prev;
  for (let i = period; i < values.length; i++) {
    prev = values[i] * k + prev * (1 - k);
    out[i] = prev;
  }
  return out;
}

export function rsi(closes: number[], period = 14): Series {
  const out: Series = new Array(closes.length).fill(null);
  if (closes.length <= period) return out;
  let gain = 0;
  let loss = 0;
  for (let i = 1; i <= period; i++) {
    const d = closes[i] - closes[i - 1];
    if (d >= 0) gain += d;
    else loss -= d;
  }
  let avgGain = gain / period;
  let avgLoss = loss / period;
  out[period] = avgLoss === 0 ? 100 : 100 - 100 / (1 + avgGain / avgLoss);
  for (let i = period + 1; i < closes.length; i++) {
    const d = closes[i] - closes[i - 1];
    avgGain = (avgGain * (period - 1) + Math.max(d, 0)) / period;
    avgLoss = (avgLoss * (period - 1) + Math.max(-d, 0)) / period;
    out[i] = avgLoss === 0 ? 100 : 100 - 100 / (1 + avgGain / avgLoss);
  }
  return out;
}

export function roc(values: number[], n: number): number | null {
  if (n <= 0 || values.length <= n) return null;
  const prev = values[values.length - 1 - n];
  if (prev === 0 || !Number.isFinite(prev)) return null;
  return (values[values.length - 1] - prev) / prev;
}

export function stdev(values: number[]): number {
  if (values.length < 2) return 0;
  const mean = values.reduce((a, b) => a + b, 0) / values.length;
  const variance =
    values.reduce((acc, v) => acc + (v - mean) ** 2, 0) / (values.length - 1);
  return Math.sqrt(variance);
}

export function dailyReturns(closes: number[], window?: number): number[] {
  const slice = window ? closes.slice(-window - 1) : closes;
  const out: number[] = [];
  for (let i = 1; i < slice.length; i++) {
    const prev = slice[i - 1];
    if (prev !== 0 && Number.isFinite(prev)) out.push(slice[i] / prev - 1);
  }
  return out;
}

export function annualizationFactor(timeframe: string): number {
  switch (timeframe) {
    case "1Min":
      return 390 * 252;
    case "5Min":
      return 78 * 252;
    case "15Min":
      return 26 * 252;
    case "30Min":
      return 13 * 252;
    case "1Hour":
      return 6.5 * 252;
    default:
      return 252;
  }
}

export function realizedVolSeries(
  closes: number[],
  period = 20,
  barsPerYear = 252,
): Series {
  const rets = [0];
  for (let i = 1; i < closes.length; i++) {
    const prev = closes[i - 1];
    rets.push(prev > 0 ? Math.log(closes[i] / prev) : 0);
  }
  const out: Series = new Array(closes.length).fill(null);
  for (let i = period; i < closes.length; i++) {
    const window = rets.slice(i - period + 1, i + 1);
    out[i] = stdev(window) * Math.sqrt(barsPerYear);
  }
  return out;
}

export function percentileRank(history: number[], value: number): number | null {
  if (history.length === 0) return null;
  let below = 0;
  for (const v of history) if (v <= value) below++;
  return below / history.length;
}

export function atr(bars: Bar[], period = 14): Series {
  const out: Series = new Array(bars.length).fill(null);
  if (bars.length <= period) return out;
  const trs: number[] = [];
  trs.push(bars[0].h - bars[0].l);
  for (let i = 1; i < bars.length; i++) {
    const prevClose = bars[i - 1].c;
    trs.push(
      Math.max(
        bars[i].h - bars[i].l,
        Math.abs(bars[i].h - prevClose),
        Math.abs(bars[i].l - prevClose),
      ),
    );
  }
  let sum = 0;
  for (let i = 0; i < period; i++) sum += trs[i];
  let prevAtr = sum / period;
  out[period - 1] = prevAtr;
  for (let i = period; i < bars.length; i++) {
    prevAtr = (prevAtr * (period - 1) + trs[i]) / period;
    out[i] = prevAtr;
  }
  return out;
}

export interface BollingerBands {
  middle: Series;
  upper: Series;
  lower: Series;
}

export function bollinger(
  closes: number[],
  period = 20,
  mult = 2,
): BollingerBands {
  const middle = sma(closes, period);
  const upper: Series = new Array(closes.length).fill(null);
  const lower: Series = new Array(closes.length).fill(null);
  for (let i = period - 1; i < closes.length; i++) {
    const m = middle[i];
    if (m === null) continue;
    const sd = stdev(closes.slice(i - period + 1, i + 1));
    upper[i] = m + mult * sd;
    lower[i] = m - mult * sd;
  }
  return { middle, upper, lower };
}

export function relativeVolume(volumes: number[], period = 20): number | null {
  if (volumes.length < period + 1) return null;
  const avg =
    volumes.slice(volumes.length - 1 - period, volumes.length - 1).reduce(
      (a, b) => a + b,
      0,
    ) / period;
  if (avg <= 0) return null;
  return volumes[volumes.length - 1] / avg;
}

export function obv(bars: Bar[]): number[] {
  const out: number[] = [0];
  for (let i = 1; i < bars.length; i++) {
    const prev = out[i - 1];
    if (bars[i].c > bars[i - 1].c) out.push(prev + bars[i].v);
    else if (bars[i].c < bars[i - 1].c) out.push(prev - bars[i].v);
    else out.push(prev);
  }
  return out;
}

export interface DrawdownStats {
  maxDrawdownPct: number;
  currentDrawdownPct: number;
}

export function drawdownStats(values: number[], lookback?: number): DrawdownStats {
  const slice = lookback ? values.slice(-lookback) : values;
  if (slice.length === 0) return { maxDrawdownPct: 0, currentDrawdownPct: 0 };
  let peak = slice[0];
  let maxDd = 0;
  for (const v of slice) {
    if (v > peak) peak = v;
    const dd = peak > 0 ? (peak - v) / peak : 0;
    if (dd > maxDd) maxDd = dd;
  }
  const lastPrice = slice[slice.length - 1];
  const currentDd = peak > 0 ? (peak - lastPrice) / peak : 0;
  return {
    maxDrawdownPct: maxDd * 100,
    currentDrawdownPct: currentDd * 100,
  };
}

export function correlation(a: number[], b: number[]): number | null {
  const n = Math.min(a.length, b.length);
  if (n < 2) return null;
  const x = a.slice(-n);
  const y = b.slice(-n);
  const meanX = x.reduce((s, v) => s + v, 0) / n;
  const meanY = y.reduce((s, v) => s + v, 0) / n;
  let cov = 0;
  let varX = 0;
  let varY = 0;
  for (let i = 0; i < n; i++) {
    cov += (x[i] - meanX) * (y[i] - meanY);
    varX += (x[i] - meanX) ** 2;
    varY += (y[i] - meanY) ** 2;
  }
  if (varX === 0 || varY === 0) return null;
  return cov / Math.sqrt(varX * varY);
}

export function normalizedSlope(values: number[], lookback = 5): number | null {
  if (values.length <= lookback) return null;
  const a = values[values.length - 1 - lookback];
  const b = values[values.length - 1];
  if (a <= 0 || !Number.isFinite(a)) return null;
  return (b - a) / a;
}

export function round(x: number, digits = 2): number {
  const f = 10 ** digits;
  return Math.round(x * f) / f;
}
