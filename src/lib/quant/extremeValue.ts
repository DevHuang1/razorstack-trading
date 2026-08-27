import type { TailRiskMetrics } from "./types";
import { round } from "./indicators";

export interface HillOptions {
  minEvents?: number;
  maxFraction?: number;
}

const DEFAULT_LEVEL = 0.99;
const DEFAULT_MIN_EVENTS = 20;
const DEFAULT_MAX_FRACTION = 0.2;

export function gaussianQuantile(level: number): number {
  const a = [-3.969683028665376e1, 2.209460984245205e2, -2.759285104469687e2,
    1.38357751867269e2, -3.066479806614716e1, 2.506628277459239];
  const b = [-5.447609879822406e1, 1.615858368580409e2, -1.556989798598866e2,
    6.680131188771972e1, -1.328068155288572e1];
  const c = [-7.784894002430293e-3, -3.223964580411365e-1, -2.400758277161838,
    -2.549732539343734, 4.374664141464968, 2.938163982698783];
  const d = [7.784695709041462e-3, 3.224671290700398e-1, 2.445134137142996,
    3.754408661907416];
  const pLow = 0.02425;
  const pHigh = 1 - pLow;

  let q: number;
  let r: number;
  if (level < pLow) {
    q = Math.sqrt(-2 * Math.log(level));
    q = (((((c[0] * q + c[1]) * q + c[2]) * q + c[3]) * q + c[4]) * q + c[5]) /
      ((((d[0] * q + d[1]) * q + d[2]) * q + d[3]) * q + 1);
  } else if (level <= pHigh) {
    q = level - 0.5;
    r = q * q;
    q = (((((a[0] * r + a[1]) * r + a[2]) * r + a[3]) * r + a[4]) * r + a[5]) * q /
      (((((b[0] * r + b[1]) * r + b[2]) * r + b[3]) * r + b[4]) * r + 1);
  } else {
    q = Math.sqrt(-2 * Math.log(1 - level));
    q =
      -(((((c[0] * q + c[1]) * q + c[2]) * q + c[3]) * q + c[4]) * q + c[5]) /
      ((((d[0] * q + d[1]) * q + d[2]) * q + d[3]) * q + 1);
  }
  return q;
}

export function gaussianVaR(volAnnualized: number, level: number, horizonDays: number): number | null {
  if (volAnnualized === null || volAnnualized <= 0 || !Number.isFinite(volAnnualized)) return null;
  const z = gaussianQuantile(level);
  const volOverHorizon = (Math.abs(volAnnualized) / 100) * Math.sqrt(horizonDays / 252);
  return round((z * volOverHorizon) * 100, 2);
}

export function hillEstimator(
  leftTailInputs: number[],
  options: HillOptions = {},
): { alpha: number; k: number; xThreshold: number } | null {
  const minEvents = options.minEvents ?? DEFAULT_MIN_EVENTS;
  const maxFraction = options.maxFraction ?? DEFAULT_MAX_FRACTION;

  const positives = leftTailInputs
    .filter((v): v is number => Number.isFinite(v) && v > 0)
    .sort((a, b) => b - a);

  if (positives.length < minEvents + 1) return null;

  const k = Math.min(Math.floor(positives.length * maxFraction) + 1, positives.length - 2);
  if (k < minEvents) return null;

  const xThreshold = positives[k]; 
  let sumLog = 0;
  for (let i = 0; i < k; i++) sumLog += Math.log(positives[i] / xThreshold);

  let alpha = k / sumLog;
  if (!Number.isFinite(alpha) || alpha <= 0) {
    alpha = 4;
  }

  return { alpha: round(alpha, 3), k, xThreshold: round(xThreshold, 6) };
}

export function paretoTailVaR(
  alpha: number,
  xThreshold: number,
  thresholdExceedanceFraction: number,
  level: number,
  pctLoss = true,
): number {
  const tailProbability = 1 - level;
  if (tailProbability <= 0) return pctLoss ? round(xThreshold * 100, 2) : xThreshold;
  const exceedance = thresholdExceedanceFraction > 0 ? thresholdExceedanceFraction : 1 / 1000;
  const varLoss = xThreshold * Math.pow(tailProbability / exceedance, -1 / alpha);
  return pctLoss ? round(varLoss * 100, 2) : varLoss;
}

export function computeTailRiskMetrics(
  returns: number[],
  options: { level?: number; horizonDays?: number } = {},
): TailRiskMetrics {
  const level = options.level ?? DEFAULT_LEVEL;
  const horizonDays = options.horizonDays ?? 1;

  const leftTail = returns.map((r) => -r);
  const est = hillEstimator(leftTail);

  const currentVol = stdevSample(returns);

  let gaussianV: number | null = null;
  if (currentVol !== null && currentVol > 0) {
    const z = gaussianQuantile(level);
    gaussianV = round((z * currentVol * Math.sqrt(horizonDays)) * 100, 2);
  }

  let nonGaussianV: number | null = null;
  let fatTail = false;
  if (est) {
    const thresh = est.xThreshold;
    const exceedExcess = est.k / returns.length;
    nonGaussianV = paretoTailVaR(est.alpha, thresh, exceedExcess, level);
    fatTail = est.alpha < 4;
  }

  return {
    tailIndex: est ? est.alpha : null,
    tailThreshold: est ? est.xThreshold : null,
    gaussianVaR: gaussianV,
    nonGaussianVaR: nonGaussianV,
    fatTail,
  };
}

function stdevSample(values: number[]): number | null {
  if (values.length < 2) return null;
  const mean = values.reduce((a, b) => a + b, 0) / values.length;
  const variance =
    values.reduce((acc, v) => acc + (v - mean) ** 2, 0) / (values.length - 1);
  return Math.sqrt(variance);
}
