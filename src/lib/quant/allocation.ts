import type { MarketRegime } from "./types";
import { correlation } from "./indicators";

export interface AllocationInput {
  symbols: string[];
  returnSeries: Record<string, number[]>;
  regime?: MarketRegime | null;
  maxConcentration?: number;
  targetVolAnnualized?: number;
}

export interface AllocationResult {
  weights: Record<string, number>;
  targetVolScale: number;
  regimeMultiplier: number;
  notes: string[];
}

const DEFAULT_MAX_CONCENTRATION = 0.4;
const TARGET_VOL = 0.2;

export function allocatePortfolio(input: AllocationInput): AllocationResult {
  const symbols = input.symbols;
  const maxConcentration = input.maxConcentration ?? DEFAULT_MAX_CONCENTRATION;
  const targetVol = input.targetVolAnnualized ?? TARGET_VOL;
  const regimeMultiplier = input.regime?.riskMultiplier ?? 1;
  const notes: string[] = [];

  const vols: Record<string, number> = {};
  for (const sym of symbols) {
    vols[sym] = annualizedVol(input.returnSeries[sym]);
  }

  const volWeights: Record<string, number> = {};
  let invSum = 0;
  for (const sym of symbols) {
    const v = vols[sym];
    if (v > 0) {
      volWeights[sym] = 1 / v;
      invSum += 1 / v;
    } else {
      volWeights[sym] = 0;
    }
  }
  let raw: Record<string, number> = {};
  for (const sym of symbols) {
    raw[sym] = invSum > 0 ? volWeights[sym] / invSum : 0;
  }

  raw = applyConcentrationCap(raw, maxConcentration, notes);
  normalize(raw);

  const portfolioVol = estimatePortfolioVol(raw, input.returnSeries, symbols);
  let targetVolScale = 1;
  if (portfolioVol > 0 && portfolioVol > targetVol) {
    targetVolScale = targetVol / portfolioVol;
  }

  const weights: Record<string, number> = {};
  for (const sym of symbols) {
    weights[sym] = clamp(raw[sym] * targetVolScale * regimeMultiplier, 0, maxConcentration);
  }
  normalize(weights);
  for (const sym of symbols) {
    const capped = clamp(weights[sym], 0, maxConcentration);
    if (capped !== weights[sym]) {
      notes.push(`capped concentration of ${sym} at ${(maxConcentration * 100).toFixed(0)}%`);
      weights[sym] = capped;
    }
  }

  notes.push(
    `risk-multiplier ${regimeMultiplier.toFixed(2)} applied${input.regime ? ` (${input.regime.label})` : ""}`,
  );

  return {
    weights,
    targetVolScale: round(targetVolScale, 4),
    regimeMultiplier,
    notes,
  };
}

function annualizedVol(returns: number[] | undefined): number {
  if (!returns || returns.length < 2) return 0;
  const mean = returns.reduce((a, b) => a + b, 0) / returns.length;
  const variance =
    returns.reduce((acc, v) => acc + (v - mean) ** 2, 0) / (returns.length - 1);
  return Math.sqrt(Math.max(variance, 0)) * Math.sqrt(252);
}

function applyConcentrationCap(
  w: Record<string, number>,
  cap: number,
  notes: string[],
): Record<string, number> {
  const out = { ...w };
  const symbols = Object.keys(out);
  let total = Object.values(out).reduce((a, b) => a + b, 0);
  for (const sym of symbols) {
    if (out[sym] / (total || 1) > cap) {
      out[sym] = (total || 1) * cap;
      notes.push(`capped concentration of ${sym} at ${(cap * 100).toFixed(0)}%`);
    }
  }
  total = Object.values(out).reduce((a, b) => a + b, 0);
  if (total > 0) {
    for (const sym of symbols) out[sym] = out[sym] / total;
  }
  return out;
}

function estimatePortfolioVol(
  w: Record<string, number>,
  series: Record<string, number[]>,
  symbols: string[],
): number {
  const n = symbols.length;
  const nPts = series[symbols[0]]?.length ?? 0;
  if (n === 0 || nPts === 0) return 0;

  let variance = 0;
  for (let i = 0; i < n; i++) {
    for (let j = 0; j < n; j++) {
      const wi = w[symbols[i]] || 0;
      const wj = w[symbols[j]] || 0;
      const vi = annualizedVol(series[symbols[i]]);
      const vj = annualizedVol(series[symbols[j]]);
      const corr =
        i === j ? 1 : (correlation(series[symbols[i]], series[symbols[j]]) ?? 0);
      variance += wi * wj * vi * vj * corr;
    }
  }
  return Math.sqrt(Math.max(variance, 0));
}

function normalize(w: Record<string, number>): void {
  const total = Object.values(w).reduce((a, b) => a + b, 0);
  if (total > 0) {
    for (const k of Object.keys(w)) w[k] = clamp(w[k] / total, 0, 1);
  }
}

function clamp(x: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, x));
}

function round(x: number, digits: number): number {
  const f = 10 ** digits;
  return Math.round(x * f) / f;
}
