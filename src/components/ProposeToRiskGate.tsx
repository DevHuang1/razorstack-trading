"use client";

import { useState } from "react";

// Renders a quantity input + "Propose to risk gate" action and displays the
// FastAPI risk engine's verdict verbatim. The client never decides anything:
// approved / adjusted / rejected / filled all come from the backend response.

interface RiskDecision {
  status?: "APPROVED" | "ADJUSTED" | "REJECTED" | string;
  reason?: string;
  code?: string;
  risk_score?: number;
  original_quantity?: number;
  approved_quantity?: number;
}

interface OrderInfo {
  id?: string;
  status?: string;
  filled_quantity?: number;
  avg_fill_price?: number | null;
  reject_reason?: string | null;
}

interface ProposeResponse {
  proposal?: { id?: string; status?: string; quantity?: number };
  risk?: RiskDecision;
  order?: OrderInfo | null;
  message?: string;
  error?: string;
}

const DECISION_STYLES: Record<string, string> = {
  APPROVED: "border-emerald-500/40 bg-emerald-500/10 text-emerald-300",
  ADJUSTED: "border-amber-500/40 bg-amber-500/10 text-amber-300",
  REJECTED: "border-rose-500/40 bg-rose-500/10 text-rose-300",
};

const ORDER_STYLES: Record<string, string> = {
  FILLED: "text-emerald-300",
  SUBMITTED: "text-sky-300",
  PARTIALLY_FILLED: "text-amber-300",
  PENDING: "text-zinc-300",
  CANCELED: "text-zinc-400",
  REJECTED: "text-rose-300",
  FAILED: "text-rose-300",
};

export interface ProposeToRiskGateProps {
  symbol: string;
  side: "buy" | "sell";
  strategy: string;
  /** 0–1 calibrated confidence, forwarded to the risk gate untouched. */
  confidence: number;
  reasoning: string;
  agentId: string;
  defaultQuantity?: number;
  /** When true the button is disabled and the reason is displayed. */
  disabled?: boolean;
  disabledReason?: string;
  label?: string;
  /**
   * When provided, the component posts the full research-desk proposal to the
   * `/api/research/submit` bridge (which validates the wire contract before it
   * reaches FastAPI) instead of posting a hand-built payload to
   * `/api/trades/propose`. This is the AI research desk's path.
   */
  proposal?: import("@/lib/contracts/research").TradeProposalWire;
}

export function ProposeToRiskGate({
  symbol,
  side,
  strategy,
  confidence,
  reasoning,
  agentId,
  defaultQuantity = 10,
  disabled = false,
  disabledReason,
  label = "Propose to risk gate",
  proposal,
}: ProposeToRiskGateProps) {
  const [quantity, setQuantity] = useState(String(defaultQuantity));
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<ProposeResponse | null>(null);

  const propose = async (): Promise<void> => {
    const qty = Math.floor(Number(quantity));
    if (!Number.isFinite(qty) || qty <= 0) {
      setError("Quantity must be a positive whole number.");
      return;
    }
    setSubmitting(true);
    setError(null);
    try {
      const endpoint = proposal ? "/api/research/submit" : "/api/trades/propose";
      const body = proposal
        ? JSON.stringify({ proposal, quantity: qty, agent_id: agentId })
        : JSON.stringify({
            agent_id: agentId,
            symbol,
            side,
            quantity: qty,
            order_type: "market",
            strategy,
            confidence,
            reasoning: reasoning.slice(0, 4000),
          });
      const res = await fetch(endpoint, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body,
      });
      const bodyJson = (await res.json().catch(() => null)) as ProposeResponse | null;
      if (!res.ok) {
        setError(bodyJson?.error ?? `Risk gate returned ${res.status}`);
        setResult(null);
        return;
      }
      setResult(bodyJson);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Could not reach the risk gate");
    } finally {
      setSubmitting(false);
    }
  };

  const risk = result?.risk;
  const order = result?.order ?? null;
  const adjusted =
    risk && typeof risk.original_quantity === "number" && risk.original_quantity !== risk.approved_quantity;

  return (
    <div className="space-y-2">
      <div className="flex items-end gap-2">
        <label className="flex flex-col gap-1 text-xs text-zinc-400">
          Qty
          <input
            inputMode="numeric"
            value={quantity}
            onChange={(e) => setQuantity(e.target.value)}
            disabled={disabled || submitting}
            className="w-20 rounded-lg border border-zinc-700 bg-zinc-900 px-2 py-2 font-mono text-sm text-zinc-100 outline-none focus:border-emerald-500 disabled:opacity-40"
          />
        </label>
        <button
          type="button"
          onClick={() => void propose()}
          disabled={disabled || submitting}
          title={disabled ? disabledReason : undefined}
          className="rounded-lg bg-emerald-500 px-3 py-2 text-xs font-semibold text-black hover:bg-emerald-400 disabled:cursor-not-allowed disabled:opacity-40"
        >
          {submitting ? "Proposing…" : label}
        </button>
      </div>

      {disabled && disabledReason && <p className="text-xs text-zinc-500">{disabledReason}</p>}
      {error && <p className="text-xs text-rose-400">{error}</p>}

      {risk && (
        <div
          className={`rounded-lg border p-3 text-xs leading-5 ${
            DECISION_STYLES[risk.status ?? ""] ?? "border-zinc-700 bg-zinc-900 text-zinc-300"
          }`}
        >
          <p className="font-semibold">Risk gate: {risk.status}</p>
          <p className="mt-1 opacity-90">
            {risk.reason}
            {risk.code ? ` (${risk.code})` : ""}
          </p>
          {adjusted && (
            <p className="mt-1 font-mono">
              Quantity adjusted: {risk.original_quantity} → {risk.approved_quantity}
            </p>
          )}
          {order && (
            <p className={`mt-1 font-mono ${ORDER_STYLES[order.status ?? ""] ?? "text-zinc-300"}`}>
              Order {order.status}
              {typeof order.filled_quantity === "number" ? ` · filled ${order.filled_quantity}` : ""}
              {order.avg_fill_price != null ? ` @ $${order.avg_fill_price}` : ""}
              {order.reject_reason ? ` · ${order.reject_reason}` : ""}
            </p>
          )}
          {!order && risk.status !== "REJECTED" && result?.message && (
            <p className="mt-1 opacity-75">{result.message}</p>
          )}
          <details className="mt-2">
            <summary className="cursor-pointer text-[11px] text-zinc-500 hover:text-zinc-300">
              Raw backend response
            </summary>
            <pre className="mt-1 max-h-56 overflow-auto rounded bg-black/40 p-2 font-mono text-[10px] text-zinc-400">
              {JSON.stringify(result, null, 2)}
            </pre>
          </details>
        </div>
      )}
    </div>
  );
}