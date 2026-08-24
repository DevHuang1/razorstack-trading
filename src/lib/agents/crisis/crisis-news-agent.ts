import {
  CrisisContextSchema,
  CrisisNewsAssessmentSchema,
  type CrisisContext,
  type CrisisNewsAssessment,
} from "@/lib/contracts/crisis";
import { StructuredAgent, type StructuredAgentConfig } from "../base-agent";
import { assertSourcesGrounded } from "../grounding";
import { CRISIS_NEWS_SYSTEM } from "../prompts";

export function buildFallbackCrisisNewsAssessment(context: CrisisContext): CrisisNewsAssessment {
  const drivers = [...context.newsEvents]
    .sort((a, b) => Math.abs(b.sentiment ?? 0) - Math.abs(a.sentiment ?? 0))
    .slice(0, 2)
    .map((item) => ({
      kind: "observation" as const,
      statement: `Supplied coverage: "${item.headline}" (source: ${item.source}, sentiment ${item.sentiment ?? "unrated"})`,
    }));

  const notes =
    drivers.length === 0
      ? [{ kind: "observation" as const, statement: "No identifiable driver exists in the supplied material; do not assume a cause" }]
      : [{ kind: "observation" as const, statement: `${context.newsEvents.length} supplied news item(s) reviewed for causal relevance` }];

  return CrisisNewsAssessmentSchema.parse({
    identifiedDrivers: drivers,
    notes,
    confidence: drivers.length > 0 ? Math.min(80, 50 + 10 * drivers.length) : 30,
  });
}

export function buildCrisisNewsPrompt(context: CrisisContext): string {
  return `CRISIS CONTEXT (verbatim — the only permitted source of information):
${JSON.stringify(context)}

Identify what may be driving the reported stress, citing only the material above.`;
}

export const crisisNewsAgentConfig: StructuredAgentConfig<CrisisContext, CrisisNewsAssessment> = {
  name: "CrisisNewsAgent",
  role: "crisis_news",
  description: "Identifies potential drivers of reported stress using only supplied news",
  systemPrompt: CRISIS_NEWS_SYSTEM,
  inputSchema: CrisisContextSchema,
  outputSchema: CrisisNewsAssessmentSchema,
  buildPrompt: buildCrisisNewsPrompt,
  fallback: buildFallbackCrisisNewsAssessment,
  maxAttempts: 2,
  validate: (output, context) =>
    assertSourcesGrounded(
      [...output.identifiedDrivers, ...output.notes],
      context.newsEvents.map((n) => n.source),
    ),
};

export const crisisNewsAgent = new StructuredAgent(crisisNewsAgentConfig);
