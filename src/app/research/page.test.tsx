import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { AGENT_PROFILES } from "@/lib/agents/profiles";
import type { AgentRole } from "@/lib/contracts/research";
import ResearchDeskPage from "./page";

const roles: AgentRole[] = ["news", "market_research", "bull", "bear", "investment_committee"];

function streamedResearchResponse(): Response {
  const events = [
    { type: "status", step: "news", detail: "News intelligence is reviewing catalysts" },
    ...roles.map((role) => ({
      type: "agent_message",
      message: {
        role,
        stance: role === "bear" ? "bearish" : role === "investment_committee" ? "neutral" : "bullish",
        headline: `${AGENT_PROFILES[role].name} report for AAPL`,
        body: `${AGENT_PROFILES[role].title} report body`,
        confidence: 70,
        keyPoints: ["A test key point"],
      },
    })),
    {
      type: "thesis",
      thesis: {
        symbol: "AAPL",
        generatedAt: "2026-08-27T00:00:00.000Z",
        direction: "BULLISH",
        confidence: 74,
        summary: "The desk sees a measured upside case.",
        catalysts: ["Demand remains resilient"],
        risks: ["Valuation can compress"],
        recommendation: "Use a defined-risk position and monitor the invalidation level.",
        suggestedStrategy: { structure: "bull_call_spread", rationale: "Defined risk", estimatedMaxRiskUsd: 500 },
      },
    },
    { type: "done" },
  ];
  return new Response(`${events.map((event) => JSON.stringify(event)).join("\n")}\n`, {
    status: 200,
    headers: { "Content-Type": "application/x-ndjson" },
  });
}

describe("Research desk agent cards", () => {
  beforeEach(() => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(streamedResearchResponse()));
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("renders every mascot card and updates the CIO synthesis from the stream", async () => {
    render(<ResearchDeskPage />);

    fireEvent.change(screen.getByRole("textbox", { name: "Ticker symbol" }), {
      target: { value: "aapl" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Run desk" }));

    await waitFor(() => expect(screen.getByText(/Desk synthesis complete/)).toBeInTheDocument());
    expect(screen.getByText("The desk sees a measured upside case.")).toBeInTheDocument();
    expect(screen.getByText("Use a defined-risk position and monitor the invalidation level.")).toBeInTheDocument();
    expect(screen.getByText("AAPL")).toBeInTheDocument();

    for (const role of roles) {
      const profile = AGENT_PROFILES[role];
      expect(screen.getAllByText(profile.name).length).toBeGreaterThan(0);
      expect(screen.getAllByText(profile.title).length).toBeGreaterThan(0);
    }

    expect(fetch).toHaveBeenCalledWith(
      "/api/research",
      expect.objectContaining({
        method: "POST",
        body: JSON.stringify({ symbol: "AAPL" }),
      }),
    );
  });

  it("shows client-side validation for an invalid ticker", async () => {
    render(<ResearchDeskPage />);
    fireEvent.change(screen.getByRole("textbox", { name: "Ticker symbol" }), {
      target: { value: "AAPL!" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Run desk" }));

    expect(await screen.findByText("Enter a valid ticker symbol, for example NVDA.")).toBeInTheDocument();
    expect(fetch).not.toHaveBeenCalled();
  });
});
