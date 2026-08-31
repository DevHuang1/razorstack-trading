import type { AgentRole } from "@/lib/contracts/research";

export interface AgentProfile {
  role: AgentRole;
  name: string;
  title: string;
  mascot: "owl" | "hawk" | "bull" | "bear" | "compass";
  accent: string;
  softAccent: string;
  shortDescription: string;
  workingStyle: string;
}

export const AGENT_PROFILES: Record<AgentRole, AgentProfile> = {
  news: {
    role: "news",
    name: "Sage",
    title: "News Intelligence",
    mascot: "owl",
    accent: "#f59e0b",
    softAccent: "rgba(245, 158, 11, 0.14)",
    shortDescription: "Separates catalysts from noise across the information flow.",
    workingStyle: "Evidence first · catalyst aware",
  },
  market_research: {
    role: "market_research",
    name: "Vector",
    title: "Market Structure",
    mascot: "hawk",
    accent: "#38bdf8",
    softAccent: "rgba(56, 189, 248, 0.14)",
    shortDescription: "Reads price, trend, volatility, and the current market regime.",
    workingStyle: "Pattern focused · regime sensitive",
  },
  bull: {
    role: "bull",
    name: "Atlas",
    title: "Bull Case",
    mascot: "bull",
    accent: "#34d399",
    softAccent: "rgba(52, 211, 153, 0.14)",
    shortDescription: "Builds the strongest evidence-backed case for upside.",
    workingStyle: "Opportunity seeking · thesis driven",
  },
  bear: {
    role: "bear",
    name: "Mara",
    title: "Risk Challenge",
    mascot: "bear",
    accent: "#fb7185",
    softAccent: "rgba(251, 113, 133, 0.14)",
    shortDescription: "Stress-tests assumptions and surfaces ways the thesis can fail.",
    workingStyle: "Adversarial · loss aware",
  },
  investment_committee: {
    role: "investment_committee",
    name: "North",
    title: "Chief Investment Officer",
    mascot: "compass",
    accent: "#c084fc",
    softAccent: "rgba(192, 132, 252, 0.14)",
    shortDescription: "Synthesizes the desk into a decision with explicit uncertainty.",
    workingStyle: "Portfolio minded · decision oriented",
  },
  crisis_news: {
    role: "crisis_news",
    name: "Sentinel",
    title: "Crisis News",
    mascot: "owl",
    accent: "#f59e0b",
    softAccent: "rgba(245, 158, 11, 0.14)",
    shortDescription: "Monitors breaking news during crisis scenarios.",
    workingStyle: "Fast triage · impact focused",
  },
  crisis_market: {
    role: "crisis_market",
    name: "Radar",
    title: "Crisis Market",
    mascot: "hawk",
    accent: "#38bdf8",
    softAccent: "rgba(56, 189, 248, 0.14)",
    shortDescription: "Tracks price dislocations and liquidity during crises.",
    workingStyle: "Liquidity aware · regime sensitive",
  },
  crisis_risk_analyst: {
    role: "crisis_risk_analyst",
    name: "Gauge",
    title: "Crisis Risk Analyst",
    mascot: "bear",
    accent: "#fb7185",
    softAccent: "rgba(251, 113, 133, 0.14)",
    shortDescription: "Measures tail risk and portfolio exposure during crises.",
    workingStyle: "Loss aware · stress focused",
  },
  crisis_options: {
    role: "crisis_options",
    name: "Hedge",
    title: "Crisis Options",
    mascot: "compass",
    accent: "#c084fc",
    softAccent: "rgba(192, 132, 252, 0.14)",
    shortDescription: "Evaluates hedging structures during crisis scenarios.",
    workingStyle: "Protection seeking · cost aware",
  },
  crisis_committee: {
    role: "crisis_committee",
    name: "Apex",
    title: "Crisis Committee",
    mascot: "compass",
    accent: "#c084fc",
    softAccent: "rgba(192, 132, 252, 0.14)",
    shortDescription: "Synthesizes crisis signals into actionable decisions.",
    workingStyle: "Decision oriented · risk calibrated",
  },
};

export function getAgentProfile(role: AgentRole): AgentProfile {
  return AGENT_PROFILES[role];
}
