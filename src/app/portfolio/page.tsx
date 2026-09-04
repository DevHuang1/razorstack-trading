"use client";

import { useEffect, useState, useCallback } from "react";
import { Sidebar } from "@/components/Sidebar";

// ── Types ──────────────────────────────────────────────────────────────────────
interface Position {
  symbol: string;
  sector: string;
  quantity: number;
  avg_entry_price: number;
  current_price: number;
  market_value: number;
  unrealized_pnl: number;
  weight: number;
}

interface Portfolio {
  equity: number;
  cash: number;
  buying_power: number;
  positions: Position[];
  total_pnl: number;
  daily_pnl: number;
  daily_pnl_pct: number;
  drawdown: number;
  sector_exposure: Record<string, number>;
  risk_score: number;
  peak_equity: number;
  timestamp: string;
}

// ── Helpers ────────────────────────────────────────────────────────────────────
const fmt = (n: number, digits = 2) =>
  n.toLocaleString("en-US", { minimumFractionDigits: digits, maximumFractionDigits: digits });

const money = (n: number) =>
  `$${Math.abs(n).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

function Sign({ value }: { value: number }) {
  const cls = value >= 0 ? "text-emerald-400" : "text-red-400";
  return (
    <span className={cls}>
      {value >= 0 ? "+" : "−"}
      {money(value)}
    </span>
  );
}

function Pct({ value }: { value: number }) {
  const cls = value >= 0 ? "text-emerald-400" : "text-red-400";
  return (
    <span className={cls}>
      {value >= 0 ? "+" : ""}
      {fmt(value * 100)}%
    </span>
  );
}

const SECTOR_COLORS: Record<string, string> = {
  technology: "bg-violet-500",
  financials: "bg-cyan-500",
  healthcare: "bg-emerald-500",
  energy: "bg-yellow-500",
  consumer: "bg-orange-500",
  industrials: "bg-blue-500",
  materials: "bg-pink-500",
  utilities: "bg-teal-500",
  other: "bg-zinc-500",
};

function SectorBar({ name, pct }: { name: string; pct: number }) {
  const color = SECTOR_COLORS[name.toLowerCase()] ?? "bg-zinc-500";
  return (
    <div className="flex items-center gap-3">
      <span className="w-24 text-xs text-zinc-400 capitalize truncate">{name}</span>
      <div className="flex-1 bg-white/5 rounded-full h-2">
        <div className={`${color} h-2 rounded-full`} style={{ width: `${Math.min(pct * 100, 100)}%` }} />
      </div>
      <span className="w-10 text-right text-xs text-zinc-300">{fmt(pct * 100)}%</span>
    </div>
  );
}

// ── Main Page ──────────────────────────────────────────────────────────────────
export default function PortfolioPage() {
  const [portfolio, setPortfolio] = useState<Portfolio | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [sortKey, setSortKey] = useState<keyof Position>("market_value");
  const [sortAsc, setSortAsc] = useState(false);

  const load = useCallback(async () => {
    try {
      const res = await fetch("/api/portfolio");
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data = await res.json();
      if (data.error) throw new Error(data.error);
      setPortfolio(data);
      setError(null);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
    const id = setInterval(load, 15_000);
    return () => clearInterval(id);
  }, [load]);

  const sorted = portfolio
    ? [...portfolio.positions].sort((a, b) => {
        const av = a[sortKey] as number;
        const bv = b[sortKey] as number;
        return sortAsc ? av - bv : bv - av;
      })
    : [];

  const handleSort = (key: keyof Position) => {
    if (sortKey === key) setSortAsc((p) => !p);
    else { setSortKey(key); setSortAsc(false); }
  };

  const Th = ({ label, k }: { label: string; k: keyof Position }) => (
    <th
      className="px-4 py-3 text-left text-xs font-medium text-zinc-500 uppercase tracking-wider cursor-pointer hover:text-zinc-300 select-none"
      onClick={() => handleSort(k)}
    >
      {label}{" "}
      {sortKey === k && <span className="text-violet-400">{sortAsc ? "↑" : "↓"}</span>}
    </th>
  );

  return (
    <div className="flex min-h-screen bg-[#0a0a0f] text-zinc-100">
      <Sidebar />
      <main className="flex-1 p-6 space-y-6">
        {/* Header */}
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold text-zinc-100">Portfolio</h1>
            <p className="text-xs text-zinc-500 mt-1">
              {portfolio ? new Date(portfolio.timestamp).toLocaleString() : "Loading…"}
            </p>
          </div>
          <button
            onClick={load}
            className="px-4 py-2 rounded-lg bg-white/5 border border-white/10 text-zinc-400 text-sm hover:bg-white/10 transition-colors"
          >
            Refresh
          </button>
        </div>

        {error && (
          <div className="p-4 rounded-lg bg-red-500/10 border border-red-500/30 text-red-400 text-sm">
            Backend offline — {error}
          </div>
        )}

        {loading && !portfolio && (
          <div className="text-zinc-500 text-sm">Connecting to backend…</div>
        )}

        {portfolio && (
          <>
            {/* KPI Strip */}
            <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-6 gap-3">
              {[
                { label: "Equity", value: money(portfolio.equity) },
                { label: "Cash", value: money(portfolio.cash) },
                { label: "Buying Power", value: money(portfolio.buying_power) },
                { label: "Daily P&L", value: <Sign value={portfolio.daily_pnl} />, raw: portfolio.daily_pnl },
                { label: "Total P&L", value: <Sign value={portfolio.total_pnl} />, raw: portfolio.total_pnl },
                { label: "Drawdown", value: <span className="text-orange-400">{fmt(portfolio.drawdown * 100)}%</span> },
              ].map((kpi) => (
                <div key={kpi.label} className="rounded-xl bg-white/4 border border-white/10 p-4">
                  <p className="text-xs text-zinc-500 mb-1">{kpi.label}</p>
                  <p className="text-lg font-semibold">
                    {typeof kpi.value === "string" ? (
                      <span className="text-zinc-100">{kpi.value}</span>
                    ) : (
                      kpi.value
                    )}
                  </p>
                </div>
              ))}
            </div>

            {/* Risk score */}
            <div className="rounded-xl bg-white/4 border border-white/10 p-4">
              <div className="flex items-center justify-between mb-2">
                <span className="text-sm text-zinc-400">Portfolio Risk Score</span>
                <span
                  className={`text-sm font-semibold ${
                    portfolio.risk_score >= 0.7
                      ? "text-red-400"
                      : portfolio.risk_score >= 0.4
                      ? "text-yellow-400"
                      : "text-emerald-400"
                  }`}
                >
                  {fmt(portfolio.risk_score * 100)}
                </span>
              </div>
              <div className="h-2 bg-white/5 rounded-full overflow-hidden">
                <div
                  className={`h-2 rounded-full transition-all ${
                    portfolio.risk_score >= 0.7
                      ? "bg-red-500"
                      : portfolio.risk_score >= 0.4
                      ? "bg-yellow-500"
                      : "bg-emerald-500"
                  }`}
                  style={{ width: `${portfolio.risk_score * 100}%` }}
                />
              </div>
            </div>

            {/* Positions table + Sector breakdown */}
            <div className="grid grid-cols-1 xl:grid-cols-3 gap-6">
              {/* Positions table */}
              <div className="xl:col-span-2 rounded-xl bg-white/4 border border-white/10 overflow-hidden">
                <div className="px-4 py-3 border-b border-white/10">
                  <h2 className="text-sm font-semibold text-zinc-300">
                    Open Positions ({portfolio.positions.length})
                  </h2>
                </div>
                {portfolio.positions.length === 0 ? (
                  <div className="px-4 py-12 text-center text-zinc-600 text-sm">No open positions</div>
                ) : (
                  <div className="overflow-x-auto">
                    <table className="w-full text-sm">
                      <thead className="border-b border-white/10">
                        <tr>
                          <Th label="Symbol" k="symbol" />
                          <Th label="Qty" k="quantity" />
                          <Th label="Avg Cost" k="avg_entry_price" />
                          <Th label="Price" k="current_price" />
                          <Th label="Mkt Value" k="market_value" />
                          <Th label="Unrlzd P&L" k="unrealized_pnl" />
                          <Th label="Weight" k="weight" />
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-white/5">
                        {sorted.map((pos) => (
                          <tr key={pos.symbol} className="hover:bg-white/5 transition-colors">
                            <td className="px-4 py-3 font-mono font-bold text-violet-300">{pos.symbol}</td>
                            <td className="px-4 py-3 text-zinc-300">{pos.quantity}</td>
                            <td className="px-4 py-3 text-zinc-300">${fmt(pos.avg_entry_price)}</td>
                            <td className="px-4 py-3 text-zinc-200">${fmt(pos.current_price)}</td>
                            <td className="px-4 py-3 text-zinc-200">${fmt(pos.market_value)}</td>
                            <td className="px-4 py-3">
                              <Sign value={pos.unrealized_pnl} />
                            </td>
                            <td className="px-4 py-3 text-zinc-400">{fmt(pos.weight * 100)}%</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </div>

              {/* Sector breakdown */}
              <div className="rounded-xl bg-white/4 border border-white/10 p-4">
                <h2 className="text-sm font-semibold text-zinc-300 mb-4">Sector Exposure</h2>
                {Object.keys(portfolio.sector_exposure).length === 0 ? (
                  <p className="text-zinc-600 text-sm">No positions</p>
                ) : (
                  <div className="space-y-3">
                    {Object.entries(portfolio.sector_exposure)
                      .sort(([, a], [, b]) => b - a)
                      .map(([sector, pct]) => (
                        <SectorBar key={sector} name={sector} pct={pct} />
                      ))}
                  </div>
                )}
              </div>
            </div>
          </>
        )}
      </main>
    </div>
  );
}
