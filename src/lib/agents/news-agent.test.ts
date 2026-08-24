import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { generateText } from "ai";
import {
  NewsAnalysisSchema,
  type NewsAnalysis,
  type NewsItem,
} from "@/lib/contracts/research";
import { buildFallbackNewsAnalysis, buildNewsPrompt, newsAgent } from "./news-agent";

vi.mock("ai", () => ({
  generateText: vi.fn(),
  Output: { object: (schema: unknown) => ({ schema }) },
}));

const ORIGINAL_KEY = process.env.OPENAI_API_KEY;

const positiveItem: NewsItem = {
  id: "n1",
  headline: "NVDA beats quarterly earnings expectations on strong revenue growth",
  summary: "Revenue and EPS came in above consensus.",
  source: "Reuters",
  publishedAt: "2026-08-20T14:30:00.000Z",
  sentiment: 0.6,
};

const negativeItem: NewsItem = {
  id: "n2",
  headline: "NVDA faces rising competition and margin pressure",
  summary: "Analysts flag pricing pressure from rivals.",
  source: "Bloomberg",
  publishedAt: "2026-08-21T09:00:00.000Z",
  sentiment: -0.5,
};

const blogItem: NewsItem = {
  id: "n3",
  headline: "Random blog post mentions NVDA positively",
  summary: "Low quality aggregator content.",
  source: "Random Blog",
  publishedAt: "2026-08-22T11:00:00.000Z",
  sentiment: 0.6,
};

const llmOutput: NewsAnalysis = {
  symbol: "NVDA",
  sentiment: 0.35,
  catalysts: [{ kind: "interpretation", statement: "Earnings beat supports demand thesis" }],
  negativeFactors: [{ kind: "interpretation", statement: "Margin pressure may cap upside" }],
  materialEvents: [{ kind: "observation", statement: "Earnings beat reported by Reuters" }],
  notes: [],
  timeHorizon: "short_term",
  confidence: 66,
  informationQuality: "high",
};

beforeEach(() => {
  vi.resetAllMocks();
  process.env.OPENAI_API_KEY = "test-key";
});

afterEach(() => {
  if (ORIGINAL_KEY === undefined) {
    delete process.env.OPENAI_API_KEY;
  } else {
    process.env.OPENAI_API_KEY = ORIGINAL_KEY;
  }
});

describe("newsAgent.run (LLM path, mocked)", () => {
  it("returns validated LLM output and feeds only provided articles into the prompt", async () => {
    vi.mocked(generateText).mockResolvedValue({ output: llmOutput } as never);
    const result = await newsAgent.run({
      symbol: "NVDA",
      news: [positiveItem, negativeItem],
    });
    expect(result).toEqual(llmOutput);
    const call = vi.mocked(generateText).mock.calls[0][0];
    expect(call.system).toContain("NEVER invent news");
    expect(call.system).toContain("UNTRUSTED DATA");
    expect(call.prompt).toContain(positiveItem.headline);
    expect(call.prompt).toContain('source="Reuters"');
  });

  it("retries once after a transient failure before succeeding", async () => {
    vi.mocked(generateText)
      .mockRejectedValueOnce(new Error("rate limited"))
      .mockResolvedValueOnce({ output: llmOutput } as never);
    const result = await newsAgent.run({ symbol: "NVDA", news: [positiveItem] });
    expect(result.symbol).toBe("NVDA");
    expect(vi.mocked(generateText)).toHaveBeenCalledTimes(2);
  });

  it("falls back deterministically after repeated failures", async () => {
    vi.mocked(generateText).mockRejectedValue(new Error("provider down"));
    const result = await newsAgent.run({ symbol: "NVDA", news: [positiveItem] });
    expect(NewsAnalysisSchema.parse(result)).toBeTruthy();
    expect(result.catalysts.length).toBeGreaterThan(0);
  });

  it("skips the LLM entirely when no API key is configured", async () => {
    delete process.env.OPENAI_API_KEY;
    const result = await newsAgent.run({ symbol: "NVDA", news: [positiveItem] });
    expect(generateText).not.toHaveBeenCalled();
    expect(result.informationQuality).toBe("high");
  });

  it("rejects malformed articles instead of guessing", async () => {
    await expect(
      newsAgent.run({
        symbol: "NVDA",
        news: [{ ...positiveItem, headline: 42 } as unknown as NewsItem],
      }),
    ).rejects.toThrow();
    expect(generateText).not.toHaveBeenCalled();
  });
});

describe("buildFallbackNewsAnalysis", () => {
  it("separates bullish and bearish items and keeps the disagreement visible", () => {
    const analysis = buildFallbackNewsAnalysis({
      symbol: "NVDA",
      news: [positiveItem, negativeItem],
    });
    expect(analysis.catalysts[0].statement).toContain(positiveItem.headline);
    expect(analysis.catalysts[0].statement).toContain("Reuters");
    expect(analysis.negativeFactors[0].statement).toContain(negativeItem.headline);
    const notes = JSON.stringify(analysis);
    expect(notes).toContain("Conflicting signals");
    expect(analysis.sentiment).toBe(0.05);
  });

  it("pins confidence deterministically for known-source conflicting coverage", () => {
    const analysis = buildFallbackNewsAnalysis({
      symbol: "NVDA",
      news: [positiveItem, negativeItem],
    });
    expect(analysis.confidence).toBe(58);
    expect(analysis.timeHorizon).toBe("short_term");
    expect(analysis.informationQuality).toBe("high");
  });

  it("lowers confidence and quality when only unknown sources are provided", () => {
    const analysis = buildFallbackNewsAnalysis({
      symbol: "NVDA",
      news: [
        { ...blogItem, sentiment: 0.6 },
        { ...blogItem, id: "n4", headline: "Blog warns about NVDA", sentiment: -0.5 },
      ],
    });
    expect(analysis.informationQuality).toBe("low");
    expect(analysis.confidence).toBe(46);
  });

  it("reports insufficient information when no news is provided", () => {
    const analysis = buildFallbackNewsAnalysis({ symbol: "NVDA", news: [] });
    expect(analysis).toEqual(
      expect.objectContaining({
        sentiment: 0,
        timeHorizon: "insufficient_data",
        informationQuality: "insufficient",
        confidence: 25,
      }),
    );
    expect(analysis.catalysts).toHaveLength(0);
    expect(analysis.negativeFactors).toHaveLength(0);
  });

  it("flags material events from headlines without inventing any", () => {
    const analysis = buildFallbackNewsAnalysis({ symbol: "NVDA", news: [positiveItem] });
    expect(analysis.materialEvents[0].statement).toContain("Material event reported");
    expect(analysis.materialEvents[0].kind).toBe("observation");
    expect(analysis.materialEvents[0].statement).toContain("(source: Reuters)");
  });

  it("never cites a source that was not provided", () => {
    const analysis = buildFallbackNewsAnalysis({ symbol: "NVDA", news: [positiveItem] });
    const text = JSON.stringify(analysis);
    expect(text).not.toContain("WSJ");
    expect(text).not.toContain("Bloomberg");
  });
});

describe("buildNewsPrompt", () => {
  it("renders provider metadata verbatim for each article", () => {
    const prompt = buildNewsPrompt({ symbol: "NVDA", news: [negativeItem] });
    expect(prompt).toContain('<article id="1" source="Bloomberg"');
    expect(prompt).toContain('providerSentiment="-0.5"');
    expect(prompt).toContain(negativeItem.summary);
  });

  it("instructs the model to report insufficiency rather than invent coverage", () => {
    const prompt = buildNewsPrompt({ symbol: "NVDA", news: [] });
    expect(prompt).toContain("PROVIDED ARTICLES: none");
    expect(prompt).toContain("insufficient_data");
  });
});
