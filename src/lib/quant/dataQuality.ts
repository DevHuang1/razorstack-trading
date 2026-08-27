import type { Bar, DataQuality } from "./types";

const TIMEFRAME_SECONDS: Record<string, number> = {
  "1Min": 60,
  "5Min": 5 * 60,
  "15Min": 15 * 60,
  "30Min": 30 * 60,
  "1Hour": 60 * 60,
  "1Day": 24 * 60 * 60,
  "1Week": 7 * 24 * 60 * 60,
};

export interface DataQualityOptions {
  asOf?: Date | string;
  minHistoryBars?: number;
  maxGapBars?: number;
  staleAfterIntervals?: number;
}

function asDate(value: Date | string): Date {
  return value instanceof Date ? value : new Date(value);
}

export function assessDataQuality(
  symbol: string,
  timeframe: string,
  bars: Bar[],
  options: DataQualityOptions = {},
): DataQuality {
  const interval = TIMEFRAME_SECONDS[timeframe] ?? null;
  const ordered = [...bars].sort((a, b) => a.t.localeCompare(b.t));
  const minHistoryBars = options.minHistoryBars ?? 60;
  const maxGapBars = options.maxGapBars ?? 3;
  const staleAfterIntervals = options.staleAfterIntervals ?? 3;

  const countMap = new Map<string, number>();
  for (const b of ordered) {
    countMap.set(b.t, (countMap.get(b.t) ?? 0) + 1);
  }
  let duplicateCount = 0;
  for (const count of countMap.values()) {
    if (count > 1) duplicateCount += count - 1;
  }
  const uniqueTimes = [...countMap.keys()].sort();

  let missingCount = 0;
  let largestGap = 0;
  if (interval && uniqueTimes.length > 1) {
    for (let i = 1; i < uniqueTimes.length; i++) {
      const prev = asDate(uniqueTimes[i - 1]);
      const current = asDate(uniqueTimes[i]);
      let gapBars = 0;
      if (timeframe === "1Day") {
        const cursor = new Date(
          Date.UTC(prev.getUTCFullYear(), prev.getUTCMonth(), prev.getUTCDate()),
        );
        cursor.setUTCDate(cursor.getUTCDate() + 1);
        while (cursor.getTime() < current.getTime()) {
          const dow = cursor.getUTCDay();
          if (dow !== 0 && dow !== 6) gapBars += 1;
          cursor.setUTCDate(cursor.getUTCDate() + 1);
        }
      } else {
        const elapsed = (current.getTime() - prev.getTime()) / 1000;
        gapBars = Math.max(0, Math.round(elapsed / interval) - 1);
      }
      missingCount += gapBars;
      largestGap = Math.max(largestGap, gapBars);
    }
  }

  const warnings: string[] = [];
  if (uniqueTimes.length < minHistoryBars) {
    warnings.push(`history_short:${uniqueTimes.length}<${minHistoryBars}`);
  }
  if (duplicateCount) {
    warnings.push(`duplicate_bars:${duplicateCount}`);
  }
  if (largestGap > maxGapBars) {
    warnings.push(`gap_too_large:${largestGap}>${maxGapBars}`);
  }

  const firstBarAt = uniqueTimes.length ? uniqueTimes[0] : null;
  const lastBarAt = uniqueTimes.length ? uniqueTimes[uniqueTimes.length - 1] : null;

  let stale = false;
  if (interval && lastBarAt) {
    const reference = options.asOf ? asDate(options.asOf) : new Date();
    const last = asDate(lastBarAt);
    const elapsedSeconds = (reference.getTime() - last.getTime()) / 1000;
    if (elapsedSeconds > interval * staleAfterIntervals) {
      stale = true;
      warnings.push("stale_last_bar");
    }
  }

  return {
    symbol: symbol.toUpperCase(),
    timeframe,
    barCount: uniqueTimes.length,
    firstBarAt,
    lastBarAt,
    expectedIntervalSeconds: interval,
    duplicateBarCount: duplicateCount,
    missingBarCount: missingCount,
    maxGapBars: largestGap,
    stale,
    isActionable: warnings.length === 0,
    warnings,
  };
}
