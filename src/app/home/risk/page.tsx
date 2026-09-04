"use client";

import { useEffect, useState, useCallback } from "react";
import { Sidebar } from "@/components/Sidebar";

// ── Types ──────────────────────────────────────────────────────────────────────
interface RiskLimits {
  max_position_percent: number;
  max_sector_exposure_percent: number;
  min_cash_percent: number;
  max_daily_loss_percent: number;
  max_drawdown_percent: number;
}

interface RiskMetrics {
  equity: number;
  cash: number;
  buying_power: number;
  daily_pnl: number;
  daily_loss_pct: number;
  drawdown_pct: number;
  peak_equity: number;
  top_symbol: string | null;
  top_symbol_exposure_pct: number;
  top_sector: string | null;
  top_sector_exposure_pct: number;
  risk_score: number;
}

interface RiskStatus {
  broker_mode: string;
  restricted_mode: boolean;
  restrictions: string[];
  limits: RiskLimits;
  metrics: RiskMetrics;
}

// ── Helpers ────────────────────────────────────────────────────────────────────
const fmt = (n: number, d = 2) =>
  n.toLocaleString("en-US", { minimumFractionDigits: d, maximumFractionDigits: d });

function GaugeBar({
  label,
  value,
  limit,
  unit = "%",
  inverse = false,
}: {
  label: string;
  value: number;
  limit?: number;
  unit?: string;
  inverse?: boolean;
}) {
  const pct = limit ? Math.min((value / limit) * 100, 100) : Math.min(value * 100, 100);
  const danger = pct >= 85;
  const warn = pct >= 60;
  const color = inverse
    ? pct <= 20
      ? "bg-red-500"
      : pct <= 50
      ? "bg-yellow-500"
      : "bg-emerald-500"
    : danger
    ? "bg-red-500"
    : warn
    ? "bg-yellow-500"
    : "bg-emerald-500";

  return (
    <div>
      <div className="flex justify-between text-xs mb-1">
        <span className="text-zinc-400">{label}</span>
        <span className="text-zinc-200 font-mono">
          {fmt(value)}
          {unit}
          {limit !== undefined && (
            <span className="text-zinc-500">
              {" "}
              / {fmt(limit)}
              {unit}
            </span>
          )}
        </span>
      </div>
      <div className="h-2 bg-white/5 rounded-full overflow-hidden">
        <div className={`h-2 rounded-full transition-all ${color}`} style={{ width: `${pct}%` }} />
      </div>
    </div>
  );
}

function MetricCard({
  label,
  value,
  sub,
  alert,
}: {
  label: string;
  value: string | React.ReactNode;
  sub?: string;
  alert?: boolean;
}) {
  return (
    <div
      className={`rounded-xl p-4 border ${
        alert
          ? "bg-red-500/10 border-red-500/30"
          : "bg-white/4 border-white/10"
      }`}
    >
      <p className="text-xs text-zinc-500 mb-1">{label}</p>
      <p className={`text-lg font-semibold ${alert ? "text-red-400" : "text-zinc-100"}`}>{value}</p>
      {sub && <p className="text-xs text-zinc-500 mt-0.5">{sub}</p>}
    </div>
  );
}

// ── Main Page ──────────────────────────────────────────────────────────────────
export default function RiskPage() {
  const [risk, setRisk] = useState<RiskStatus | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [lastUpdate, setLastUpdate] = useState<Date | null>(null);

  const load = useCallback(async () => {
    try {
      const res = await fetch("/api/risk");
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data = await res.json();
      if (data.error) throw new Error(data.error);
      setRisk(data);
      setLastUpdate(new Date());
      setError(null);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    const t = setTimeout(load, 0);
    const id = setInterval(load, 10_000);
    return () => { clearTimeout(t); clearInterval(id); };
  }, [load]);

  const m = risk?.metrics;
  const l = risk?.limits;

  return (
    <div className="flex min-h-screen bg-background text-foreground">
      <Sidebar />
      <main className="flex-1 p-6 space-y-6">
        {/* Header */}
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold text-zinc-100">Risk Dashboard</h1>
            <p className="text-xs text-zinc-500 mt-1">
              {lastUpdate ? `Updated ${lastUpdate.toLocaleTimeString()}` : "Loading…"}
            </p>
          </div>
          <div className="flex items-center gap-3">
            {risk && (
              <span
                className={`px-3 py-1.5 rounded-full text-xs font-bold border uppercase tracking-wider ${
                  risk.restricted_mode
                    ? "bg-red-500/15 text-red-400 border-red-500/40"
                    : "bg-emerald-500/15 text-emerald-400 border-emerald-500/40"
                }`}
              >
                {risk.restricted_mode ? "RESTRICTED" : "NORMAL"}
              </span>
            )}
            <button
              onClick={load}
              disabled={loading}
              className="px-4 py-2 rounded-lg bg-white/5 border border-white/10 text-zinc-400 text-sm hover:bg-white/10 transition-colors disabled:opacity-50"
            >
              {loading ? "…" : "Refresh"}
            </button>
          </div>
        </div>

        {error && (
          <div className="p-4 rounded-lg bg-red-500/10 border border-red-500/30 text-red-400 text-sm">
            Backend offline — {error}
          </div>
        )}

        {/* Active restrictions */}
        {risk && risk.restrictions.length > 0 && (
          <div className="p-4 rounded-xl bg-red-500/10 border border-red-500/30 space-y-2">
            <p className="text-sm font-semibold text-red-400">Active Halt Conditions</p>
            <div className="flex flex-wrap gap-2">
              {risk.restrictions.map((r) => (
                <span key={r} className="px-2 py-1 rounded bg-red-500/20 border border-red-500/30 text-red-400 text-xs font-mono">
                  {r}
                </span>
              ))}
            </div>
          </div>
        )}

        {risk && m && l && (
          <>
            {/* Broker Mode + Key Metrics */}
            <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-5 gap-3">
              <MetricCard
                label="Broker Mode"
                value={<span className="text-cyan-400 uppercase">{risk.broker_mode}</span>}
              />
              <MetricCard
                label="Equity"
                value={`$${fmt(m.equity)}`}
                sub={`Peak $${fmt(m.peak_equity)}`}
              />
              <MetricCard
                label="Daily P&L"
                value={
                  <span className={m.daily_pnl >= 0 ? "text-emerald-400" : "text-red-400"}>
                    {m.daily_pnl >= 0 ? "+" : ""}${fmt(m.daily_pnl)}
                  </span>
                }
                alert={m.daily_loss_pct >= l.max_daily_loss_percent}
              />
              <MetricCard
                label="Drawdown"
                value={
                  <span className={m.drawdown_pct >= l.max_drawdown_percent ? "text-red-400" : "text-orange-400"}>
                    {fmt(m.drawdown_pct * 100)}%
                  </span>
                }
                alert={m.drawdown_pct >= l.max_drawdown_percent}
              />
              <MetricCard
                label="Risk Score"
                value={
                  <span
                    className={
                      m.risk_score >= 0.7
                        ? "text-red-400"
                        : m.risk_score >= 0.4
                        ? "text-yellow-400"
                        : "text-emerald-400"
                    }
                  >
                    {fmt(m.risk_score * 100, 1)}
                  </span>
                }
              />
            </div>

            {/* Gauge section */}
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
              {/* Utilisation vs Limits */}
              <div className="rounded-xl bg-white/4 border border-white/10 p-5 space-y-4">
                <h2 className="text-sm font-semibold text-zinc-300">Utilisation vs Limits</h2>
                <GaugeBar
                  label="Daily Loss"
                  value={m.daily_loss_pct * 100}
                  limit={l.max_daily_loss_percent * 100}
                />
                <GaugeBar
                  label="Drawdown"
                  value={m.drawdown_pct * 100}
                  limit={l.max_drawdown_percent * 100}
                />
                <GaugeBar
                  label="Top Symbol Exposure"
                  value={m.top_symbol_exposure_pct * 100}
                  limit={l.max_position_percent * 100}
                />
                <GaugeBar
                  label="Top Sector Exposure"
                  value={m.top_sector_exposure_pct * 100}
                  limit={l.max_sector_exposure_percent * 100}
                />
                <GaugeBar
                  label="Cash Reserve"
                  value={(m.cash / (m.equity || 1)) * 100}
                  limit={l.min_cash_percent * 100}
                  inverse
                />
              </div>

              {/* Limits table */}
              <div className="rounded-xl bg-white/4 border border-white/10 p-5">
                <h2 className="text-sm font-semibold text-zinc-300 mb-4">Configured Limits</h2>
                <div className="divide-y divide-white/5">
                  {[
                    { label: "Max Position %", value: `${fmt(l.max_position_percent * 100)}%` },
                    { label: "Max Sector Exposure %", value: `${fmt(l.max_sector_exposure_percent * 100)}%` },
                    { label: "Min Cash Reserve %", value: `${fmt(l.min_cash_percent * 100)}%` },
                    { label: "Max Daily Loss %", value: `${fmt(l.max_daily_loss_percent * 100)}%` },
                    { label: "Max Drawdown %", value: `${fmt(l.max_drawdown_percent * 100)}%` },
                  ].map((row) => (
                    <div key={row.label} className="flex justify-between py-2.5 text-sm">
                      <span className="text-zinc-500">{row.label}</span>
                      <span className="text-zinc-200 font-mono">{row.value}</span>
                    </div>
                  ))}
                </div>

                <div className="mt-5 pt-4 border-t border-white/10 space-y-2">
                  <h3 className="text-xs text-zinc-500 uppercase tracking-wider mb-3">Top Concentration</h3>
                  <div className="flex justify-between text-sm">
                    <span className="text-zinc-500">Top Symbol</span>
                    <span className="text-violet-300 font-mono">
                      {m.top_symbol ?? "—"}{" "}
                      <span className="text-zinc-400">({fmt(m.top_symbol_exposure_pct * 100)}%)</span>
                    </span>
                  </div>
                  <div className="flex justify-between text-sm">
                    <span className="text-zinc-500">Top Sector</span>
                    <span className="text-cyan-300 capitalize">
                      {m.top_sector ?? "—"}{" "}
                      <span className="text-zinc-400">({fmt(m.top_sector_exposure_pct * 100)}%)</span>
                    </span>
                  </div>
                </div>
              </div>
            </div>
          </>
        )}

        {loading && !risk && (
          <div className="text-zinc-500 text-sm">Connecting to backend…</div>
        )}
      </main>
    </div>
  );
}
