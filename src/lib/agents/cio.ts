import {
  AnalyzeOpportunityInputSchema,
  type AnalyzeOpportunityInput,
  type PipelineEvent,
} from "@/lib/contracts/research";
import { marketDataProvider } from "@/lib/data/market-data";
import { createLogger } from "./logger";
import { serializeTradeProposal } from "./analyze-opportunity";
import { bearAgent } from "./bear-agent";
import { bullAgent } from "./bull-agent";
import { investmentCommitteeAgent } from "./investment-committee-agent";
import { marketResearchAgent } from "./market-research-agent";
import { newsAgent } from "./news-agent";

const log = createLogger("pipeline");

export async function buildResearchInput(symbol: string): Promise<AnalyzeOpportunityInput> {
  const upper = symbol.toUpperCase();
  const [marketData, news] = await Promise.all([
    marketDataProvider.getMarketSnapshot(upper),
    marketDataProvider.getRecentNews(upper),
  ]);
  return AnalyzeOpportunityInputSchema.parse({ symbol: upper, marketData, news });
}

export async function* runResearchPipeline(
  input: AnalyzeOpportunityInput,
): AsyncGenerator<PipelineEvent> {
  log.info("research pipeline started");
  let parsed: AnalyzeOpportunityInput;
  try {
    parsed = AnalyzeOpportunityInputSchema.parse(input);
  } catch (error) {
    yield {
      type: "error",
      step: "pipeline",
      message: error instanceof Error ? error.message : String(error),
    };
    return;
  }
  const symbol = parsed.symbol;
  log.info("research pipeline validated", { symbol });

  try {
    yield { type: "status", step: "market_research", detail: "started" };
    const marketAnalysis = await marketResearchAgent.run({ symbol, snapshot: parsed.marketData });
    yield { type: "market_analysis", analysis: marketAnalysis };
    yield { type: "status", step: "market_research", detail: "completed" };

    yield { type: "status", step: "news", detail: "started" };
    const newsAnalysis = await newsAgent.run({ symbol, news: parsed.news });
    yield { type: "news_analysis", analysis: newsAnalysis };
    yield { type: "status", step: "news", detail: "completed" };

    const thesisInput = {
      symbol,
      marketAnalysis,
      newsAnalysis,
      portfolioContext: parsed.portfolioContext,
    };
    yield { type: "status", step: "advocates", detail: "started" };
    const [bullOpinion, bearOpinion] = await Promise.all([
      bullAgent.run(thesisInput),
      bearAgent.run(thesisInput),
    ]);
    yield { type: "agent_opinion", role: "bull", opinion: bullOpinion };
    yield { type: "agent_opinion", role: "bear", opinion: bearOpinion };
    yield { type: "status", step: "advocates", detail: "completed" };

    yield { type: "status", step: "investment_committee", detail: "started" };
    const tradeProposal = await investmentCommitteeAgent.run({
      ...thesisInput,
      bullOpinion,
      bearOpinion,
    });
    yield { type: "trade_proposal", proposal: serializeTradeProposal(tradeProposal) };
    yield { type: "status", step: "investment_committee", detail: "completed" };

    yield { type: "done" };
    log.info("research pipeline completed", { symbol });
  } catch (error) {
    log.error("research pipeline failed", error);
    yield {
      type: "error",
      step: "pipeline",
      message: error instanceof Error ? error.message : String(error),
    };
  }
}
