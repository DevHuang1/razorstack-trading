import { describe, expect, it } from "vitest";
import {
  CrisisContextSchema,
  CrisisResponseSchema,
  type CrisisContext,
} from "./crisis";
import { assessCrisisSeverity } from "@/lib/agents/crisis/severity";
import {
  insufficientCrisisContext,
  moderateCrisisContext,
  normalCrisisContext,
  severeCrisisContext,
} from "@/lib/agents/crisis/crisis-test-fixtures";

const validContext: CrisisContext = {
  marketMove: { benchmark: "S&P 500", changePct: -4.5 },
  volatilityChange: { indexLabel: "VIX", currentLevel: 22, priorLevel: 16 },
  portfolioDrawdownPct: -3.8,
  affectedSectors: ["Software"],
  newsEvents: [],
  currentPositions: [],
};

describe("CrisisContextSchema", () => {
  it("accepts a valid stress report", () => {
    expect(CrisisContextSchema.parse(validContext)).toBeTruthy();
  });

  it("rejects non-positive volatility levels", () => {
    expect(() =>
      CrisisContextSchema.parse({
        ...validContext,
        volatilityChange: { indexLabel: "VIX", currentLevel: 0 },
      }),
    ).toThrow();
  });

  it("rejects a missing benchmark", () => {
    expect(() =>
      CrisisContextSchema.parse({ ...validContext, marketMove: { changePct: -1 } }),
    ).toThrow();
  });
});

describe("assessCrisisSeverity", () => {
  it("classifies the four reference scenarios", () => {
    expect(assessCrisisSeverity(normalCrisisContext)).toBe("normal");
    expect(assessCrisisSeverity(moderateCrisisContext)).toBe("moderate");
    expect(assessCrisisSeverity(severeCrisisContext)).toBe("severe");
    expect(assessCrisisSeverity(insufficientCrisisContext)).toBe("insufficient_data");
  });

  it("reserves critical for extreme combined readings", () => {
    const critical: CrisisContext = {
      marketMove: { benchmark: "NASDAQ", changePct: -11 },
      volatilityChange: { indexLabel: "VIX", currentLevel: 44, priorLevel: 20 },
      portfolioDrawdownPct: -13,
      affectedSectors: ["Software"],
      newsEvents: [],
      currentPositions: [normalCrisisContext.currentPositions[0]],
    };
    expect(assessCrisisSeverity(critical)).toBe("critical");
  });
});

describe("CrisisResponseSchema", () => {
  it("can never pass with risk approval stripped", () => {
    const response = {
      severity: "severe",
      summary: "Assessment",
      portfolioVulnerabilities: [],
      recommendedActions: [{ kind: "interpretation", statement: "Escalate" }],
      hedgingIdeas: [],
      reasons: [{ kind: "observation", statement: "Move cited" }],
      confidence: 72,
      requiresRiskApproval: false,
    };
    expect(() => CrisisResponseSchema.parse(response)).toThrow();
  });
});
