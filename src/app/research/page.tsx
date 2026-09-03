"use client";

import { useCallback, useMemo, useState } from "react";
import { AgentMascot, type MascotState } from "@/components/AgentMascot";
import { AGENT_PROFILES } from "@/lib/agents/profiles";
import { useAgentStatusStream } from "@/lib/agents/use-agent-status";
import type { AgentRole } from "@/lib/contracts/research";

interface AgentMessage {
  role: AgentRole;
  stance: "bullish" | "bearish" | "neutral";
  headline: string;
  body: string;
  confidence: number | null;
}

interface AIThesis {
  symbol: string;
  direction: string;
  confidence: number;
  summary: string;
  catalysts: string[];
  risks: string[];
  recommendation: string;
}

interface StreamEvent {
  type: string;
  step?: string;
  detail?: string;
  message?: AgentMessage;
  thesis?: AIThesis;
}

const NORMAL_AGENT_ORDER: AgentRole[] = [
  "news",
  "market_research",
  "bull",
  "bear",
  "investment_committee",
];

const CRISIS_AGENT_ORDER: AgentRole[] = [
  "crisis_news",
  "crisis_market",
  "crisis_risk_analyst",
  "crisis_options",
  "crisis_committee",
];

const STANCE_STYLES: Record<AgentMessage["stance"], string> = {
  bullish: "border-emerald-400/30 bg-emerald-400/10 text-emerald-300",
  bearish: "border-rose-400/30 bg-rose-400/10 text-rose-300",
  neutral: "border-zinc-700 bg-zinc-900 text-zinc-400",
};

function AgentCard({
  message,
  mascotState,
}: {
  message?: AgentMessage;
  mascotState: MascotState;
}) {
  const profile = AGENT_PROFILES[message?.role ?? "news"];
  const active = mascotState === "thinking";
  const statusLabel =
    mascotState === "idle"
      ? "standby"
      : mascotState === "success"
        ? "complete"
        : mascotState === "error"
          ? "error"
          : mascotState;
  return (
    <article
      className="rounded-2xl border p-4 transition-colors"
      style={{
        borderColor: active ? `${profile.accent}66` : "rgba(255,255,255,.08)",
        backgroundColor: active
          ? profile.softAccent
          : "rgba(17, 24, 39, .58)",
      }}
    >
      <div className="flex items-start justify-between gap-3">
        <AgentMascot role={profile.role} size="md" state={mascotState} showLabel />
        <span className="rounded-full border border-white/10 px-2 py-1 text-[10px] font-semibold tracking-[.14em] text-zinc-500 uppercase">
          {statusLabel}
        </span>
      </div>
      <p className="mt-4 text-sm leading-6 text-zinc-300">
        {message?.headline ?? profile.shortDescription}
      </p>
      {message && (
        <>
          <div className="mt-3 flex items-center gap-2">
            <span
              className={`rounded-full border px-2 py-1 text-[10px] font-semibold uppercase ${STANCE_STYLES[message.stance]}`}
            >
              {message.stance}
            </span>
            {message.confidence !== null && (
              <span className="font-mono text-xs text-zinc-500">
                {message.confidence}% confidence
              </span>
            )}
          </div>
          <p className="mt-3 text-xs leading-5 text-zinc-500">{message.body}</p>
        </>
      )}
    </article>
  );
}

export default function ResearchDeskPage() {
  const [symbolInput, setSymbolInput] = useState("NVDA");
  const [symbol, setSymbol] = useState<string | null>(null);
  const [messages, setMessages] = useState<Partial<Record<AgentRole, AgentMessage>>>({});
  const [thesis, setThesis] = useState<AIThesis | null>(null);
  const [status, setStatus] = useState("Ready to run the desk");
  const [error, setError] = useState<string | null>(null);
  const [running, setRunning] = useState(false);
  const [crisisMode, setCrisisMode] = useState(false);
  const { states: backendStates, updates: backendUpdates, connected: backendConnected } =
    useAgentStatusStream();

  const agentOrder = crisisMode ? CRISIS_AGENT_ORDER : NORMAL_AGENT_ORDER;

  const activeRole = useMemo(() => {
    if (!running) return null;
    const next = agentOrder.find((role) => !messages[role]);
    return next ?? "cio";
  }, [messages, running, agentOrder]);

  const mascotStateFor = (role: AgentRole): MascotState => {
    if (activeRole === role) return "thinking";
    return (
      backendStates[role] ??
      (running && messages[role]
        ? "speaking"
        : messages[role]
          ? "success"
          : "idle")
    );
  };

  const runDesk = useCallback(
    async (event: React.FormEvent) => {
      event.preventDefault();
      const nextSymbol = symbolInput.trim().toUpperCase();
      if (!/^[A-Z]{1,6}$/.test(nextSymbol)) {
        setError("Enter a valid ticker symbol, for example NVDA.");
        return;
      }

      setSymbol(nextSymbol);
      setMessages({});
      setThesis(null);
      setError(null);
      setRunning(true);
      setStatus("Opening the research loop…");

      try {
        const response = await fetch("/api/research", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ symbol: nextSymbol, crisis: crisisMode }),
        });
        if (!response.ok || !response.body) {
          throw new Error(`Research API returned ${response.status}`);
        }

        const reader = response.body.getReader();
        const decoder = new TextDecoder();
        let buffer = "";
        while (true) {
          const chunk = await reader.read();
          if (chunk.done) break;
          buffer += decoder.decode(chunk.value, { stream: true });
          const lines = buffer.split("\n");
          buffer = lines.pop() ?? "";
          for (const line of lines) {
            if (!line.trim()) continue;
            const ev = JSON.parse(line) as StreamEvent;
            if (ev.type === "status") setStatus(ev.detail ?? ev.step ?? "running");
            if (ev.type === "agent_message" && ev.message) {
              setMessages((current) => ({
                ...current,
                [ev.message!.role]: ev.message,
              }));
            }
            if (ev.type === "thesis" && ev.thesis) setThesis(ev.thesis);
            if (ev.type === "error") setError(ev.detail ?? "Unknown error");
          }
        }
        setStatus("Desk synthesis complete");
      } catch (caught) {
        setError(
          caught instanceof Error ? caught.message : "Research request failed",
        );
        setStatus("Desk paused");
      } finally {
        setRunning(false);
      }
    },
    [symbolInput, crisisMode],
  );

  return (
    <main className="min-h-screen bg-[#080b13] px-5 py-8 text-zinc-100 sm:px-8 lg:px-12">
      <div className="mx-auto max-w-6xl">
        <header className="flex flex-col justify-between gap-6 border-b border-white/10 pb-8 lg:flex-row lg:items-end">
          <div>
            <p className="text-[11px] font-semibold tracking-[.24em] text-violet-300/80 uppercase">
              Razorstack / Intelligence layer
            </p>
            <h1 className="mt-3 text-4xl font-semibold tracking-[-.04em] sm:text-5xl">
              A desk of distinct minds.
            </h1>
            <p className="mt-3 max-w-2xl text-sm leading-6 text-zinc-400">
              Each agent has a persistent role, name, and mascot. The visual
              identity lets you tell evidence, opportunity, challenge, and final
              synthesis apart at a glance.
            </p>
          </div>
          <form onSubmit={runDesk} className="flex w-full max-w-sm flex-col gap-3">
            <div className="flex gap-2">
              <input
                value={symbolInput}
                onChange={(event) => setSymbolInput(event.target.value)}
                className="min-w-0 flex-1 rounded-xl border border-white/10 bg-white/[.04] px-4 py-3 font-mono text-sm outline-none placeholder:text-zinc-600 focus:border-violet-400/70"
                placeholder="Ticker"
                aria-label="Ticker symbol"
              />
              <button
                type="submit"
                disabled={running}
                className="rounded-xl bg-violet-400 px-4 py-3 text-sm font-semibold text-[#100b1b] transition hover:bg-violet-300 disabled:cursor-not-allowed disabled:opacity-50"
              >
                {running ? "Running" : "Run desk"}
              </button>
            </div>
            <label className="flex cursor-pointer items-center gap-3 rounded-xl border px-4 py-2.5 text-sm transition-colors select-none
              border-rose-400/20 bg-rose-400/[.05] text-rose-300/80 hover:border-rose-400/40"
            >
              <span
                className={`relative inline-block h-5 w-9 rounded-full transition-colors ${crisisMode ? "bg-rose-500" : "bg-zinc-700"}`}
              >
                <span
                  className={`absolute top-0.5 left-0.5 h-4 w-4 rounded-full bg-white transition-transform ${crisisMode ? "translate-x-4" : "translate-x-0"}`}
                />
              </span>
              <input
                type="checkbox"
                className="sr-only"
                checked={crisisMode}
                onChange={(e) => {
                  setCrisisMode(e.target.checked);
                  setMessages({});
                  setThesis(null);
                }}
              />
              Crisis mode — activate Sentinel, Radar, Gauge, Hedge, Apex
            </label>
          </form>
        </header>

        <section className="mt-7 grid gap-3 sm:grid-cols-2 xl:grid-cols-5">
          {agentOrder.map((role) => (
            <AgentCard
              key={role}
              message={messages[role]}
              mascotState={mascotStateFor(role)}
            />
          ))}
        </section>

        <section className="mt-6 grid gap-5 lg:grid-cols-[1.1fr_.9fr]">
          <div className="rounded-2xl border border-white/10 bg-white/[.03] p-5">
            <div className="flex items-center justify-between gap-3">
              <div>
                <p className="text-[10px] font-semibold tracking-[.18em] text-zinc-500 uppercase">
                  Live run
                </p>
                <h2 className="mt-1 text-lg font-semibold">
                  {symbol ?? "No symbol selected"}
                </h2>
              </div>
              <span className="font-mono text-xs text-violet-300">
                {status} · FastAPI p{backendConnected ? "live" : "offline"}
              </span>
            </div>
            <div className="mt-5 space-y-3">
              {agentOrder.map((role) => {
                const profile = AGENT_PROFILES[role];
                const message = messages[role];
                return (
                  <div
                    key={role}
                    className="flex items-center gap-3 rounded-xl border border-white/5 bg-black/10 px-3 py-3"
                  >
                    <AgentMascot role={role} size="sm" state={mascotStateFor(role)} />
                    <div className="min-w-0 flex-1">
                      <p className="text-xs font-semibold text-zinc-200">
                        {profile.name} · {profile.title}
                      </p>
                      <p className="truncate text-xs text-zinc-500">
                        {message?.headline ??
                          backendUpdates[role]?.headline ??
                          profile.workingStyle}
                      </p>
                    </div>
                    <span
                      className={`h-2 w-2 rounded-full ${mascotStateFor(role) === "error"
                        ? "bg-rose-400"
                        : mascotStateFor(role) === "success"
                          ? "bg-emerald-400"
                          : mascotStateFor(role) === "thinking"
                            ? "animate-pulse bg-violet-400"
                            : mascotStateFor(role) === "speaking"
                              ? "animate-pulse bg-sky-400"
                              : "bg-zinc-700"}`}
                    />
                  </div>
                );
              })}
            </div>
          </div>

          <div className="rounded-2xl border border-violet-400/25 bg-violet-400/[.07] p-5">
            <p className="text-[10px] font-semibold tracking-[.18em] text-violet-300/80 uppercase">
              {crisisMode ? "Crisis committee synthesis" : "CIO synthesis"}
            </p>
            {thesis ? (
              <>
                <div className="mt-3 flex items-center gap-3">
                  <AgentMascot
                    role={crisisMode ? "crisis_committee" : "investment_committee"}
                    size="md"
                    showLabel
                  />
                  <span className="rounded-full border border-violet-300/30 px-2 py-1 text-xs text-violet-200">
                    {thesis.direction} · {thesis.confidence}%
                  </span>
                </div>
                <h2 className="mt-5 text-xl font-semibold leading-7">
                  {thesis.summary}
                </h2>
                <p className="mt-3 text-sm leading-6 text-zinc-400">
                  {thesis.recommendation}
                </p>
                <div className="mt-5 grid gap-4 sm:grid-cols-2">
                  <div>
                    <p className="text-xs font-semibold text-emerald-300">Catalysts</p>
                    <p className="mt-2 text-xs leading-5 text-zinc-400">
                      {thesis.catalysts.join(" · ")}
                    </p>
                  </div>
                  <div>
                    <p className="text-xs font-semibold text-rose-300">Risks</p>
                    <p className="mt-2 text-xs leading-5 text-zinc-400">
                      {thesis.risks.join(" · ")}
                    </p>
                  </div>
                </div>
              </>
            ) : (
              <div className="flex min-h-48 flex-col justify-center">
                <AgentMascot
                  role={crisisMode ? "crisis_committee" : "investment_committee"}
                  size="lg"
                  state={mascotStateFor(
                    crisisMode ? "crisis_committee" : "investment_committee",
                  )}
                  showLabel
                />
                <p className="mt-5 text-sm leading-6 text-zinc-400">
                  {crisisMode
                    ? "Run the desk to let Apex synthesize crisis signals into an actionable decision."
                    : "Run the desk to let North synthesize the four specialist reports into one transparent thesis."}
                </p>
              </div>
            )}
          </div>
        </section>

        {error && (
          <p className="mt-5 rounded-xl border border-rose-400/25 bg-rose-400/10 px-4 py-3 text-sm text-rose-300">
            {error}
          </p>
        )}
      </div>
    </main>
  );
}
