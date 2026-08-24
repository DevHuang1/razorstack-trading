import type { AnalysisStatement } from "@/lib/contracts/research";

export class GroundingError extends Error {}

const PRECISE_NUMBER_PATTERN = /-?\d+\.\d+|-?\d{4,}/g;

function collectNumbers(value: unknown, out: number[] = []): number[] {
  if (typeof value === "number") {
    if (Number.isFinite(value)) out.push(value);
  } else if (Array.isArray(value)) {
    for (const item of value) collectNumbers(item, out);
  } else if (value !== null && typeof value === "object") {
    for (const item of Object.values(value)) collectNumbers(item, out);
  }
  return out;
}

export function assertNumeralsGrounded(statements: AnalysisStatement[], sourceValues: unknown): void {
  const allowed = collectNumbers(sourceValues);
  for (const { statement } of statements) {
    const numerals = statement.match(PRECISE_NUMBER_PATTERN) ?? [];
    for (const raw of numerals) {
      const claimed = Number(raw);
      const grounded = allowed.some((v) => Math.abs(v - claimed) <= Math.abs(claimed) * 0.005 + 1e-9);
      if (!grounded) {
        throw new GroundingError(
          `Statement cites number ${claimed} which does not appear in the provided data: "${statement}"`,
        );
      }
    }
  }
}

export function assertSourcesGrounded(statements: AnalysisStatement[], allowedSources: string[]): void {
  const normalized = new Set(allowedSources.map((s) => s.trim().toLowerCase()));
  for (const { statement } of statements) {
    const matches = [...statement.matchAll(/\(source:\s*([^)]+)\)/g)];
    for (const match of matches) {
      const cited = match[1].trim().toLowerCase();
      if (!normalized.has(cited)) {
        throw new GroundingError(`Statement cites unprovided source "${match[1]}": "${statement}"`);
      }
    }
  }
}
