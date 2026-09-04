"use client";

import { useEffect, useState, useCallback } from "react";
import { Sidebar } from "@/components/Sidebar";

// ── Types ──────────────────────────────────────────────────────────────────────
interface Order {
  id: string;
  broker_order_id: string | null;
  agent_id: string;
  symbol: string;
  side: string;
  quantity: number;
  filled_quantity: number;
  avg_fill_price: number | null;
  order_type: string;
  limit_price: number | null;
  status: string;
  reject_reason: string | null;
  created_at: string;
  submitted_at: string | null;
  filled_at: string | null;
}

// ── Helpers ────────────────────────────────────────────────────────────────────
const fmt = (n: number, d = 2) =>
  n.toLocaleString("en-US", { minimumFractionDigits: d, maximumFractionDigits: d });

const STATUS_STYLES: Record<string, string> = {
  FILLED: "bg-emerald-500/15 text-emerald-400 border-emerald-500/30",
  PARTIALLY_FILLED: "bg-cyan-500/15 text-cyan-400 border-cyan-500/30",
  SUBMITTED: "bg-blue-500/15 text-blue-400 border-blue-500/30",
  PENDING: "bg-yellow-500/15 text-yellow-400 border-yellow-500/30",
  CANCELED: "bg-zinc-500/15 text-zinc-400 border-zinc-500/30",
  REJECTED: "bg-red-500/15 text-red-400 border-red-500/30",
  FAILED: "bg-red-600/15 text-red-500 border-red-600/30",
};

const STATUS_OPTIONS = ["", "FILLED", "PARTIALLY_FILLED", "SUBMITTED", "PENDING", "CANCELED", "REJECTED", "FAILED"];

function StatusBadge({ status }: { status: string }) {
  const cls = STATUS_STYLES[status] ?? "bg-zinc-500/15 text-zinc-400 border-zinc-500/30";
  return (
    <span className={`inline-block px-2 py-0.5 rounded border text-xs font-medium ${cls}`}>
      {status.replace("_", " ")}
    </span>
  );
}

function SideBadge({ side }: { side: string }) {
  return (
    <span
      className={`inline-block px-2 py-0.5 rounded border text-xs font-bold uppercase ${
        side.toLowerCase() === "buy"
          ? "bg-emerald-500/10 text-emerald-400 border-emerald-500/30"
          : "bg-red-500/10 text-red-400 border-red-500/30"
      }`}
    >
      {side}
    </span>
  );
}

// ── Main Page ──────────────────────────────────────────────────────────────────
export default function OrdersPage() {
  const [orders, setOrders] = useState<Order[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [statusFilter, setStatusFilter] = useState("");
  const [limit, setLimit] = useState(50);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const qs = statusFilter ? `?limit=${limit}&status=${statusFilter}` : `?limit=${limit}`;
      const res = await fetch(`/api/orders${qs}`);
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data = await res.json();
      if (data.error) throw new Error(data.error);
      setOrders(data);
      setError(null);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setLoading(false);
    }
  }, [statusFilter, limit]);

  useEffect(() => { load(); }, [load]);

  const fills = orders.filter((o) => o.status === "FILLED").length;
  const pending = orders.filter((o) => ["PENDING", "SUBMITTED", "PARTIALLY_FILLED"].includes(o.status)).length;

  return (
    <div className="flex min-h-screen bg-[#0a0a0f] text-zinc-100">
      <Sidebar />
      <main className="flex-1 p-6 space-y-6">
        {/* Header */}
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold text-zinc-100">Orders</h1>
            <p className="text-xs text-zinc-500 mt-1">
              {fills} filled · {pending} active · showing {orders.length}
            </p>
          </div>
          <button
            onClick={load}
            disabled={loading}
            className="px-4 py-2 rounded-lg bg-white/5 border border-white/10 text-zinc-400 text-sm hover:bg-white/10 transition-colors disabled:opacity-50"
          >
            {loading ? "Loading…" : "Refresh"}
          </button>
        </div>

        {error && (
          <div className="p-4 rounded-lg bg-red-500/10 border border-red-500/30 text-red-400 text-sm">
            Backend offline — {error}
          </div>
        )}

        {/* Filters */}
        <div className="flex items-center gap-3">
          <label className="text-xs text-zinc-500">Status</label>
          <select
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value)}
            className="bg-white/5 border border-white/10 rounded-lg px-3 py-1.5 text-sm text-zinc-300 focus:outline-none"
          >
            {STATUS_OPTIONS.map((s) => (
              <option key={s} value={s}>
                {s || "All"}
              </option>
            ))}
          </select>

          <label className="text-xs text-zinc-500 ml-4">Limit</label>
          {[25, 50, 100, 200].map((n) => (
            <button
              key={n}
              onClick={() => setLimit(n)}
              className={`px-3 py-1.5 rounded-lg text-sm border transition-colors ${
                limit === n
                  ? "bg-violet-500/20 border-violet-500/40 text-violet-300"
                  : "bg-white/5 border-white/10 text-zinc-400 hover:bg-white/10"
              }`}
            >
              {n}
            </button>
          ))}
        </div>

        {/* Table */}
        <div className="rounded-xl bg-white/4 border border-white/10 overflow-hidden">
          {orders.length === 0 && !loading ? (
            <div className="px-4 py-16 text-center text-zinc-600 text-sm">No orders found</div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="border-b border-white/10">
                  <tr>
                    {["Time", "Symbol", "Side", "Type", "Qty", "Filled", "Avg Price", "Limit", "Agent", "Status"].map((h) => (
                      <th
                        key={h}
                        className="px-4 py-3 text-left text-xs font-medium text-zinc-500 uppercase tracking-wider"
                      >
                        {h}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody className="divide-y divide-white/5">
                  {orders.map((o) => (
                    <tr key={o.id} className="hover:bg-white/5 transition-colors group">
                      <td className="px-4 py-3 text-zinc-500 text-xs">
                        {new Date(o.created_at).toLocaleTimeString()}
                        <br />
                        <span className="text-zinc-600">{new Date(o.created_at).toLocaleDateString()}</span>
                      </td>
                      <td className="px-4 py-3 font-mono font-bold text-violet-300">{o.symbol}</td>
                      <td className="px-4 py-3">
                        <SideBadge side={o.side} />
                      </td>
                      <td className="px-4 py-3 text-zinc-400 uppercase text-xs">{o.order_type}</td>
                      <td className="px-4 py-3 text-zinc-300">{o.quantity}</td>
                      <td className="px-4 py-3 text-zinc-300">
                        {o.filled_quantity > 0 ? (
                          <span className={o.filled_quantity >= o.quantity ? "text-emerald-400" : "text-cyan-400"}>
                            {o.filled_quantity}
                          </span>
                        ) : (
                          <span className="text-zinc-600">—</span>
                        )}
                      </td>
                      <td className="px-4 py-3 text-zinc-200">
                        {o.avg_fill_price ? `$${fmt(o.avg_fill_price)}` : <span className="text-zinc-600">—</span>}
                      </td>
                      <td className="px-4 py-3 text-zinc-400">
                        {o.limit_price ? `$${fmt(o.limit_price)}` : <span className="text-zinc-600">—</span>}
                      </td>
                      <td className="px-4 py-3 text-zinc-500 text-xs truncate max-w-[120px]">{o.agent_id}</td>
                      <td className="px-4 py-3">
                        <StatusBadge status={o.status} />
                        {o.reject_reason && (
                          <p className="text-red-400 text-xs mt-0.5 truncate max-w-[120px]" title={o.reject_reason}>
                            {o.reject_reason}
                          </p>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </main>
    </div>
  );
}
