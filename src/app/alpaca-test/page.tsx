"use client";

import { useCallback, useState } from "react";

interface TestResult {
  ok: boolean;
  status?: number;
  requestUrl?: string;
  error?: string;
  body?: unknown;
}

const TIMEFRAMES = ["1Min", "5Min", "15Min", "1Hour", "1Day"];
const FEEDS = ["iex", "sip"];

const PRESETS: { endpoint: string; label: string; needsSymbol: boolean }[] = [
  { endpoint: "clock", label: "Clock", needsSymbol: false },
  { endpoint: "account", label: "Account", needsSymbol: false },
  { endpoint: "positions", label: "Positions", needsSymbol: false },
  { endpoint: "bars", label: "Bars", needsSymbol: true },
  { endpoint: "quote", label: "Latest Quote", needsSymbol: true },
  { endpoint: "trade", label: "Latest Trade", needsSymbol: true },
  { endpoint: "snapshot", label: "Snapshot", needsSymbol: true },
  { endpoint: "news", label: "News", needsSymbol: false },
];

export default function AlpacaTestPage() {
  const [endpoint, setEndpoint] = useState("quote");
  const [symbol, setSymbol] = useState("AAPL");
  const [timeframe, setTimeframe] = useState("1Day");
  const [limit, setLimit] = useState("10");
  const [feed, setFeed] = useState("iex");
  const [result, setResult] = useState<TestResult | null>(null);
  const [loading, setLoading] = useState(false);

  const run = useCallback(
    async (name: string) => {
      setLoading(true);
      setResult(null);
      try {
        const params = new URLSearchParams({ endpoint: name });
        if (symbol.trim()) params.set("symbols", symbol.trim().toUpperCase());
        if (name === "bars") {
          params.set("timeframe", timeframe);
          params.set("limit", limit);
        }
        if (["bars", "quote", "trade", "snapshot", "news"].includes(name)) {
          params.set("feed", feed);
        }
        const res = await fetch(`/api/alpaca-test?${params.toString()}`);
        setResult((await res.json()) as TestResult);
      } catch (err) {
        setResult({
          ok: false,
          error: err instanceof Error ? err.message : "Request failed",
        });
      } finally {
        setLoading(false);
      }
    },
    [symbol, timeframe, limit, feed],
  );

  return (
    <div className="flex min-h-screen flex-col gap-6 bg-zinc-50 p-8 font-sans text-zinc-900 dark:bg-black dark:text-zinc-100">
      <header>
        <h1 className="text-2xl font-semibold">Alpaca API Tester</h1>
        <p className="text-sm text-zinc-500 dark:text-zinc-400">
          Calls are proxied through <code>/api/alpaca-test</code>; keys stay server-side.
        </p>
      </header>

      <section className="flex flex-wrap items-end gap-4 rounded-lg border border-zinc-200 bg-white p-4 dark:border-zinc-800 dark:bg-zinc-950">
        <label className="flex flex-col gap-1 text-xs font-medium uppercase tracking-wide text-zinc-500">
          Endpoint
          <select
            value={endpoint}
            onChange={(e) => setEndpoint(e.target.value)}
            className="rounded border border-zinc-300 bg-white px-2 py-1.5 text-sm normal-case text-zinc-900 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-100"
          >
            {PRESETS.map((p) => (
              <option key={p.endpoint} value={p.endpoint}>
                {p.label} ({p.endpoint})
              </option>
            ))}
          </select>
        </label>

        <label className="flex flex-col gap-1 text-xs font-medium uppercase tracking-wide text-zinc-500">
          Symbols
          <input
            value={symbol}
            onChange={(e) => setSymbol(e.target.value)}
            placeholder="AAPL"
            className="w-32 rounded border border-zinc-300 bg-white px-2 py-1.5 text-sm dark:border-zinc-700 dark:bg-zinc-900"
          />
        </label>

        {endpoint === "bars" && (
          <>
            <label className="flex flex-col gap-1 text-xs font-medium uppercase tracking-wide text-zinc-500">
              Timeframe
              <select
                value={timeframe}
                onChange={(e) => setTimeframe(e.target.value)}
                className="rounded border border-zinc-300 bg-white px-2 py-1.5 text-sm dark:border-zinc-700 dark:bg-zinc-900"
              >
                {TIMEFRAMES.map((tf) => (
                  <option key={tf}>{tf}</option>
                ))}
              </select>
            </label>
            <label className="flex flex-col gap-1 text-xs font-medium uppercase tracking-wide text-zinc-500">
              Limit
              <input
                value={limit}
                onChange={(e) => setLimit(e.target.value.replace(/\D/g, ""))}
                className="w-20 rounded border border-zinc-300 bg-white px-2 py-1.5 text-sm dark:border-zinc-700 dark:bg-zinc-900"
              />
            </label>
          </>
        )}

        {endpoint !== "clock" && endpoint !== "account" && endpoint !== "positions" && (
          <label className="flex flex-col gap-1 text-xs font-medium uppercase tracking-wide text-zinc-500">
            Feed
            <select
              value={feed}
              onChange={(e) => setFeed(e.target.value)}
              className="rounded border border-zinc-300 bg-white px-2 py-1.5 text-sm dark:border-zinc-700 dark:bg-zinc-900"
            >
              {FEEDS.map((f) => (
                <option key={f}>{f}</option>
              ))}
            </select>
          </label>
        )}

        <button
          onClick={() => run(endpoint)}
          disabled={loading}
          className="rounded-md bg-zinc-900 px-4 py-2 text-sm font-medium text-white hover:bg-zinc-700 disabled:opacity-50 dark:bg-zinc-100 dark:text-zinc-900 dark:hover:bg-zinc-300"
        >
          {loading ? "Fetching…" : "Send request"}
        </button>
      </section>

      <section className="flex flex-1 flex-col rounded-lg border border-zinc-200 bg-white p-4 dark:border-zinc-800 dark:bg-zinc-950">
        <div className="mb-2 flex items-center gap-3 text-xs text-zinc-500 dark:text-zinc-400">
          <span
            className={`inline-block h-2.5 w-2.5 rounded-full ${
              result === null
                ? "bg-zinc-300 dark:bg-zinc-600"
                : result.ok
                  ? "bg-emerald-500"
                  : "bg-red-500"
            }`}
          />
          {result &&
            (result.error
              ? `Error: ${result.error}`
              : `HTTP ${result.status} — ${result.requestUrl}`)}
        </div>
        <pre className="max-h-[60vh] flex-1 overflow-auto whitespace-pre-wrap break-all rounded bg-zinc-100 p-3 font-mono text-xs leading-relaxed dark:bg-zinc-900">
          {result ? JSON.stringify(result.body ?? result, null, 2) : "No response yet — pick an endpoint and hit Send."}
        </pre>
      </section>
    </div>
  );
}
