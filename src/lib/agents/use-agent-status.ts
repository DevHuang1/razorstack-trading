"use client";

import { useEffect, useState } from "react";
import type { AgentRole } from "@/lib/contracts/research";
import type { MascotState } from "@/components/AgentMascot";

export interface AgentStatusUpdate {
  agent_id: string;
  role: AgentRole;
  status: string;
  run_id?: string | null;
  headline?: string | null;
  detail?: string | null;
  progress?: number | null;
  metadata?: Record<string, string | number | boolean | null>;
}

interface FastApiEvent {
  event_type?: string;
  payload?: AgentStatusUpdate;
}

export function mascotStateForAgentStatus(status: string): MascotState | null {
  switch (status) {
    case "idle":
      return "idle";
    case "thinking":
    case "queued":
    case "running":
      return "thinking";
    case "speaking":
      return "speaking";
    case "success":
    case "completed":
      return "success";
    case "error":
    case "failed":
      return "error";
    default:
      return null;
  }
}

interface AgentStatusState {
  states: Partial<Record<AgentRole, MascotState>>;
  updates: Partial<Record<AgentRole, AgentStatusUpdate>>;
  connected: boolean;
}

function websocketUrl(): string {
  if (process.env.NEXT_PUBLIC_BACKEND_WS_URL) return process.env.NEXT_PUBLIC_BACKEND_WS_URL;
  if (typeof window === "undefined") return "ws://127.0.0.1:8000/events/ws";
  const protocol = window.location.protocol === "https:" ? "wss:" : "ws:";
  return `${protocol}//${window.location.hostname}:8000/events/ws`;
}

export function useAgentStatusStream(enabled = true): AgentStatusState {
  const [state, setState] = useState<AgentStatusState>({ states: {}, updates: {}, connected: false });

  useEffect(() => {
    if (!enabled || typeof window === "undefined" || typeof window.WebSocket === "undefined") return;

    const socket = new window.WebSocket(websocketUrl());
    socket.onopen = () => setState((current) => ({ ...current, connected: true }));
    socket.onclose = () => setState((current) => ({ ...current, connected: false }));
    socket.onerror = () => setState((current) => ({ ...current, connected: false }));
    socket.onmessage = (message) => {
      try {
        const event = JSON.parse(message.data as string) as FastApiEvent;
        const update = event.event_type === "AGENT_STATUS" ? event.payload : undefined;
        if (!update || !update.role) return;
        const mascotState = mascotStateForAgentStatus(update.status);
        if (!mascotState) return;
        setState((current) => ({
          connected: current.connected,
          states: { ...current.states, [update.role]: mascotState },
          updates: { ...current.updates, [update.role]: update },
        }));
      } catch {
        // Ignore malformed events; the stream is best-effort and should not break the desk.
      }
    };

    return () => socket.close();
  }, [enabled]);

  return state;
}
