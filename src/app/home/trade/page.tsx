"use client";

import { useCallback, useState } from "react";

interface RiskDecision {
  status: string;
  reason?: string;
  order?: { order_id?: string; status?: string };
  message?: string;
  error?: string;
}

function StatusBox({ decision }: { decision: RiskDecision }) {
  const cls =
    decision.status === "approved"
      ? "border-emerald-400/30 bg-emerald-400/10 text-emerald-300"
      : decision.status === "error"
        ? "border-rose-400/30 bg-rose-400/10 text-rose-300"
        : "border-amber-400/30 bg-amber-400/10 text-amber-300";
  return (
    <div className={`rounded-xl border px-4 py-3 text-sm leading-6 ${cls}`}>
      {decision.error ??
        `${decision.status.toUpperCase()}${decision.reason ? ` — ${decision.reason}` : ""}${
          decision.order?.status ? ` · ${decision.order.status}` : ""
        }`}
    </div>
  );
}

export default function TradePage() {
  const [symbol, setSymbol] = useState("NVDA");
  const [quantity, setQuantity] = useState("10");
  const [decision, setDecision] = useState<RiskDecision | null>(null);
  const [proposing, setProposing] = useState(false);

  const submit = useCallback(
    async (side: "buy" | "sell") => {
      const sym = symbol.trim().toUpperCase();
      if (!/^[A-Z]{1,6}$/.test(sym)) {
        setDecision({ status: "error", error: "Enter a valid ticker symbol, for example NVDA." });
        return;
      }
      const qty = Number(quantity);
      if (!Number.isInteger(qty) || qty <= 0) {
        setDecision({ status: "error", error: "Enter a positive whole-number quantity." });
        return;
      }
      setProposing(true);
      setDecision(null);
      try {
        const response = await fetch("/api/trades/propose", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            agent_id: "research-desk",
            symbol: sym,
            side,
            quantity: qty,
            order_type: "market",
            strategy: "research-desk",
            confidence: 0.5,
            reasoning: `Manual ${side} order for ${sym}.`,
          }),
        });
        const body = (await response.json()) as RiskDecision;
        setDecision({ ...body, status: body.error ? "error" : response.ok ? "approved" : "rejected" });
      } catch {
        setDecision({ status: "error", error: "Risk engine is unavailable." });
      } finally {
        setProposing(false);
      }
    },
    [symbol, quantity],
  );

  const fields = [
    { label: "Symbol", value: symbol, onChange: setSymbol, placeholder: "NVDA", className: "font-mono uppercase" },
    { label: "Quantity", value: quantity, onChange: setQuantity, placeholder: "10", className: "font-mono" },
  ];

  return (
    <div className="dashboard-page flex-1 space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-zinc-100">Trade</h1>
        <p className="text-xs text-zinc-500 mt-1">
          Route a market order through the deterministic risk gate before execution.
        </p>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-5 gap-6">
        <div className="lg:col-span-3 rounded-xl bg-white/4 border border-white/10 p-6">
          <h2 className="text-sm font-semibold text-zinc-300 mb-6">Market order</h2>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-5">
            {fields.map((field) => (
              <div key={field.label}>
                <label htmlFor={`trade-${field.label.toLowerCase()}`} className="block text-xs text-zinc-500 mb-2">
                  {field.label}
                </label>
                <input
                  id={`trade-${field.label.toLowerCase()}`}
                  value={field.value}
                  onChange={(event) => field.onChange(event.target.value)}
                  placeholder={field.placeholder}
                  className={`w-full rounded-xl border border-white/10 bg-white/[.04] px-4 py-3 text-sm outline-none placeholder:text-zinc-600 focus:border-violet-400/70 ${field.className}`}
                />
              </div>
            ))}
          </div>

          <div className="mt-8 grid grid-cols-2 gap-4">
            <button
              type="button"
              onClick={() => void submit("buy")}
              disabled={proposing}
              className="rounded-xl bg-emerald-400 px-4 py-4 text-sm font-semibold text-[#04140c] transition hover:bg-emerald-300 disabled:cursor-not-allowed disabled:opacity-50"
            >
              {proposing ? "Checking risk…" : "Buy"}
            </button>
            <button
              type="button"
              onClick={() => void submit("sell")}
              disabled={proposing}
              className="rounded-xl bg-rose-400 px-4 py-4 text-sm font-semibold text-[#180608] transition hover:bg-rose-300 disabled:cursor-not-allowed disabled:opacity-50"
            >
              {proposing ? "Checking risk…" : "Sell"}
            </button>
          </div>

          <p className="mt-4 text-xs text-zinc-600">
            Whole quantities only. Market orders execute immediately at the current broker price.
          </p>

          {decision && (
            <div className="mt-6">
              <StatusBox decision={decision} />
            </div>
          )}
        </div>

        <div className="lg:col-span-2 rounded-xl bg-white/4 border border-white/10 p-6">
          <h2 className="text-sm font-semibold text-zinc-300 mb-4">Order flow</h2>
          <ol className="space-y-4 text-sm text-zinc-400">
            <li className="flex gap-3">
              <span className="text-violet-300 font-mono">1</span>
              <span>
                Submit — the frontend calls <span className="font-mono text-zinc-300">/api/trades/propose</span>.
              </span>
            </li>
            <li className="flex gap-3">
              <span className="text-violet-300 font-mono">2</span>
              <span>
                Risk gate — FastAPI checks buying power, position limits, and drawdown before approving.
              </span>
            </li>
            <li className="flex gap-3">
              <span className="text-violet-300 font-mono">3</span>
              <span>
                Execution — approved orders go to the broker as market fills; the result appears under Orders.
              </span>
            </li>
          </ol>
        </div>
      </div>
    </div>
  );
}