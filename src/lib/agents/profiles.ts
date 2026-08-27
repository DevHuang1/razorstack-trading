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
  market: {
    role: "market",
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
  cio: {
    role: "cio",
    name: "North",
    title: "Chief Investment Officer",
    mascot: "compass",
    accent: "#c084fc",
    softAccent: "rgba(192, 132, 252, 0.14)",
    shortDescription: "Synthesizes the desk into a decision with explicit uncertainty.",
    workingStyle: "Portfolio minded · decision oriented",
  },
};

export function getAgentProfile(role: AgentRole): AgentProfile {
  return AGENT_PROFILES[role];
}
