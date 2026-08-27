import type { Direction, StrategyId } from "./types";
import { sharpeRatio, drawdownStats } from "./indicators";

export interface PaperRecord {
  id: string;
  symbol: string;
  strategy: StrategyId;
  modelVersion: string;
  timeframe: string;
  generatedAt: string;
  horizonDays: number;
  entryPrice: number;
  direction: Direction;
  exitPrice: number | null;
  realizedReturn: number | null;
}

export interface LeaderboardEntry {
  strategy: StrategyId;
  total: number;
  withOutcome: number;
  winRatePct: number;
  avgReturnPct: number;
  cumulativeReturnPct: number;
  sharpeAnnualized: number | null;
  maxDrawdownPct: number;
  pnlPct: number;
}

const STORAGE_KEY = "razorstack-quant-paper";

let memory: PaperRecord[] = [];

function readStore(): PaperRecord[] {
  if (typeof localStorage !== "undefined") {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (raw) return JSON.parse(raw) as PaperRecord[];
    } catch {
      /* ignore */
    }
  }
  return memory;
}

function writeStore(records: PaperRecord[]): void {
  memory = records;
  if (typeof localStorage !== "undefined") {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(records));
    } catch {
      /* ignore */
    }
  }
}

export function listPaperRecords(): PaperRecord[] {
  return readStore();
}

export function recordSignal(input: {
  symbol: string;
  strategy: StrategyId;
  modelVersion: string;
  timeframe: string;
  horizonDays: number;
  entryPrice: number;
  direction: Direction;
}): PaperRecord {
  const records = readStore();
  const record: PaperRecord = {
    id: `${input.symbol}:${input.strategy}:${Date.now()}`,
    symbol: input.symbol.toUpperCase(),
    strategy: input.strategy,
    modelVersion: input.modelVersion,
    timeframe: input.timeframe,
    generatedAt: new Date().toISOString(),
    horizonDays: input.horizonDays,
    entryPrice: input.entryPrice,
    direction: input.direction,
    exitPrice: null,
    realizedReturn: null,
  };
  records.push(record);
  writeStore(records.slice(-500));
  return record;
}

export function resolveOutcome(id: string, exitPrice: number): PaperRecord | null {
  const records = readStore();
  const index = records.findIndex((r) => r.id === id);
  if (index === -1) return null;
  const record = records[index];
  const raw = record.entryPrice > 0 ? exitPrice / record.entryPrice - 1 : 0;
  const signed = record.direction === "SELL" ? -raw : raw;
  record.exitPrice = exitPrice;
  record.realizedReturn = signed;
  records[index] = record;
  writeStore(records);
  return record;
}

export function leaderboard(): LeaderboardEntry[] {
  const records = readStore();
  const byStrategy = new Map<StrategyId, PaperRecord[]>();
  for (const r of records) {
    if (!byStrategy.has(r.strategy)) byStrategy.set(r.strategy, []);
    byStrategy.get(r.strategy)!.push(r);
  }

  const entries: LeaderboardEntry[] = [];
  for (const [strategy, group] of byStrategy) {
    const withOutcome = group.filter((r) => r.realizedReturn !== null);
    const outcomes = withOutcome.map((r) => r.realizedReturn as number);
    const wins = outcomes.filter((r) => r > 0).length;
    const avg = outcomes.length ? outcomes.reduce((a, b) => a + b, 0) / outcomes.length : 0;
    let cumulative = 1;
    for (const o of outcomes) cumulative *= 1 + o;
    const sharpe = sharpeRatio(outcomes, 252 / (group[0]?.horizonDays ?? 1));
    const dd = drawdownStats(buildEquity(outcomes));

    entries.push({
      strategy,
      total: group.length,
      withOutcome: withOutcome.length,
      winRatePct: round((wins / Math.max(1, outcomes.length)) * 100, 1),
      avgReturnPct: round(avg * 100, 3),
      cumulativeReturnPct: round((cumulative - 1) * 100, 2),
      sharpeAnnualized: sharpe === null ? null : round(sharpe, 2),
      maxDrawdownPct: round(dd.maxDrawdownPct, 2),
      pnlPct: round((cumulative - 1) * 100, 2),
    });
  }

  entries.sort((a, b) => b.pnlPct - a.pnlPct);
  return entries;
}

function buildEquity(outcomes: number[]): number[] {
  const equity: number[] = [];
  let prev = 1;
  for (const o of outcomes) {
    prev *= 1 + o;
    equity.push(prev);
  }
  return equity.length ? equity : [1];
}

function round(x: number, digits: number): number {
  const f = 10 ** digits;
  return Math.round(x * f) / f;
}
