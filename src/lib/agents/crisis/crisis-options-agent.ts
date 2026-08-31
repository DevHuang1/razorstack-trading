import {
  CrisisContextSchema,
  CrisisOptionsPlaybookSchema,
  type CrisisContext,
  type CrisisOptionsPlaybook,
} from "@/lib/contracts/crisis";
import { StructuredAgent, type StructuredAgentConfig } from "../base-agent";
import { CRISIS_OPTIONS_SYSTEM } from "../prompts";
import { assessCrisisSeverity } from "./severity";

export function buildFallbackCrisisOptionsPlaybook(context: CrisisContext): CrisisOptionsPlaybook {
  const severity = assessCrisisSeverity(context);
  const concepts: CrisisOptionsPlaybook["hedgingConcepts"] = [];

  if (severity === "insufficient_data") {
    concepts.push({
      kind: "interpretation",
      statement: "Conceptual hedge: none recommended until the stress report supplies complete inputs",
    });
  } else if (severity === "normal") {
    concepts.push({
      kind: "interpretation",
      statement: "Conceptual hedge: maintain existing structures; no defensive overlay indicated by supplied data",
    });
  } else {
    concepts.push({
      kind: "interpretation",
      statement: "Conceptual hedge: protective put overlay over exposure in affected sectors",
    });
    concepts.push({
      kind: "interpretation",
      statement: "Conceptual hedge: reduce portfolio net delta toward neutral while clarity improves",
    });
  }
  if (severity === "severe" || severity === "critical") {
    concepts.push({
      kind: "interpretation",
      statement: "Conceptual hedge: collar core positions to cap further downside at defined cost",
    });
    concepts.push({
      kind: "interpretation",
      statement: "Conceptual hedge: defined-risk bear spread to monetize continued weakness with capped loss",
    });
  }

  return CrisisOptionsPlaybookSchema.parse({
    hedgingConcepts: concepts,
    rationale: `Conceptual defensive structures for a "${severity}" severity reading. Ideas only - the downstream risk engine reviews, sizes and decides; nothing here is executable.`,
    confidence: severity === "insufficient_data" ? 25 : severity === "normal" ? 55 : Math.min(80, 55 + 5 * (concepts.length - 2)),
  });
}

export function buildCrisisOptionsPrompt(context: CrisisContext): string {
  return `CRISIS CONTEXT (verbatim):
${JSON.stringify(context)}

Suggest conceptual defensive structures per your rules. No strikes, prices or contract quantities.`;
}

export const crisisOptionsAgentConfig: StructuredAgentConfig<CrisisContext, CrisisOptionsPlaybook> = {
  name: "CrisisOptionsAgent",
  role: "crisis_options",
  description: "Suggests conceptual defensive option strategies for the risk engine to evaluate",
  systemPrompt: CRISIS_OPTIONS_SYSTEM,
  inputSchema: CrisisContextSchema,
  outputSchema: CrisisOptionsPlaybookSchema,
  buildPrompt: buildCrisisOptionsPrompt,
  fallback: buildFallbackCrisisOptionsPlaybook,
  maxAttempts: 2,
};

export const crisisOptionsAgent = new StructuredAgent(crisisOptionsAgentConfig);
