"use client";

import { useCallback, useEffect, useState } from "react";
import type { MarketRegime, QuantSignal, SignalResponse } from "@/lib/quant/types";

const DIRECTION_STYLES: Record<string, string> = {
  BUY: "text-emerald-400",
  SELL: "text-rose-400",
  HOLD: "text-zinc-400",
};

const DIRECTION_BG: Record<string, string> = {
  BUY: "bg-emerald-500/15 border-emerald-500/40",
  SELL: "bg-rose-500/15 border-rose-500/40",
  HOLD: "bg-zinc-500/10 border-zinc-500/40",
};

function ScoreBar({ score }: { score: number }) {
  const pct = Math.min(100, Math.abs(score) * 100);
  const positive = score >= 0;
  return (
    <div className="relative h-2 w-full rounded bg-zinc-800">
      <div className="absolute left-1/2 top-[-4px] h-[16px] w-px bg-zinc-600" />
      <div
        className={`absolute top-0 h-2 rounded ${positive ? "bg-emerald-500" : "bg-rose-500"}`}
        style={
          positive
            ? { left: "50%", width: `${pct / 2}%` }
            : { right: "50%", width: `${pct / 2}%` }
        }
      />
    </div>
  );
}

function RegimeBadge({ regime }: { regime: MarketRegime }) {
  const crisis = regime.crisis;
  return (
    <span
      className={`rounded-full border px-3 py-1 text-xs font-medium ${
        crisis
          ? "border-red-500/50 bg-red-500/15 text-red-300"
          : regime.volatility === "VOLATILE"
            ? "border-amber-500/50 bg-amber-500/10 text-amber-300"
            : "border-zinc-600 bg-zinc-800 text-zinc-300"
      }`}
    >
      REGIME {regime.label} · size multiplier x{regime.riskMultiplier}
    </span>
  );
}

function SignalCard({ signal }: { signal: QuantSignal }) {
  return (
    <section className={`rounded-xl border p-5 ${DIRECTION_BG[signal.overall.direction]}`}>
      <header className="mb-4 flex flex-wrap items-baseline justify-between gap-2">
        <h2 className="text-xl font-semibold tracking-tight">
          {signal.symbol}
          <span className="ml-3 font-mono text-sm text-zinc-400">
            ${signal.price.toFixed(2)}
          </span>
          <span className="ml-2 font-mono text-xs text-zinc-500">
            1d {signal.changePct.d1 > 0 ? "+" : ""}
            {signal.changePct.d1}%
          </span>
        </h2>
        <div className="text-right">
          <span className={`text-2xl font-bold ${DIRECTION_STYLES[signal.overall.direction]}`}>
            {signal.overall.direction}
          </span>
          <span className="ml-3 font-mono text-lg">{signal.overall.strength}%</span>
        </div>
      </header>

      <div className="grid gap-x-8 gap-y-3 sm:grid-cols-2">
        {signal.components.map((c) => (
          <div key={c.name}>
            <div className="mb-1 flex justify-between text-sm">
              <span className="font-medium">{c.name}</span>
              <span className="font-mono text-zinc-400">{c.score.toFixed(2)}</span>
            </div>
            <ScoreBar score={c.score} />
            <p className="mt-1 text-xs text-zinc-500">{c.detail}</p>
          </div>
        ))}
      </div>

      <h3 className="mt-5 mb-2 text-xs font-semibold tracking-wider text-zinc-500 uppercase">
        Strategy votes
      </h3>
      <div className="flex flex-wrap gap-2">
        {signal.strategies.map((s) => (
          <span
            key={s.id}
            title={s.rationale}
            className={`cursor-default rounded-md border px-2 py-1 text-xs ${
              s.direction === "BUY"
                ? "border-emerald-500/40 bg-emerald-500/10 text-emerald-300"
                : s.direction === "SELL"
                  ? "border-rose-500/40 bg-rose-500/10 text-rose-300"
                  : "border-zinc-700 bg-zinc-800/60 text-zinc-400"
            }`}
          >
            {s.name}: {s.direction} {(s.strength * 100).toFixed(0)}%
          </span>
        ))}
      </div>

      <dl className="mt-5 grid grid-cols-2 gap-2 text-xs sm:grid-cols-4">
        <div>
          <dt className="text-zinc-500">Realized vol (ann.)</dt>
          <dd className="font-mono text-zinc-300">
            {signal.riskMetrics.realizedVolAnnualized}%
          </dd>
        </div>
        <div>
          <dt className="text-zinc-500">ATR</dt>
          <dd className="font-mono text-zinc-300">{signal.riskMetrics.atrPct}%</dd>
        </div>
        <div>
          <dt className="text-zinc-500">Max drawdown (1y)</dt>
          <dd className="font-mono text-zinc-300">
            -{signal.riskMetrics.maxDrawdownPct}%
          </dd>
        </div>
        <div>
          <dt className="text-zinc-500">Sharpe (20d)</dt>
          <dd className="font-mono text-zinc-300">
            {signal.riskMetrics.sharpe20d ?? "n/a"}
          </dd>
        </div>
      </dl>
    </section>
  );
}

export default function QuantDeskPage() {
  const [symbolInput, setSymbolInput] = useState("NVDA,AAPL");
  const [query, setQuery] = useState("NVDA,AAPL");
  const [loadedQuery, setLoadedQuery] = useState<string | null>(null);
  const [data, setData] = useState<SignalResponse | null>(null);
  const [error, setError] = useState<string | null>(null);

  const loading = query !== loadedQuery;

  useEffect(() => {
    let cancelled = false;
    const controller = new AbortController();
    fetch(`/api/quant/signal?symbols=${encodeURIComponent(query)}`, {
      signal: controller.signal,
    })
      .then(async (res) => {
        if (!res.ok) throw new Error(`API returned ${res.status}`);
        return res.json() as Promise<SignalResponse>;
      })
      .then((json) => {
        if (!cancelled) {
          setData(json);
          setError(null);
          setLoadedQuery(query);
        }
      })
      .catch((e: unknown) => {
        if (!cancelled && !(e instanceof DOMException && e.name === "AbortError")) {
          setError(e instanceof Error ? e.message : "Failed to load");
          setLoadedQuery(query);
        }
      });
    return () => {
      cancelled = true;
      controller.abort();
    };
  }, [query]);

  const submit = useCallback(
    (e: React.FormEvent) => {
      e.preventDefault();
      setQuery(symbolInput.trim().toUpperCase() || "NVDA");
    },
    [symbolInput],
  );

  return (
    <main className="mx-auto w-full max-w-4xl flex-1 bg-zinc-950 px-6 py-10 font-sans text-zinc-100">
      <header className="mb-8">
        <p className="text-xs font-semibold tracking-[0.2em] text-zinc-500 uppercase">
          AI Trading Desk · Quantitative Strategy Engine
        </p>
        <h1 className="mt-1 text-3xl font-bold tracking-tight">Quant Desk</h1>
        <form onSubmit={submit} className="mt-4 flex gap-2">
          <input
            value={symbolInput}
            onChange={(e) => setSymbolInput(e.target.value)}
            placeholder="Symbols e.g. NVDA,AAPL,TSLA"
            className="w-full rounded-lg border border-zinc-700 bg-zinc-900 px-3 py-2 font-mono text-sm outline-none focus:border-emerald-500"
          />
          <button
            type="submit"
            className="rounded-lg bg-emerald-500 px-4 py-2 text-sm font-semibold text-black hover:bg-emerald-400"
          >
            Run signals
          </button>
        </form>
        {data && (
          <div className="mt-3 flex items-center gap-3 text-xs text-zinc-500">
            <RegimeBadge regime={data.regime} />
            <span>benchmark {data.regime.benchmark}</span>
            {data.source === "SYNTHETIC" && (
              <span className="rounded border border-amber-500/40 bg-amber-500/10 px-2 py-0.5 text-amber-300">
                synthetic demo data — set ALPACA_API_KEY_ID for live bars
              </span>
            )}
          </div>
        )}
      </header>

      {loading && <p className="text-sm text-zinc-400">Computing signals…</p>}
      {error && <p className="text-sm text-rose-400">{error}</p>}

      <div className="space-y-5">
        {data?.signals.map((s) => <SignalCard key={s.symbol} signal={s} />)}
      </div>
    </main>
  );
}
