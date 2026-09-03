"use client";

import { useEffect, useState } from "react";
import { AgentMascot } from "@/components/AgentMascot";
import { AGENT_PROFILES } from "@/lib/agents/profiles";
import type { AgentRole } from "@/lib/contracts/research";
import type { SignalResponse } from "@/lib/quant/types";

// ─── Types ────────────────────────────────────────────────────────────────────

interface HealthReport {
  alpaca: { configured: boolean; live: boolean };
  backend: { configured: boolean; live: boolean };
}

// ─── Agent roster (normal desk only) ─────────────────────────────────────────

const DESK_AGENTS: AgentRole[] = [
  "news",
  "market_research",
  "bull",
  "bear",
  "investment_committee",
];

// ─── Workspace cards ──────────────────────────────────────────────────────────

const WORKSPACES = [
  {
    href: "/research",
    eyebrow: "01 / Intelligence",
    title: "Research Desk",
    description:
      "Watch the specialist agents debate, follow the CIO synthesis, and drill into each agent's reasoning.",
    border: "border-violet-400/25",
    glow: "bg-violet-400/[.06]",
    tag: "text-violet-400",
    arrow: "group-hover:text-violet-300",
  },
  {
    href: "/quant",
    eyebrow: "02 / Measurement",
    title: "Quant Desk",
    description:
      "Weighted signals, strategy votes, market regime, risk metrics, backtests, and the paper tracker.",
    border: "border-emerald-400/25",
    glow: "bg-emerald-400/[.06]",
    tag: "text-emerald-400",
    arrow: "group-hover:text-emerald-300",
  },
  {
    href: "/alpaca-test",
    eyebrow: "03 / Connectivity",
    title: "Data Diagnostics",
    description:
      "Verify the market-data connection and inspect the upstream response before a live demo.",
    border: "border-sky-400/25",
    glow: "bg-sky-400/[.06]",
    tag: "text-sky-400",
    arrow: "group-hover:text-sky-300",
  },
];

// ─── Regime badge ─────────────────────────────────────────────────────────────

function RegimePill({ regime }: { regime: SignalResponse["regime"] }) {
  const crisis = regime.crisis;
  const volatile = regime.volatility === "VOLATILE" || regime.volatility === "CRISIS";
  return (
    <span
      className={`inline-flex items-center gap-1.5 rounded-full border px-3 py-1 text-xs font-medium ${
        crisis
          ? "border-red-500/40 bg-red-500/10 text-red-300"
          : volatile
            ? "border-amber-500/40 bg-amber-500/10 text-amber-300"
            : "border-zinc-700 bg-zinc-800/60 text-zinc-300"
      }`}
    >
      <span
        className={`h-1.5 w-1.5 rounded-full ${crisis ? "bg-red-400" : volatile ? "bg-amber-400" : "bg-emerald-400"}`}
      />
      {regime.label} · ×{regime.riskMultiplier}
    </span>
  );
}

// ─── System status dot ────────────────────────────────────────────────────────

function StatusDot({ ok, label }: { ok: boolean | null; label: string }) {
  return (
    <span className="inline-flex items-center gap-1.5 text-xs text-zinc-500">
      <span
        className={`h-1.5 w-1.5 rounded-full ${ok === null ? "bg-zinc-600" : ok ? "bg-emerald-400" : "bg-amber-400"}`}
      />
      {label}
    </span>
  );
}

// ─── Main page ────────────────────────────────────────────────────────────────

export default function Home() {
  const [regime, setRegime] = useState<SignalResponse["regime"] | null>(null);
  const [health, setHealth] = useState<HealthReport | null>(null);

  // Fetch live regime badge (SPY as benchmark proxy)
  useEffect(() => {
    fetch("/api/quant/signal?symbols=SPY&limit=100")
      .then((r) => r.json() as Promise<SignalResponse>)
      .then((d) => setRegime(d.regime))
      .catch(() => null);
  }, []);

  // Fetch connection health
  useEffect(() => {
    fetch("/api/quant/health")
      .then((r) => r.json() as Promise<HealthReport>)
      .then(setHealth)
      .catch(() => null);
  }, []);

  return (
    <main className="min-h-screen bg-[#080b13] px-5 py-10 font-sans text-zinc-100 sm:px-10 lg:px-16">
      <div className="mx-auto max-w-6xl">

        {/* ── Header ─────────────────────────────────────────────────── */}
        <header className="border-b border-white/10 pb-10">
          <p className="text-[11px] font-semibold tracking-[.24em] text-violet-300/70 uppercase">
            Razorstack / AI trading desk
          </p>
          <h1 className="mt-4 text-5xl font-semibold tracking-[-0.05em] sm:text-7xl">
            Evidence before action.
          </h1>
          <p className="mt-4 max-w-2xl text-base leading-7 text-zinc-400">
            Research agents explain their view, quant measures the signal, and the risk gate
            remains the final control point.
          </p>
          <div className="mt-5 flex flex-wrap items-center gap-3">
            {regime ? (
              <RegimePill regime={regime} />
            ) : (
              <span className="h-6 w-32 animate-pulse rounded-full bg-zinc-800" />
            )}
            {regime && (
              <span className="text-xs text-zinc-600">
                benchmark {regime.benchmark} ·{" "}
                {regime.crisis ? "crisis detected" : `${regime.volatility.toLowerCase()} vol`}
              </span>
            )}
          </div>
        </header>

        {/* ── Agent roster ────────────────────────────────────────────── */}
        <section className="mt-12">
          <p className="mb-6 text-[10px] font-semibold tracking-[.2em] text-zinc-600 uppercase">
            The desk
          </p>
          <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 md:grid-cols-5">
            {DESK_AGENTS.map((role) => {
              const p = AGENT_PROFILES[role];
              return (
                <div
                  key={role}
                  className="flex flex-col items-center gap-3 rounded-2xl border border-white/[.06] bg-white/[.02] px-3 py-5 text-center"
                >
                  <AgentMascot role={role} size="lg" state="idle" />
                  <div>
                    <p className="text-sm font-semibold">{p.name}</p>
                    <p className="mt-0.5 text-[11px] text-zinc-500">{p.title}</p>
                    <p className="mt-2 text-[11px] leading-4 text-zinc-600">
                      {p.shortDescription}
                    </p>
                  </div>
                </div>
              );
            })}
          </div>
        </section>

        {/* ── Workspace cards ──────────────────────────────────────────── */}
        <section className="mt-10 grid gap-4 md:grid-cols-3">
          {WORKSPACES.map((w) => (
            <a
              key={w.href}
              href={w.href}
              className={`group rounded-2xl border p-5 transition hover:-translate-y-1 hover:border-white/20 ${w.border} ${w.glow}`}
            >
              <p className={`text-[10px] font-semibold tracking-[.18em] uppercase ${w.tag}`}>
                {w.eyebrow}
              </p>
              <h2 className="mt-8 text-2xl font-semibold tracking-tight group-hover:text-white">
                {w.title}
              </h2>
              <p className="mt-3 text-sm leading-6 text-zinc-400">{w.description}</p>
              <p className={`mt-6 text-sm font-semibold text-zinc-200 ${w.arrow} transition`}>
                Open workspace <span aria-hidden="true">→</span>
              </p>
            </a>
          ))}
        </section>

        {/* ── Footer / system status ───────────────────────────────────── */}
        <footer className="mt-10 flex flex-wrap items-center gap-x-6 gap-y-2 border-t border-white/[.06] pt-6">
          <StatusDot
            ok={health ? health.alpaca.live : null}
            label={
              health
                ? health.alpaca.live
                  ? "Alpaca live"
                  : health.alpaca.configured
                    ? "Alpaca unreachable"
                    : "Alpaca — synthetic"
                : "Alpaca"
            }
          />
          <StatusDot
            ok={health ? health.backend.live : null}
            label={
              health
                ? health.backend.live
                  ? "FastAPI connected"
                  : health.backend.configured
                    ? "FastAPI unreachable"
                    : "FastAPI not configured"
                : "FastAPI"
            }
          />
          <StatusDot ok={true} label="Quant engine ready" />
          <span className="ml-auto text-xs text-zinc-700">
            Mock broker safe by default · risk-gated execution
          </span>
        </footer>
      </div>
    </main>
  );
}
