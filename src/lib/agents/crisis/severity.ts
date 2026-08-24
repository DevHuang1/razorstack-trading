import type { CrisisContext, CrisisSeverity } from "@/lib/contracts/crisis";

export function affectedPositionSectors(context: CrisisContext): string[] {
  const positionSectors = new Set(context.currentPositions.map((p) => p.sector));
  return context.affectedSectors.filter((s) => positionSectors.has(s));
}

export function assessCrisisSeverity(context: CrisisContext): CrisisSeverity {
  const hasBasis =
    context.newsEvents.length > 0 ||
    context.volatilityChange.priorLevel !== undefined ||
    context.currentPositions.length > 0 ||
    context.affectedSectors.length > 0;
  if (!hasBasis) return "insufficient_data";

  let score = 0;
  const move = context.marketMove.changePct;
  if (move <= -10) score += 5;
  else if (move <= -5) score += 3;
  else if (move <= -2) score += 1;

  const { currentLevel, priorLevel } = context.volatilityChange;
  if (priorLevel !== undefined && priorLevel > 0) {
    const ratio = currentLevel / priorLevel;
    if (ratio >= 2) score += 3;
    else if (ratio >= 1.5) score += 2;
    else if (ratio >= 1.25) score += 1;
  }

  const dd = context.portfolioDrawdownPct;
  if (dd <= -12) score += 4;
  else if (dd <= -7) score += 2;
  else if (dd <= -3) score += 1;

  if (score === 0) return "normal";
  if (score <= 3) return "moderate";
  if (score <= 7) return "severe";
  return "critical";
}

export function volatilityRatio(context: CrisisContext): number | undefined {
  const { currentLevel, priorLevel } = context.volatilityChange;
  if (priorLevel === undefined || priorLevel <= 0) return undefined;
  return currentLevel / priorLevel;
}
