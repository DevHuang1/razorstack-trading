/**
 * agents.ts — AI agent implementations for the Research Desk
 *
 * Each agent calls Claude via askClaudeJson() and returns an AgentMessage
 * suitable for streaming to the UI plus, for committee agents, a CIOSynthesis.
 */

import { askClaudeJson } from "./llm";
import type { MarketSnapshot, NewsItem } from "@/lib/contracts/research";

// ─── Shared output types ──────────────────────────────────────────────────────

export interface AgentMessage {
  role: string;
  stance: "bullish" | "bearish" | "neutral";
  headline: string;
  body: string;
  confidence: number | null;
}

export interface CIOSynthesis {
  symbol: string;
  direction: string;
  confidence: number;
  summary: string;
  catalysts: string[];
  risks: string[];
  recommendation: string;
}