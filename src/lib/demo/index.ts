import { AnalyzeOpportunityInputSchema, type AnalyzeOpportunityInput } from "@/lib/contracts/research";
import type { CrisisContext } from "@/lib/contracts/crisis";
import {
  InvestmentAnalysisResultSchema,
  CrisisAnalysisResultSchema,
  type DemoStepEvent,
  type InvestmentAnalysisResult,
  type CrisisAnalysisResult,
} from "@/lib/contracts/demo";

export type { DemoStepEvent, InvestmentAnalysisResult, CrisisAnalysisResult };
import { createLogger } from "@/lib/agents/logger";
import { marketResearchAgent } from "@/lib/agents/market-research-agent";
import { newsAgent } from "@/lib/agents/news-agent";
import { bullAgent } from "@/lib/agents/bull-agent";
import { bearAgent } from "@/lib/agents/bear-agent";
import { investmentCommitteeAgent } from "@/lib/agents/investment-committee-agent";
import { crisisNewsAgent } from "@/lib/agents/crisis/crisis-news-agent";
import { crisisMarketAgent } from "@/lib/agents/crisis/crisis-market-agent";
import { crisisRiskAnalyst } from "@/lib/agents/crisis/crisis-risk-analyst";
import { crisisOptionsAgent } from "@/lib/agents/crisis/crisis-options-agent";
import { crisisCommitteeAgent } from "@/lib/agents/crisis/crisis-committee-agent";

const log = createLogger("demo");

export interface DemoRunOptions {
  deterministic?: boolean;
  onStep?: (event: DemoStepEvent) => void;
}

function emitStep(agent: string, status: DemoStepEvent["status"], options: DemoRunOptions): void {
  log.info(`${agent} -> ${status}`);
  options.onStep?.({ agent, status });
}

// Mutates process.env for the duration of `run`: safe only because demo runs are
// single-flight (concurrent LLM-backed requests would lose their key mid-run).
// Clears every configured LLM key (Groq / XAI / Grok / legacy OpenAI) so
// deterministic runs always fall back to the offline mock pipeline.
const LLM_KEYS = ["GROQ_API_KEY", "XAI_API_KEY", "GROK_API_KEY", "OPENAI_API_KEY"] as const;
async function withDeterministicLock<T>(options: DemoRunOptions, run: () => Promise<T>): Promise<T> {
  if (!options.deterministic) return run();
  const previous = new Map<string, string | undefined>();
  for (const k of LLM_KEYS) {
    previous.set(k, process.env[k]);
    delete process.env[k];
  }
  try {
    return await run();
  } finally {
    for (const k of LLM_KEYS) {
      const prev = previous.get(k);
      if (prev !== undefined) process.env[k] = prev;
    }
  }
}

export async function runInvestmentAnalysis(
  input: AnalyzeOpportunityInput,
  options: DemoRunOptions = {},
): Promise<InvestmentAnalysisResult> {
  return withDeterministicLock(options, async () => {
    const parsed = AnalyzeOpportunityInputSchema.parse(input);
    const symbol = parsed.symbol;

    emitStep("Research Agent", "started", options);
    const marketAnalysis = await marketResearchAgent.run({ symbol, snapshot: parsed.marketData });
    emitStep("Research Agent", "completed", options);

    emitStep("News Agent", "started", options);
    const newsAnalysis = await newsAgent.run({ symbol, news: parsed.news });
    emitStep("News Agent", "completed", options);

    const thesisInput = {
      symbol,
      marketAnalysis,
      newsAnalysis,
      portfolioContext: parsed.portfolioContext,
    };
    emitStep("Bull Agent", "started", options);
    emitStep("Bear Agent", "started", options);
    const [bullOpinion, bearOpinion] = await Promise.all([
      bullAgent.run(thesisInput),
      bearAgent.run(thesisInput),
    ]);
    emitStep("Bull Agent", "completed", options);
    emitStep("Bear Agent", "completed", options);

    emitStep("Committee", "started", options);
    const tradeProposal = await investmentCommitteeAgent.run({
      ...thesisInput,
      bullOpinion,
      bearOpinion,
    });
    emitStep("Committee", "completed", options);

    return InvestmentAnalysisResultSchema.parse({
      marketAnalysis,
      newsAnalysis,
      bullOpinion,
      bearOpinion,
      debate: tradeProposal.debate,
      tradeProposal,
    });
  });
}

export async function runCrisisAnalysis(
  context: CrisisContext,
  options: DemoRunOptions = {},
): Promise<CrisisAnalysisResult> {
  return withDeterministicLock(options, async () => {
    emitStep("Crisis News Agent", "started", options);
    emitStep("Crisis Market Agent", "started", options);
    emitStep("Crisis Risk Analyst", "started", options);
    emitStep("Crisis Options Agent", "started", options);
    const [newsAssessment, marketRegime, riskAnalysis, optionsPlaybook] = await Promise.all([
      crisisNewsAgent.run(context),
      crisisMarketAgent.run(context),
      crisisRiskAnalyst.run(context),
      crisisOptionsAgent.run(context),
    ]);
    emitStep("Crisis News Agent", "completed", options);
    emitStep("Crisis Market Agent", "completed", options);
    emitStep("Crisis Risk Analyst", "completed", options);
    emitStep("Crisis Options Agent", "completed", options);

    emitStep("Crisis Committee", "started", options);
    const crisisResponse = await crisisCommitteeAgent.run({
      context,
      newsAssessment,
      marketRegime,
      riskAnalysis,
      optionsPlaybook,
    });
    emitStep("Crisis Committee", "completed", options);

    return CrisisAnalysisResultSchema.parse({
      crisisAnalysis: marketRegime,
      agentOpinions: { newsAssessment, marketRegime, riskAnalysis, optionsPlaybook },
      crisisResponse,
    });
  });
}
