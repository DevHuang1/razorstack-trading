import {
  NewsAgentInputSchema,
  NewsAnalysisSchema,
  type AnalysisStatement,
  type NewsAgentInput,
  type NewsAnalysis,
  type NewsItem,
} from "@/lib/contracts/research";
import { StructuredAgent, type StructuredAgentConfig } from "./base-agent";
import { assertSourcesGrounded } from "./grounding";
import { NEWS_SYSTEM } from "./prompts";

const KNOWN_SOURCES = new Set([
  "reuters",
  "bloomberg",
  "cnbc",
  "benzinga",
  "associated press",
  "ap",
  "wall street journal",
  "wsj",
  "financial times",
  "ft",
  "marketwatch",
  "barron's",
  "alpaca news",
]);

const MATERIAL_KEYWORDS = [
  "earnings",
  "guidance",
  "guides",
  "merger",
  "acquisition",
  "fda",
  "lawsuit",
  "sec ",
  "downgrade",
  "upgrade",
  "buyback",
  "dividend",
  "partnership",
  "probe",
  "recall",
  "ceo",
  "cfo",
];

const SHORT_TERM_KEYWORDS = ["earnings", "guidance", "guides", "upgrade", "downgrade", "recall"];
const LONG_TERM_KEYWORDS = [
  "merger",
  "acquisition",
  "fda",
  "lawsuit",
  "sec ",
  "partnership",
  "buyback",
  "dividend",
];

const CATALYST_THRESHOLD = 0.15;

function observation(statement: string): AnalysisStatement {
  return { kind: "observation", statement };
}

function interpretation(statement: string): AnalysisStatement {
  return { kind: "interpretation", statement };
}

function isKnownSource(source: string): boolean {
  return KNOWN_SOURCES.has(source.trim().toLowerCase());
}

function informationQuality(news: NewsItem[]): NewsAnalysis["informationQuality"] {
  if (news.length === 0) return "insufficient";
  const knownRatio = news.filter((n) => isKnownSource(n.source)).length / news.length;
  if (knownRatio >= 0.75) return "high";
  if (knownRatio >= 0.4) return "medium";
  return "low";
}

function timeHorizon(news: NewsItem[]): NewsAnalysis["timeHorizon"] {
  if (news.length === 0) return "insufficient_data";
  const text = news.map((n) => n.headline.toLowerCase()).join(" ");
  const hasShort = SHORT_TERM_KEYWORDS.some((k) => text.includes(k));
  const hasLong = LONG_TERM_KEYWORDS.some((k) => text.includes(k));
  if (hasShort && hasLong) return "mixed";
  if (hasShort) return "short_term";
  if (hasLong) return "long_term";
  return "medium_term";
}

export function buildFallbackNewsAnalysis(input: NewsAgentInput): NewsAnalysis {
  const { symbol, news } = input;

  const catalysts = news
    .filter((n) => (n.sentiment ?? 0) >= CATALYST_THRESHOLD)
    .map((n) => observation(`${n.headline} (source: ${n.source})`));
  const negativeFactors = news
    .filter((n) => (n.sentiment ?? 0) <= -CATALYST_THRESHOLD)
    .map((n) => observation(`${n.headline} (source: ${n.source})`));
  const materialEvents = news
    .filter((n) => {
      const headline = n.headline.toLowerCase();
      return MATERIAL_KEYWORDS.some((k) => headline.includes(k));
    })
    .map((n) => observation(`Material event reported: ${n.headline} (source: ${n.source})`));

  const statements: AnalysisStatement[] = [];
  if (news.length > 1 && catalysts.length > 0 && negativeFactors.length > 0) {
    statements.push(
      interpretation(
        `Conflicting signals in provided coverage: ${catalysts.length} bullish vs ${negativeFactors.length} bearish item(s); both sides retained`,
      ),
    );
  }

  const sentiment =
    news.length === 0
      ? 0
      : Number((news.reduce((acc, n) => acc + (n.sentiment ?? 0), 0) / news.length).toFixed(2));

  let confidence = news.length === 0 ? 25 : 40 + Math.min(news.length, 3) * 8;
  const quality = informationQuality(news);
  if (quality === "high") confidence += 12;
  else if (quality === "medium") confidence += 6;
  if (catalysts.length > 0 && negativeFactors.length > 0) confidence -= 10;
  confidence = Math.min(90, Math.max(5, confidence));

  return NewsAnalysisSchema.parse({
    symbol,
    sentiment,
    catalysts,
    negativeFactors,
    materialEvents,
    notes: statements,
    timeHorizon: timeHorizon(news),
    confidence,
    informationQuality: quality,
  });
}

export function buildNewsPrompt(input: NewsAgentInput): string {
  if (input.news.length === 0) {
    return `Symbol: ${input.symbol}\n\nPROVIDED ARTICLES: none.\n\nNo usable news was provided. Report insufficient_data for timeHorizon and "insufficient" for informationQuality, keep catalysts and negativeFactors empty, set a neutral sentiment and low confidence. Do not invent any event.`;
  }
  const articles = input.news
    .map(
      (n, i) =>
        `<article id="${i + 1}" source="${n.source}" publishedAt="${n.publishedAt}"${
          n.sentiment !== null ? ` providerSentiment="${n.sentiment}"` : ""
        }>\nheadline: ${n.headline}\nsummary: ${n.summary}\n</article>`,
    )
    .join("\n\n");
  return `Symbol: ${input.symbol}

PROVIDED ARTICLES (the complete universe of what exists — do not add anything beyond these):
${articles}

Assess the provided coverage per your rules: facts vs interpretations, bullish vs bearish catalysts, material events, time horizon, contradictions kept visible, information quality, and lowered confidence when evidence is thin.`;
}

export const newsAgentConfig: StructuredAgentConfig<NewsAgentInput, NewsAnalysis> = {
  name: "NewsAgent",
  role: "news",
  description:
    "Assesses whether provided news represents bullish, bearish or neutral catalysts, without browsing or inventing sources",
  systemPrompt: NEWS_SYSTEM,
  inputSchema: NewsAgentInputSchema,
  outputSchema: NewsAnalysisSchema,
  buildPrompt: buildNewsPrompt,
  fallback: buildFallbackNewsAnalysis,
  maxAttempts: 2,
  validate: (output, input) =>
    assertSourcesGrounded(
      [...output.catalysts, ...output.negativeFactors, ...output.materialEvents],
      input.news.map((n) => n.source),
    ),
};

export const newsAgent = new StructuredAgent(newsAgentConfig);
