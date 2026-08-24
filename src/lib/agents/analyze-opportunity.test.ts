import { readFileSync } from "node:fs";
import { beforeAll, describe, expect, it } from "vitest";
import {
  TradeProposalSchema,
  TradeProposalWireSchema,
} from "@/lib/contracts/research";
import {
  analyzeOpportunity,
  parseTradeProposalJson,
  serializeTradeProposal,
  serializeTradeProposalToJson,
} from "./analyze-opportunity";

beforeAll(() => {
  process.env.OPENAI_API_KEY = "";
});

const exampleInput = JSON.parse(
  readFileSync("fixtures/analyze-opportunity.example-input.json", "utf8"),
);
const exampleOutput = JSON.parse(
  readFileSync("fixtures/trade-proposal.example.json", "utf8"),
);

const GOLDEN_GENERATED_AT = "2026-08-24T15:00:00.000Z";

describe("analyzeOpportunity (mock mode)", () => {
  it("runs the five-agent desk and returns a schema-valid TradeProposal", async () => {
    const proposal = await analyzeOpportunity(exampleInput);
    expect(() => TradeProposalSchema.parse(proposal)).toBeTruthy();
    expect(proposal.symbol).toBe("NVDA");
    expect(proposal.requiresRiskApproval).toBe(true);
    expect(proposal.instrument).toBeNull();
    expect(proposal.debate.bullCase.length).toBeGreaterThan(0);
    expect(proposal.debate.bearCase.length).toBeGreaterThan(0);
  });

  it("is deterministic in mock mode and matches the committed golden fixture", async () => {
    const proposal = await analyzeOpportunity(exampleInput);
    expect(serializeTradeProposalToJson(proposal, { generatedAt: GOLDEN_GENERATED_AT })).toEqual(
      JSON.stringify(exampleOutput, null, 2),
    );
  });

  it("rejects malformed input before any agent runs", async () => {
    await expect(analyzeOpportunity({ symbol: 42 } as never)).rejects.toThrow();
  });

  it("surfaces portfolio considerations when context is provided", async () => {
    const proposal = await analyzeOpportunity(exampleInput);
    const text = JSON.stringify(proposal.portfolioConsiderations);
    expect(text).toContain("would introduce a new sector exposure");
  });
});

describe("TradeProposal wire contract", () => {
  it("serializes to the documented snake_case shape with 0-1 confidence", async () => {
    const wire = JSON.parse(
      serializeTradeProposalToJson(await analyzeOpportunity(exampleInput)),
    );
    expect(Object.keys(wire).sort()).toEqual(
      [
        "symbol",
        "action",
        "strategy",
        "instrument",
        "thesis",
        "confidence",
        "supporting_factors",
        "contradicting_factors",
        "risks",
        "invalidation_conditions",
        "portfolio_considerations",
        "requires_risk_approval",
        "generated_at",
      ].sort(),
    );
    expect(wire.confidence).toBeLessThanOrEqual(1);
    expect(wire.confidence).toBeGreaterThanOrEqual(0);
  });

  it("round-trips through parseTradeProposalJson unchanged", async () => {
    const proposal = await analyzeOpportunity(exampleInput);
    const text = serializeTradeProposalToJson(proposal, { generatedAt: GOLDEN_GENERATED_AT });
    expect(parseTradeProposalJson(text)).toEqual(
      serializeTradeProposal(proposal, { generatedAt: GOLDEN_GENERATED_AT }),
    );
  });

  it("can never be serialized or consumed with risk approval stripped", () => {
    const tampered = { ...exampleOutput, requires_risk_approval: false };
    expect(() => TradeProposalWireSchema.parse(tampered)).toThrow();
  });
});
