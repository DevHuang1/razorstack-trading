"use client";

import { useCallback, useEffect, useState } from "react";
import { recordSignal } from "@/lib/quant/paper";
import { listStrategies } from "@/lib/quant/strategies";
import type {
  LeaderboardEntry,
  PaperRecord,
} from "@/lib/quant/paper";
import type { MarketRegime, QuantSignal, SignalResponse, StrategyId } from "@/lib/quant/types";

type StrategyPerformance = {
  strategyId: string;
  horizonDays: number;
  signalsEvaluated: number;
  trades: number;
  winRatePct: number;
  avgTradeReturnPct: number;
  grossCumulativeReturnPct: number;
  netCumulativeReturnPct: number;
  maxDrawdownPct: number;
  sharpeAnnualized: number | null;
  sortinoAnnualized: number | null;
  calmarRatio: number | null;
  turnover: number;
  exposurePct: number;
  buyHoldReturnPct: number;
  benchmarkOutperformancePct: number;
  avgCostPerTradeBps: number;
};

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

function PaperPanel() {
  const [entries, setEntries] = useState<LeaderboardEntry[]>([]);
  const [records, setRecords] = useState<PaperRecord[]>([]);

  const refresh = useCallback(() => {
    fetch("/api/quant/leaderboard")
      .then((r) => r.json() as Promise<{ entries: LeaderboardEntry[] }>)
      .then((json) => setEntries(json.entries));
  }, []);

  useEffect(refresh, [refresh]);

  useEffect(() => {
    (async () => {
      const mod = await import("@/lib/quant/paper");
      setRecords(mod.listPaperRecords());
    })();
  }, [entries]);

  return (
    <section className="rounded-xl border border-zinc-800 bg-zinc-900/50 p-5">
      <h2 className="mb-4 text-lg font-semibold tracking-tight">Paper tracker & leaderboard</h2>

      <div className="mb-4 rounded-lg border border-zinc-800 bg-zinc-950/60 p-3 text-xs text-zinc-400">
        <span className="font-medium text-zinc-300">Tracked signals:</span> {records.length}
        {records.length > 0 && (
          <ul className="mt-2 grid grid-cols-1 gap-1 md:grid-cols-2">
            {records.slice(-6).reverse().map((r) => (
              <li key={r.id} className="flex items-center justify-between gap-2">
                <span>
                  {r.symbol} · {r.strategy} · {r.direction}
                </span>
                <span className="font-mono">
                  {r.realizedReturn === null
                    ? "open"
                    : `${(r.realizedReturn * 100).toFixed(1)}%`}
                </span>
              </li>
            ))}
          </ul>
        )}
      </div>

      {entries.length === 0 ? (
        <p className="text-sm text-zinc-500">No resolved trades yet. Log signals to the paper
          tracker and they will appear here.</p>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-left text-sm">
            <thead className="text-xs text-zinc-500">
              <tr>
                <th className="pb-2">Strategy</th>
                <th className="pb-2">Trades</th>
                <th className="pb-2">Win rate</th>
                <th className="pb-2">Avg ret</th>
                <th className="pb-2">Cum ret</th>
                <th className="pb-2">Max DD</th>
                <th className="pb-2">Sharpe</th>
              </tr>
            </thead>
            <tbody>
              {entries.map((e) => (
                <tr key={e.strategy} className="border-t border-zinc-800">
                  <td className="py-2 font-medium">{e.strategy}</td>
                  <td className="py-2 font-mono text-zinc-400">{e.total}</td>
                  <td className="py-2 font-mono text-zinc-400">{e.winRatePct}%</td>
                  <td className="py-2 font-mono text-zinc-400">{e.avgReturnPct}%</td>
                  <td className="py-2 font-mono font-medium text-emerald-400">
                    {e.cumulativeReturnPct}%
                  </td>
                  <td className="py-2 font-mono text-rose-400">-{e.maxDrawdownPct}%</td>
                  <td className="py-2 font-mono text-zinc-400">{e.sharpeAnnualized ?? "n/a"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
}

const STRATEGY_OPTIONS = listStrategies().map((s) => ({
  id: s.id,
  name: s.name,
}));

function BacktestPanel() {
  const [strategy, setStrategy] = useState<StrategyId>("MOMENTUM");
  const [symbol, setSymbol] = useState("NVDA");
  const [running, setRunning] = useState(false);
  const [result, setResult] = useState<StrategyPerformance | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [walkForward, setWalkForward] = useState(false);

  const run = useCallback(async () => {
    setRunning(true);
    setError(null);
    try {
      const res = await fetch("/api/quant/backtest", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ strategy, symbol: symbol.toUpperCase(), walkForward }),
      });
      const json = (await res.json()) as StrategyPerformance | { error: string };
      if (!res.ok || "error" in json) {
        throw new Error(
          "error" in json ? json.error : `API returned ${res.status}`,
        );
      }
      setResult(json as StrategyPerformance);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Backtest failed");
      setResult(null);
    } finally {
      setRunning(false);
    }
  }, [strategy, symbol, walkForward]);

  return (
    <section className="rounded-xl border border-zinc-800 bg-zinc-900/50 p-5">
      <h2 className="mb-4 text-lg font-semibold tracking-tight">Backtest (net of costs)</h2>

      <div className="mb-4 flex flex-wrap items-end gap-3">
        <label className="flex flex-col gap-1 text-xs text-zinc-400">
          Strategy
          <select
            value={strategy}
            onChange={(e) => setStrategy(e.target.value as StrategyId)}
            className="rounded-lg border border-zinc-700 bg-zinc-900 px-3 py-2 text-sm text-zinc-100"
          >
            {STRATEGY_OPTIONS.map((s) => (
              <option key={s.id} value={s.id}>{s.name}</option>
            ))}
          </select>
        </label>
        <label className="flex flex-col gap-1 text-xs text-zinc-400">
          Symbol
          <input
            value={symbol}
            onChange={(e) => setSymbol(e.target.value)}
            className="rounded-lg border border-zinc-700 bg-zinc-900 px-3 py-2 font-mono text-sm"
          />
        </label>
        <label className="flex items-center gap-2 pb-2 text-xs text-zinc-400">
          <input
            type="checkbox"
            checked={walkForward}
            onChange={(e) => setWalkForward(e.target.checked)}
          />
          walk-forward
        </label>
        <button
          onClick={run}
          disabled={running}
          className="rounded-lg bg-emerald-500 px-4 py-2 text-sm font-semibold text-black hover:bg-emerald-400 disabled:opacity-50"
        >
          {running ? "Running…" : "Run backtest"}
        </button>
      </div>

      {error && <p className="mb-3 text-sm text-rose-400">{error}</p>}

      {result && (
        <div className="grid grid-cols-2 gap-2 text-xs sm:grid-cols-4">
          <Metric label="Net return (cumm.)" value={`${result.netCumulativeReturnPct}%`} tone="good" />
          <Metric label="Gross / net spread" value={`${result.grossCumulativeReturnPct}% → ${result.netCumulativeReturnPct}%`} />
          <Metric label="Trades / decisions" value={`${result.trades} / ${result.signalsEvaluated}`} />
          <Metric label="Win rate" value={`${result.winRatePct}%`} />
          <Metric label="Avg trade (net)" value={`${result.avgTradeReturnPct}%`} />
          <Metric label="Max drawdown" value={`-${result.maxDrawdownPct}%`} tone="bad" />
          <Metric label="Sharpe (ann.)" value={result.sharpeAnnualized?.toFixed(2) ?? "n/a"} />
          <Metric label="Sortino (ann.)" value={result.sortinoAnnualized?.toFixed(2) ?? "n/a"} />
          <Metric label="Calmar" value={result.calmarRatio?.toFixed(2) ?? "n/a"} />
          <Metric label="Turnover" value={result.turnover.toFixed(3)} />
          <Metric label="Exposure" value={`${result.exposurePct}%`} />
          <Metric label="Cost / trade" value={`${result.avgCostPerTradeBps} bps`} />
          <Metric label="Buy & hold" value={`${result.buyHoldReturnPct}%`} />
          <Metric label="vs benchmark" value={`${result.benchmarkOutperformancePct}%`} tone={result.benchmarkOutperformancePct >= 0 ? "good" : "bad"} />
        </div>
      )}
    </section>
  );
}

function Metric({ label, value, tone }: { label: string; value: string; tone?: "good" | "bad" }) {
  const toneClass =
    tone === "good" ? "text-emerald-400" : tone === "bad" ? "text-rose-400" : "text-zinc-300";
  return (
    <div>
      <dt className="text-zinc-500">{label}</dt>
      <dd className={`font-mono ${toneClass}`}>{value}</dd>
    </div>
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
          <span className="ml-3 font-mono text-xs text-zinc-400">
            conf {(signal.overall.confidence * 100).toFixed(0)}%
          </span>
        </div>
      </header>

      {signal.dataQuality && !signal.dataQuality.isActionable && (
        <div className="mb-3 rounded border border-amber-500/40 bg-amber-500/10 px-3 py-1.5 text-xs text-amber-200">
          data quality: {signal.dataQuality.warnings.join(", ") || "warnings"}
        </div>
      )}

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
          <dt className="text-zinc-500">Sharpe (ann.)</dt>
          <dd className="font-mono text-zinc-300">
            {signal.riskMetrics.sharpeAnnualized ?? "n/a"}
          </dd>
        </div>
        <div>
          <dt className="text-zinc-500">Tail index (Hill)</dt>
          <dd className="font-mono text-zinc-300">
            {signal.riskMetrics.tail.tailIndex ?? "n/a"}
            {signal.riskMetrics.tail.fatTail ? " (fat)" : ""}
          </dd>
        </div>
        <div>
          <dt className="text-zinc-500">99% VaR (Gauss/Hill)</dt>
          <dd className="font-mono text-zinc-300">
            {signal.riskMetrics.tail.gaussianVaR ?? "n/a"} /{" "}
            {signal.riskMetrics.tail.nonGaussianVaR ?? "n/a"}
          </dd>
        </div>
        <div>
          <dt className="text-zinc-500">Risk budget</dt>
          <dd className="font-mono text-zinc-300">
            {signal.riskChecks.riskBudgetPct ?? "n/a"}%
          </dd>
        </div>
        <div>
          <dt className="text-zinc-500">Stop dist. (2×ATR)</dt>
          <dd className="font-mono text-zinc-300">
            {signal.riskChecks.stopDistancePct ?? "n/a"}%
          </dd>
        </div>
      </dl>

      <div className="mt-4 flex justify-end">
        <button
          onClick={() =>
            recordSignal({
              symbol: signal.symbol,
              strategy: signal.overall.direction === "HOLD" ? "TREND" : "MOMENTUM",
              modelVersion: signal.riskChecks.modelVersion,
              timeframe: signal.timeframe,
              horizonDays: 5,
              entryPrice: signal.price,
              direction: signal.overall.direction,
            })
          }
          className="rounded-md border border-zinc-700 bg-zinc-800/60 px-3 py-1.5 text-xs font-medium text-zinc-200 hover:border-emerald-500/50 hover:text-emerald-300"
        >
          Log to paper tracker
        </button>
      </div>
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

      <div className="mt-8 space-y-5">
        <BacktestPanel />
        <PaperPanel />
      </div>
    </main>
  );
}
