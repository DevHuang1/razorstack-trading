import {
  AnalyzeOpportunityInputSchema,
  type AnalyzeOpportunityInput,
  type PipelineEvent,
} from "@/lib/contracts/research";
import { marketDataProvider } from "@/lib/data/market-data";
import { fetchBackendPortfolioContext } from "@/lib/data/backend-portfolio";
import { createLogger } from "./logger";
import { fireAndForgetPublish, roleForPipelineStep } from "./backend-status";
import { serializeTradeProposal } from "./analyze-opportunity";
import { bearAgent } from "./bear-agent";
import { bullAgent } from "./bull-agent";
import { investmentCommitteeAgent } from "./investment-committee-agent";
import { marketResearchAgent } from "./market-research-agent";
import { newsAgent } from "./news-agent";
import {
  committeeMessage,
  marketMessage,
  newsMessage,
  opinionMessage,
  toAIThesis,
} from "./research-events";

const log = createLogger("pipeline");

function newRunId(): string {
  return typeof crypto !== "undefined" && typeof crypto.randomUUID === "function"
    ? crypto.randomUUID()
    : `run-${Date.now()}-${Math.floor(Math.random() * 1e6)}`;
}

// Mirror pipeline stage transitions onto the backend event bus so agent
// activity shows up on /events/ws and the FastAPI dashboard.
function publishStageStatus(
  runId: string,
  symbol: string,
  step: string,
  status: "thinking" | "success" | "error",
): void {
  fireAndForgetPublish({
    agent_id: `${step === "advocates" ? "bull" : step.replace(/_/g, "-")}-agent-v1`,
    role: roleForPipelineStep(step),
    status,
    run_id: runId,
    detail: `${symbol} ${step} ${status}`,
  });
}

export async function buildResearchInput(symbol: string): Promise<AnalyzeOpportunityInput> {
  const upper = symbol.toUpperCase();
  const [marketData, news, portfolioContext] = await Promise.all([
    marketDataProvider.getMarketSnapshot(upper),
    marketDataProvider.getRecentNews(upper),
    fetchBackendPortfolioContext(),
  ]);
  return AnalyzeOpportunityInputSchema.parse({
    symbol: upper,
    marketData,
    news,
    ...(portfolioContext ? { portfolioContext } : {}),
  });
}

export async function* runResearchPipeline(
  input: AnalyzeOpportunityInput,
): AsyncGenerator<PipelineEvent> {
  log.info("research pipeline started");
  let parsed: AnalyzeOpportunityInput;
  try {
    parsed = AnalyzeOpportunityInputSchema.parse(input);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    yield {
      type: "error",
      step: "pipeline",
      message,
      detail: message,
    };
    return;
  }
  const symbol = parsed.symbol;
  const runId = newRunId();
  // One timestamp per pipeline run: every event in the stream shares it, which
  // also makes mock-mode runs byte-identical for the same input.
  const generatedAt = new Date().toISOString();
  log.info("research pipeline validated", { symbol, runId });

  try {
    yield { type: "status", step: "market_research", detail: "started" };
    publishStageStatus(runId, symbol, "market_research", "thinking");
    const marketAnalysis = await marketResearchAgent.run({ symbol, snapshot: parsed.marketData });
    yield { type: "market_analysis", analysis: marketAnalysis };
    yield { type: "agent_message", message: marketMessage(marketAnalysis) };
    yield {
      type: "status",
      step: "market_research",
      detail:
        parsed.marketData.dataSource === "mock" || parsed.marketData.dataSource === "synthetic"
          ? `completed (using ${parsed.marketData.dataSource} data — offline fallback)`
          : "completed",
    };
    publishStageStatus(runId, symbol, "market_research", "success");

    yield { type: "status", step: "news", detail: "started" };
    publishStageStatus(runId, symbol, "news", "thinking");
    const newsAnalysis = await newsAgent.run({ symbol, news: parsed.news });
    yield { type: "news_analysis", analysis: newsAnalysis };
    yield { type: "agent_message", message: newsMessage(newsAnalysis) };
    yield { type: "status", step: "news", detail: "completed" };
    publishStageStatus(runId, symbol, "news", "success");

    const thesisInput = {
      symbol,
      marketAnalysis,
      newsAnalysis,
      portfolioContext: parsed.portfolioContext,
    };
    yield { type: "status", step: "advocates", detail: "started" };
    publishStageStatus(runId, symbol, "advocates", "thinking");
    const [bullOpinion, bearOpinion] = await Promise.all([
      bullAgent.run(thesisInput),
      bearAgent.run(thesisInput),
    ]);
    yield { type: "agent_opinion", role: "bull", opinion: bullOpinion };
    yield { type: "agent_opinion", role: "bear", opinion: bearOpinion };
    yield { type: "agent_message", message: opinionMessage("bull", bullOpinion) };
    yield { type: "agent_message", message: opinionMessage("bear", bearOpinion) };
    yield { type: "status", step: "advocates", detail: "completed" };
    publishStageStatus(runId, symbol, "advocates", "success");

    yield { type: "status", step: "investment_committee", detail: "started" };
    publishStageStatus(runId, symbol, "investment_committee", "thinking");
    const tradeProposal = await investmentCommitteeAgent.run({
      ...thesisInput,
      bullOpinion,
      bearOpinion,
    });
    yield { type: "trade_proposal", proposal: serializeTradeProposal(tradeProposal, { generatedAt }) };
    yield { type: "agent_message", message: committeeMessage(tradeProposal) };
    yield { type: "thesis", thesis: toAIThesis(tradeProposal) };
    yield { type: "status", step: "investment_committee", detail: "completed" };
    publishStageStatus(runId, symbol, "investment_committee", "success");

    yield { type: "done" };
    log.info("research pipeline completed", { symbol, runId });
  } catch (error) {
    log.error("research pipeline failed", error);
    const message = error instanceof Error ? error.message : String(error);
    publishStageStatus(runId, symbol, "pipeline", "error");
    yield {
      type: "error",
      step: "pipeline",
      message,
      detail: message,
    };
  }
}
