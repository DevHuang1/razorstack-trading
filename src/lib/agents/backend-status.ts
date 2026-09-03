import { backendFetch } from "@/lib/backend/client";
import { createLogger } from "./logger";

// Publishes research-desk agent lifecycle updates to the FastAPI event bus
// (POST /agents/status) so they appear alongside trade lifecycle events on
// /events/ws and the backend dashboard. Publishing is best-effort: it must
// never delay or fail the research pipeline.

const log = createLogger("backend-status");

const PUBLISH_TIMEOUT_MS = 5_000;

export type BackendAgentRole = "news" | "market" | "bull" | "bear" | "cio";

export type BackendAgentStatus = "idle" | "thinking" | "speaking" | "success" | "error";

export interface BackendAgentStatusUpdate {
  agent_id: string;
  role: BackendAgentRole;
  status: BackendAgentStatus;
  run_id?: string;
  headline?: string;
  detail?: string;
  progress?: number;
}

const STEP_ROLES: Record<string, BackendAgentRole> = {
  market_research: "market",
  news: "news",
  advocates: "bull",
  investment_committee: "cio",
};

export function roleForPipelineStep(step: string): BackendAgentRole {
  return STEP_ROLES[step] ?? "cio";
}

export function agentIdForPipelineStep(step: string): string {
  return `${step.replace(/_/g, "-")}-agent-v1`;
}

export async function publishAgentStatus(update: BackendAgentStatusUpdate): Promise<boolean> {
  const result = await backendFetch("/agents/status", {
    method: "POST",
    body: JSON.stringify(update),
    timeoutMs: PUBLISH_TIMEOUT_MS,
  });
  if (!result.ok) {
    log.debug("agent status not published", { error: result.error });
    return false;
  }
  return true;
}

export function fireAndForgetPublish(update: BackendAgentStatusUpdate): void {
  void publishAgentStatus(update).catch((error: unknown) => {
    log.debug("agent status publish crashed", error);
  });
}