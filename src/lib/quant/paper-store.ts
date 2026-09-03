import { promises as fs } from "node:fs";
import path from "node:path";
import type { Direction, StrategyId } from "./types";
import { sharpeRatio, drawdownStats } from "./indicators";

export interface PaperStoreRecord {
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

export interface PaperStoreEntry {
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

const DEFAULT_FILE = path.join(process.cwd(), ".data", "quant-paper.json");
const MAX_RECORDS = 2000;

interface PaperStoreOptions {
  file?: string;
}

let cache: PaperStoreRecord[] | null = null;
let pendingWrite: Promise<void> | null = null;

function resolvePath(options: PaperStoreOptions): string {
  return options.file ?? process.env.QUANT_PAPER_FILE ?? DEFAULT_FILE;
}

export async function listPaperRecords(options: PaperStoreOptions = {}): Promise<PaperStoreRecord[]> {
  if (cache) return cache;
  const file = resolvePath(options);
  try {
    const raw = await fs.readFile(file, "utf8");
    const parsed = JSON.parse(raw) as PaperStoreRecord[];
    cache = Array.isArray(parsed) ? parsed : [];
  } catch {
    cache = [];
  }
  return cache;
}

async function persist(records: PaperStoreRecord[], file: string): Promise<void> {
  cache = records;
  const write = (async () => {
    const dir = path.dirname(file);
    try {
      await fs.access(dir);
    } catch {
      await fs.mkdir(dir, { recursive: true });
    }
    await fs.writeFile(file, JSON.stringify(records, null, 2), "utf8");
  })();
  pendingWrite = write;
  await write;
  if (pendingWrite === write) pendingWrite = null;
}

export async function recordSignal(
  input: {
    symbol: string;
    strategy: StrategyId;
    modelVersion: string;
    timeframe: string;
    horizonDays: number;
    entryPrice: number;
    direction: Direction;
  },
  options: PaperStoreOptions = {},
): Promise<PaperStoreRecord> {
  const records = await listPaperRecords(options);
  const record: PaperStoreRecord = {
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
  await persist(records.slice(-MAX_RECORDS), resolvePath(options));
  return record;
}

export async function resolveOutcome(
  id: string,
  exitPrice: number,
  options: PaperStoreOptions = {},
): Promise<PaperStoreRecord | null> {
  const records = await listPaperRecords(options);
  const index = records.findIndex((r) => r.id === id);
  if (index === -1) return null;
  const record = records[index];
  const raw = record.entryPrice > 0 ? exitPrice / record.entryPrice - 1 : 0;
  const signed = record.direction === "SELL" ? -raw : raw;
  record.exitPrice = exitPrice;
  record.realizedReturn = signed;
  records[index] = record;
  await persist(records, resolvePath(options));
  return record;
}

export async function leaderboard(options: PaperStoreOptions = {}): Promise<PaperStoreEntry[]> {
  const records = await listPaperRecords(options);
  const byStrategy = new Map<StrategyId, PaperStoreRecord[]>();
  for (const r of records) {
    if (!byStrategy.has(r.strategy)) byStrategy.set(r.strategy, []);
    byStrategy.get(r.strategy)!.push(r);
  }

  const entries: PaperStoreEntry[] = [];
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

export async function clear(options: PaperStoreOptions = {}): Promise<void> {
  await persist([], resolvePath(options));
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
