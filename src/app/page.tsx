"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";

/* ── data ────────────────────────────────────────────────────────── */

const MODULES = [
  {
    href: "/home/research",
    icon: (
      <svg viewBox="0 0 24 24" fill="none" className="h-6 w-6" stroke="currentColor" strokeWidth={1.5}>
        <path d="M9.75 3.104v5.714a2.25 2.25 0 0 1-.659 1.591L5 14.5M9.75 3.104c-.251.023-.501.05-.75.082m.75-.082a24.301 24.301 0 0 1 4.5 0m0 0v5.714a2.25 2.25 0 0 0 .659 1.591L19 14.5m-4.25-11.396c.251.023.501.05.75.082M5 14.5l-1.293 1.293a2.25 2.25 0 0 0 0 3.182l.543.543a2.25 2.25 0 0 0 3.182 0L10 18.25m-5-3.75 3.75-1.5" strokeLinecap="round" strokeLinejoin="round" />
      </svg>
    ),
    accent: "violet",
    gradient: "from-violet-500/20 to-violet-600/5",
    ring: "hover:border-violet-400/40 hover:shadow-violet-500/10",
    dot: "bg-violet-400",
    title: "Research Desk",
    tagline: "Autonomous AI research",
    description:
      "Five specialist agents — Sage, Vector, Atlas, Mara, and North — read the news, read the market, argue the bull and bear case, and synthesize one transparent thesis.",
    features: ["5 specialist agents", "CIO synthesis", "Crisis mode", "Risk-engine handoff"],
    cta: "Open the desk →",
  },
  {
    href: "/home/quant",
    icon: (
      <svg viewBox="0 0 24 24" fill="none" className="h-6 w-6" stroke="currentColor" strokeWidth={1.5}>
        <path d="M3 13.125C3 12.504 3.504 12 4.125 12h2.25c.621 0 1.125.504 1.125 1.125v6.75C7.5 20.496 6.996 21 6.375 21h-2.25A1.125 1.125 0 0 1 3 19.875v-6.75ZM9.75 8.625c0-.621.504-1.125 1.125-1.125h2.25c.621 0 1.125.504 1.125 1.125v11.25c0 .621-.504 1.125-1.125 1.125h-2.25a1.125 1.125 0 0 1-1.125-1.125V8.625ZM16.5 4.125c0-.621.504-1.125 1.125-1.125h2.25C20.496 3 21 3.504 21 4.125v15.75c0 .621-.504 1.125-1.125 1.125h-2.25a1.125 1.125 0 0 1-1.125-1.125V4.125Z" strokeLinecap="round" strokeLinejoin="round" />
      </svg>
    ),
    accent: "blue",
    gradient: "from-blue-500/20 to-blue-600/5",
    ring: "hover:border-blue-400/40 hover:shadow-blue-500/10",
    dot: "bg-blue-400",
    title: "Quant Terminal",
    tagline: "Signals & strategies",
    description:
      "Live market structure across crypto and equities. Intuitive timeframes, candle charts, and quantitative signals in a clean, professional terminal.",
    features: ["Crypto + equities", "Live OHLCV charts", "Multi-timeframe", "Signal engine"],
    cta: "Open the terminal →",
  },
];

const SPECIALISTS = [
  { name: "Sage", role: "News Intelligence", desc: "Separates catalysts from noise. Reads between the headlines.", color: "from-violet-500 to-purple-600", initial: "S" },
  { name: "Vector", role: "Market Structure", desc: "Reads price action, trend, and regime in real time.", color: "from-blue-500 to-cyan-500", initial: "V" },
  { name: "Atlas", role: "Bull Case", desc: "Constructs the strongest upside thesis possible.", color: "from-emerald-400 to-teal-500", initial: "A" },
  { name: "Mara", role: "Risk Challenge", desc: "Stress-tests every thesis. Finds ways it can fail.", color: "from-amber-400 to-orange-500", initial: "M" },
  { name: "North", role: "Chief Investment Officer", desc: "Synthesizes everything. Decides under uncertainty.", color: "from-rose-400 to-pink-500", initial: "N" },
];

const CRISIS_TEAM = [
  { name: "Sentinel", role: "Crisis News", icon: "📡" },
  { name: "Radar", role: "Crisis Market", icon: "📡" },
  { name: "Gauge", role: "Risk Analyst", icon: "⚡" },
  { name: "Hedge", role: "Options", icon: "🛡" },
  { name: "Apex", role: "Crisis Committee", icon: "🔺" },
];

const FEATURES = [
  {
    icon: (
      <svg viewBox="0 0 24 24" fill="none" className="h-5 w-5" stroke="currentColor" strokeWidth={1.5}>
        <path d="M12 3v17.25m0 0c-1.472 0-2.882.265-4.185.75M12 20.25c1.472 0 2.882.265 4.185.75M18.75 4.97A48.416 48.416 0 0 0 12 4.5c-2.291 0-4.545.16-6.75.47m13.5 0c1.01.143 2.01.317 3 .52m-3-.52 2.62 10.726c.122.499-.106 1.028-.589 1.202a5.988 5.988 0 0 1-2.031.352 5.988 5.988 0 0 1-2.031-.352c-.483-.174-.711-.703-.589-1.202L18.75 4.971Zm-16.5.52c.99-.203 1.99-.377 3-.52m0 0 2.62 10.726c.122.499-.106 1.028-.589 1.202a5.989 5.989 0 0 1-2.031.352 5.989 5.989 0 0 1-2.031-.352c-.483-.174-.711-.703-.589-1.202L5.25 4.971Z" strokeLinecap="round" strokeLinejoin="round" />
      </svg>
    ),
    title: "Bull vs. bear, argued fairly",
    body: "Every thesis is stress-tested by an adversarial pair before a decision is synthesized — not a single confident opinion.",
  },
  {
    icon: (
      <svg viewBox="0 0 24 24" fill="none" className="h-5 w-5" stroke="currentColor" strokeWidth={1.5}>
        <path d="M12 9v3.75m-9.303 3.376c-.866 1.5.217 3.374 1.948 3.374h14.71c1.73 0 2.813-1.874 1.948-3.374L13.949 3.378c-.866-1.5-3.032-1.5-3.898 0L2.697 16.126ZM12 15.75h.007v.008H12v-.008Z" strokeLinecap="round" strokeLinejoin="round" />
      </svg>
    ),
    title: "Explicit uncertainty",
    body: "North reports confidence alongside direction, so you always know how sure the desk actually is.",
  },
  {
    icon: (
      <svg viewBox="0 0 24 24" fill="none" className="h-5 w-5" stroke="currentColor" strokeWidth={1.5}>
        <path d="M14.857 17.082a23.848 23.848 0 0 0 5.454-1.31A8.967 8.967 0 0 1 18 9.75V9A6 6 0 0 0 6 9v.75a8.967 8.967 0 0 1-2.312 6.022c1.733.64 3.56 1.085 5.455 1.31m5.714 0a24.255 24.255 0 0 1-5.714 0m5.714 0a3 3 0 1 1-5.714 0" strokeLinecap="round" strokeLinejoin="round" />
      </svg>
    ),
    title: "Crisis switch",
    body: "Flip to crisis mode and a dedicated rapid-response team — Sentinel, Radar, Gauge, Hedge, Apex — takes over.",
  },
  {
    icon: (
      <svg viewBox="0 0 24 24" fill="none" className="h-5 w-5" stroke="currentColor" strokeWidth={1.5}>
        <path d="M13.19 8.688a4.5 4.5 0 0 1 1.242 7.244l-4.5 4.5a4.5 4.5 0 0 1-6.364-6.364l1.757-1.757m13.35-.622 1.757-1.757a4.5 4.5 0 0 0-6.364-6.364l-4.5 4.5a4.5 4.5 0 0 0 1.242 7.244" strokeLinecap="round" strokeLinejoin="round" />
      </svg>
    ),
    title: "Analysis to execution",
    body: "Route a thesis through the deterministic risk gate and toward live execution via the Alpaca bridge.",
  },
];

const STEPS = [
  {
    num: "01",
    title: "Collect",
    desc: "Sage and Vector scan live news feeds and market data, filtering noise from signal.",
    color: "text-violet-400",
    border: "border-violet-500/30",
  },
  {
    num: "02",
    title: "Argue",
    desc: "Atlas constructs the bull case. Mara challenges it with every failure mode she can find.",
    color: "text-amber-400",
    border: "border-amber-500/30",
  },
  {
    num: "03",
    title: "Decide",
    desc: "North synthesizes both sides, assigns a confidence level, and produces a transparent thesis.",
    color: "text-rose-400",
    border: "border-rose-500/30",
  },
  {
    num: "04",
    title: "Execute",
    desc: "The thesis passes through a deterministic risk gate and routes toward live Alpaca execution.",
    color: "text-emerald-400",
    border: "border-emerald-500/30",
  },
];

/* ── animated grid background ─────────────────────────────────── */

function GridBackground() {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    let animId: number;
    let t = 0;

    const resize = () => {
      canvas.width = window.innerWidth;
      canvas.height = window.innerHeight;
    };
    resize();
    window.addEventListener("resize", resize);

    const draw = () => {
      t += 0.003;
      ctx.clearRect(0, 0, canvas.width, canvas.height);

      const spacing = 60;
      const cols = Math.ceil(canvas.width / spacing) + 1;
      const rows = Math.ceil(canvas.height / spacing) + 1;

      for (let i = 0; i < cols; i++) {
        for (let j = 0; j < rows; j++) {
          const x = i * spacing;
          const y = j * spacing;
          const dist = Math.hypot(x - canvas.width / 2, y - canvas.height / 2);
          const maxDist = Math.hypot(canvas.width, canvas.height) / 2;
          const alpha = Math.max(0, 0.06 - (dist / maxDist) * 0.06);
          const pulse = Math.sin(t + i * 0.3 + j * 0.2) * 0.02;

          ctx.fillStyle = `rgba(139, 92, 246, ${alpha + pulse})`;
          ctx.beginPath();
          ctx.arc(x, y, 1.2, 0, Math.PI * 2);
          ctx.fill();
        }
      }

      animId = requestAnimationFrame(draw);
    };
    draw();

    return () => {
      cancelAnimationFrame(animId);
      window.removeEventListener("resize", resize);
    };
  }, []);

  return (
    <canvas
      ref={canvasRef}
      className="pointer-events-none fixed inset-0 z-0"
      style={{ opacity: 0.8 }}
    />
  );
}

/* ── floating orb ────────────────────────────────────────────── */

function FloatingOrb({ className }: { className?: string }) {
  return <div className={`pointer-events-none absolute rounded-full blur-[120px] ${className}`} />;
}

/* ── section fade-in ─────────────────────────────────────────── */

function FadeIn({
  children,
  className,
  delay = 0,
}: {
  children: React.ReactNode;
  className?: string;
  delay?: number;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const obs = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting) {
          setTimeout(() => setVisible(true), delay);
          obs.disconnect();
        }
      },
      { threshold: 0.15 }
    );
    obs.observe(el);
    return () => obs.disconnect();
  }, [delay]);

  return (
    <div
      ref={ref}
      className={`transition-all duration-700 ease-out ${
        visible ? "opacity-100 translate-y-0" : "opacity-0 translate-y-8"
      } ${className ?? ""}`}
    >
      {children}
    </div>
  );
}

/* ── stat counter ────────────────────────────────────────────── */

function StatBlock({ value, label }: { value: string; label: string }) {
  return (
    <div className="text-center">
      <p className="text-3xl font-semibold tracking-tight text-zinc-50 sm:text-4xl">{value}</p>
      <p className="mt-2 text-sm text-zinc-500">{label}</p>
    </div>
  );
}

/* ── main page ───────────────────────────────────────────────── */

export default function HomePage() {
  const [mounted, setMounted] = useState(false);
  useEffect(() => {
    const id = requestAnimationFrame(() => setMounted(true));
    return () => cancelAnimationFrame(id);
  }, []);

  return (
    <div className="relative min-h-full w-full overflow-hidden">
      {/* animated background */}
      {mounted && <GridBackground />}

      {/* ambient orbs */}
      <FloatingOrb className="-top-32 left-1/2 h-[500px] w-[700px] -translate-x-1/2 bg-violet-600/20" />
      <FloatingOrb className="top-[30%] -left-40 h-[400px] w-[400px] bg-cyan-500/15" />
      <FloatingOrb className="top-[70%] right-0 h-[350px] w-[350px] bg-violet-500/10" />

      <div className="relative z-10 mx-auto max-w-6xl px-6 py-16 sm:px-10 sm:py-24 lg:px-12">

        {/* ═══════════════════════════════════════════════════════
            HERO
        ═══════════════════════════════════════════════════════ */}
        <header className="pt-8 text-center">
          <FadeIn>
            <div className="mx-auto inline-flex items-center gap-2.5 rounded-full border border-white/10 bg-white/[.03] px-4 py-1.5 text-xs font-medium tracking-wide text-zinc-400 backdrop-blur-sm">
              <span className="relative flex h-2 w-2">
                <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-emerald-400 opacity-75" />
                <span className="relative inline-flex h-2 w-2 rounded-full bg-emerald-400" />
              </span>
              Autonomous AI trading desk · v0.1
            </div>
          </FadeIn>

          <FadeIn delay={100}>
            <h1 className="mx-auto mt-8 max-w-4xl text-5xl font-bold leading-[1.05] tracking-[-.04em] text-zinc-50 sm:text-6xl lg:text-7xl">
              A team of{" "}
              <span className="bg-gradient-to-r from-violet-300 via-fuchsia-300 to-cyan-300 bg-clip-text text-transparent">
                specialist minds
              </span>
              <br className="hidden sm:block" />
              trading as one.
            </h1>
          </FadeIn>

          <FadeIn delay={200}>
            <p className="mx-auto mt-7 max-w-2xl text-base leading-7 text-zinc-400 sm:text-lg">
              Razorstack runs five AI agents — research, quant, and execution — that
              read the market, argue every position, stress-test the thesis, and
              route one transparent decision toward real trades.
            </p>
          </FadeIn>

          <FadeIn delay={300}>
            <div className="mt-10 flex flex-wrap items-center justify-center gap-4">
              <Link
                href="/home/research"
                className="group inline-flex items-center gap-2.5 rounded-xl bg-gradient-to-r from-violet-500 to-violet-400 px-7 py-3.5 text-sm font-semibold text-white shadow-lg shadow-violet-500/25 transition-all hover:shadow-violet-500/40 hover:from-violet-400 hover:to-violet-300"
              >
                Open the Research Desk
                <span className="transition-transform group-hover:translate-x-0.5">→</span>
              </Link>
              <Link
                href="/home/quant"
                className="inline-flex items-center gap-2 rounded-xl border border-white/15 bg-white/[.04] px-7 py-3.5 text-sm font-semibold text-zinc-200 backdrop-blur-sm transition-all hover:border-white/25 hover:bg-white/[.08]"
              >
                View Quant Terminal
              </Link>
            </div>
          </FadeIn>
        </header>

        {/* ═══════════════════════════════════════════════════════
            STATS BAR
        ═══════════════════════════════════════════════════════ */}
        <FadeIn delay={100}>
          <section className="mt-20 grid grid-cols-2 gap-6 rounded-2xl border border-white/10 bg-white/[.02] p-8 backdrop-blur-sm sm:grid-cols-4">
            <StatBlock value="5" label="Specialist agents" />
            <StatBlock value="1" label="Transparent thesis" />
            <StatBlock value="100%" label="Risk-gated" />
            <StatBlock value="∞" label="Crisis ready" />
          </section>
        </FadeIn>

        {/* ═══════════════════════════════════════════════════════
            HOW IT WORKS — flow
        ═══════════════════════════════════════════════════════ */}
        <FadeIn>
          <section className="mt-28">
            <p className="text-center text-xs font-semibold tracking-[.25em] text-violet-300/70 uppercase">
              How it works
            </p>
            <h2 className="mt-3 text-center text-3xl font-bold tracking-[-.02em] text-zinc-50 sm:text-4xl">
              From data to decision.
            </h2>
            <p className="mx-auto mt-4 max-w-xl text-center text-sm text-zinc-500">
              Every cycle follows the same four-step loop — collect, argue, decide,
              execute — with full transparency at each stage.
            </p>

            <div className="relative mt-14 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
              {STEPS.map((step, i) => (
                <FadeIn key={step.num} delay={i * 120}>
                  <div className={`relative flex flex-col rounded-2xl border ${step.border} bg-white/[.02] p-6 backdrop-blur-sm transition-all hover:bg-white/[.04]`}>
                    <span className={`font-mono text-xs font-bold ${step.color}`}>{step.num}</span>
                    <h3 className="mt-3 text-lg font-semibold text-zinc-100">{step.title}</h3>
                    <p className="mt-2 text-sm leading-6 text-zinc-400">{step.desc}</p>
                    {i < STEPS.length - 1 && (
                      <div className="absolute -right-3 top-1/2 hidden -translate-y-1/2 text-zinc-600 lg:block">
                        →
                      </div>
                    )}
                  </div>
                </FadeIn>
              ))}
            </div>
          </section>
        </FadeIn>

        {/* ═══════════════════════════════════════════════════════
            MODULES
        ═══════════════════════════════════════════════════════ */}
        <FadeIn>
          <section className="mt-28">
            <p className="text-center text-xs font-semibold tracking-[.25em] text-violet-300/70 uppercase">
              Modules
            </p>
            <h2 className="mt-3 text-center text-3xl font-bold tracking-[-.02em] text-zinc-50 sm:text-4xl">
              Three surfaces, one system.
            </h2>

            <div className="mt-12 grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
              {MODULES.map((m, i) => (
                <FadeIn key={m.href} delay={i * 100}>
                  <Link
                    href={m.href}
                    className={`group relative flex h-full flex-col overflow-hidden rounded-2xl border border-white/10 bg-white/[.02] p-7 backdrop-blur-sm transition-all duration-300 hover:-translate-y-1 hover:shadow-2xl ${m.ring}`}
                  >
                    {/* gradient glow */}
                    <div className={`absolute -top-20 left-1/2 h-40 w-48 -translate-x-1/2 rounded-full bg-gradient-to-b ${m.gradient} opacity-0 blur-2xl transition-opacity duration-500 group-hover:opacity-100`} />

                    <div className="relative flex flex-col flex-1">
                      <div className="flex items-center gap-3">
                        <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-white/[.06] text-zinc-300 transition-colors group-hover:text-white">
                          {m.icon}
                        </div>
                        <div>
                          <p className="text-[11px] font-semibold tracking-[.16em] text-zinc-500 uppercase">
                            {m.tagline}
                          </p>
                          <h2 className="text-lg font-semibold text-zinc-100">{m.title}</h2>
                        </div>
                      </div>

                      <p className="mt-4 flex-1 text-sm leading-6 text-zinc-400">{m.description}</p>

                      <div className="mt-5 flex flex-wrap gap-1.5">
                        {m.features.map((f) => (
                          <span
                            key={f}
                            className="rounded-full border border-white/10 bg-white/[.03] px-2.5 py-1 text-[11px] text-zinc-400"
                          >
                            {f}
                          </span>
                        ))}
                      </div>

                      <span className="mt-6 inline-flex items-center gap-1.5 text-sm font-semibold text-zinc-300 transition-colors group-hover:text-white">
                        {m.cta}
                      </span>
                    </div>
                  </Link>
                </FadeIn>
              ))}
            </div>
          </section>
        </FadeIn>

        {/* ═══════════════════════════════════════════════════════
            AGENTS
        ═══════════════════════════════════════════════════════ */}
        <FadeIn>
          <section className="mt-28">
            <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
              <div>
                <p className="text-xs font-semibold tracking-[.25em] text-violet-300/70 uppercase">
                  The cast
                </p>
                <h2 className="mt-2 text-3xl font-bold tracking-[-.02em] text-zinc-50">
                  Five minds. One decision.
                </h2>
              </div>
              <p className="max-w-sm text-sm leading-6 text-zinc-500">
                Each agent is a persistent, specialized mind with its own identity,
                reasoning style, and role in the decision pipeline.
              </p>
            </div>

            <div className="mt-10 grid gap-4 sm:grid-cols-2 lg:grid-cols-5">
              {SPECIALISTS.map((a, i) => (
                <FadeIn key={a.name} delay={i * 80}>
                  <div className="group relative overflow-hidden rounded-2xl border border-white/10 bg-white/[.02] p-6 backdrop-blur-sm transition-all duration-300 hover:border-white/20 hover:bg-white/[.04]">
                    {/* top accent line */}
                    <div className={`absolute inset-x-0 top-0 h-px bg-gradient-to-r ${a.color}`} />

                    <div className="flex items-center gap-3">
                      <div className={`flex h-11 w-11 items-center justify-center rounded-full bg-gradient-to-br ${a.color} text-sm font-bold text-white shadow-lg`}>
                        {a.initial}
                      </div>
                      <div className="min-w-0">
                        <p className="text-sm font-semibold text-zinc-100">{a.name}</p>
                        <p className="truncate text-[11px] text-zinc-500">{a.role}</p>
                      </div>
                    </div>
                    <p className="mt-4 text-xs leading-5 text-zinc-400">{a.desc}</p>
                  </div>
                </FadeIn>
              ))}
            </div>

            {/* crisis team */}
            <FadeIn delay={400}>
              <div className="mt-6 flex flex-wrap items-center gap-2.5 rounded-2xl border border-rose-500/20 bg-rose-500/[.03] p-4">
                <div className="flex items-center gap-2 pr-3 border-r border-rose-500/20">
                  <span className="relative flex h-2 w-2">
                    <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-rose-400 opacity-75" />
                    <span className="relative inline-flex h-2 w-2 rounded-full bg-rose-400" />
                  </span>
                  <span className="text-[11px] font-bold tracking-wide text-rose-300 uppercase">
                    Crisis team
                  </span>
                </div>
                {CRISIS_TEAM.map((a) => (
                  <span
                    key={a.name}
                    className="inline-flex items-center gap-2 rounded-full border border-rose-400/15 bg-rose-400/[.05] px-3 py-1.5 text-xs text-rose-200/80 transition-colors hover:bg-rose-400/10"
                  >
                    <span className="text-[10px]">{a.icon}</span>
                    {a.name} · {a.role}
                  </span>
                ))}
              </div>
            </FadeIn>
          </section>
        </FadeIn>

        {/* ═══════════════════════════════════════════════════════
            FEATURES
        ═══════════════════════════════════════════════════════ */}
        <FadeIn>
          <section className="mt-28">
            <p className="text-center text-xs font-semibold tracking-[.25em] text-violet-300/70 uppercase">
              Design principles
            </p>
            <h2 className="mt-3 text-center text-3xl font-bold tracking-[-.02em] text-zinc-50 sm:text-4xl">
              Built to be transparent by design.
            </h2>

            <div className="mt-12 grid gap-5 sm:grid-cols-2">
              {FEATURES.map((f, i) => (
                <FadeIn key={f.title} delay={i * 100}>
                  <div className="group flex gap-5 rounded-2xl border border-white/10 bg-white/[.02] p-7 backdrop-blur-sm transition-all duration-300 hover:border-white/20 hover:bg-white/[.04]">
                    <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-violet-500/10 text-violet-400 transition-colors group-hover:bg-violet-500/20">
                      {f.icon}
                    </div>
                    <div>
                      <h3 className="text-base font-semibold text-zinc-100">{f.title}</h3>
                      <p className="mt-2 text-sm leading-6 text-zinc-400">{f.body}</p>
                    </div>
                  </div>
                </FadeIn>
              ))}
            </div>
          </section>
        </FadeIn>

        {/* ═══════════════════════════════════════════════════════
            ARCHITECTURE (visual)
        ═══════════════════════════════════════════════════════ */}
        <FadeIn>
          <section className="mt-28">
            <p className="text-center text-xs font-semibold tracking-[.25em] text-violet-300/70 uppercase">
              Architecture
            </p>
            <h2 className="mt-3 text-center text-3xl font-bold tracking-[-.02em] text-zinc-50 sm:text-4xl">
              Every layer, visible.
            </h2>

            <div className="relative mt-14 grid gap-4 sm:grid-cols-3">
              {[
                {
                  label: "Research Layer",
                  items: ["Sage — News feed", "Vector — Market data", "Atlas — Bull thesis", "Mara — Risk challenge", "North — CIO synthesis"],
                  color: "border-violet-500/30",
                  dot: "bg-violet-400",
                },
                {
                  label: "Quant Layer",
                  items: ["Signal engine", "Multi-timeframe", "Market regime", "Strategy backtest", "Allocation model"],
                  color: "border-blue-500/30",
                  dot: "bg-blue-400",
                },
                {
                  label: "Execution Layer",
                  items: ["Risk gate", "Order manager", "Alpaca bridge", "Paper trading", "Event streaming"],
                  color: "border-emerald-500/30",
                  dot: "bg-emerald-400",
                },
              ].map((layer, i) => (
                <FadeIn key={layer.label} delay={i * 120}>
                  <div className={`rounded-2xl border ${layer.color} bg-white/[.02] p-6 backdrop-blur-sm`}>
                    <div className="flex items-center gap-2">
                      <span className={`h-2 w-2 rounded-full ${layer.dot}`} />
                      <p className="text-sm font-semibold text-zinc-200">{layer.label}</p>
                    </div>
                    <ul className="mt-4 space-y-2">
                      {layer.items.map((item) => (
                        <li key={item} className="flex items-center gap-2 text-xs text-zinc-400">
                          <span className={`h-1 w-1 rounded-full ${layer.dot} opacity-60`} />
                          {item}
                        </li>
                      ))}
                    </ul>
                  </div>
                </FadeIn>
              ))}
            </div>
          </section>
        </FadeIn>

        {/* ═══════════════════════════════════════════════════════
            FINAL CTA
        ═══════════════════════════════════════════════════════ */}
        <FadeIn>
          <section className="mt-28 overflow-hidden rounded-3xl border border-white/10 bg-gradient-to-br from-violet-500/10 via-white/[.02] to-cyan-500/10 p-12 text-center sm:p-16">
            <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_center,_rgba(139,92,246,0.08),_transparent_70%)]" />
            <div className="relative">
              <h2 className="mx-auto max-w-2xl text-3xl font-bold tracking-[-.02em] text-zinc-50 sm:text-4xl">
                Put the desk to work.
              </h2>
              <p className="mx-auto mt-5 max-w-xl text-sm leading-7 text-zinc-400">
                Run the research desk on any ticker, flip on crisis mode, or probe
                the Alpaca bridge — everything is live right now.
              </p>
              <div className="mt-9 flex flex-wrap items-center justify-center gap-4">
                <Link
                  href="/home/research"
                  className="group inline-flex items-center gap-2.5 rounded-xl bg-gradient-to-r from-violet-500 to-violet-400 px-8 py-3.5 text-sm font-semibold text-white shadow-lg shadow-violet-500/25 transition-all hover:shadow-violet-500/40 hover:from-violet-400 hover:to-violet-300"
                >
                  Run the desk
                  <span className="transition-transform group-hover:translate-x-0.5">→</span>
                </Link>
                <Link
                  href="/home/quant"
                  className="inline-flex items-center gap-2 rounded-xl border border-white/15 bg-white/[.04] px-8 py-3.5 text-sm font-semibold text-zinc-200 backdrop-blur-sm transition-all hover:border-white/25 hover:bg-white/[.08]"
                >
                  Explore the terminal
                </Link>
              </div>
            </div>
          </section>
        </FadeIn>

        {/* ═══════════════════════════════════════════════════════
            FOOTER
        ═══════════════════════════════════════════════════════ */}
        <footer className="mt-16 flex flex-col items-center justify-between gap-4 border-t border-white/10 pt-8 pb-4 text-xs text-zinc-600 sm:flex-row">
          <div className="flex items-center gap-2">
            <span className="h-1.5 w-1.5 rounded-full bg-violet-500" />
            <span>Razorstack Trading · An autonomous AI trading desk</span>
          </div>
          <span className="font-mono tracking-wider">v0.1.0</span>
        </footer>
      </div>
    </div>
  );
}
