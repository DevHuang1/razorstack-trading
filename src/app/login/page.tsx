"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

export default function LoginPage() {
  const router = useRouter();
  const [passphrase, setPassphrase] = useState("");
  const [status, setStatus] = useState<"idle" | "submitting" | "error">("idle");
  const [error, setError] = useState("");

  const submit = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!passphrase || status === "submitting") return;
    setStatus("submitting");
    setError("");
    try {
      const res = await fetch("/api/auth/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ passphrase }),
      });
      if (res.ok) {
        router.push("/home/research");
        router.refresh();
        return;
      }
      const data = (await res.json().catch(() => null)) as { error?: string } | null;
      setError(data?.error ?? "Invalid passphrase");
      setStatus("error");
    } catch {
      setError("Could not reach the server");
      setStatus("error");
    }
  };

  return (
    <main className="flex min-h-dvh items-center justify-center bg-[var(--trading-bg)] px-4">
      <div className="w-full max-w-sm">
        <form onSubmit={submit} className="overflow-hidden border border-[var(--trading-border)] rounded-2xl bg-[var(--trading-panel)]">
          <div className="flex flex-col items-center gap-3 border-b border-[var(--trading-border)] px-6 py-8 text-center">
            <span className="brand-mark">R</span>
            <div>
              <h1 className="text-lg font-bold tracking-wide text-[var(--trading-text)]">Razorstack Trading</h1>
              <p className="mt-1 text-xs text-[var(--trading-muted)]">Paper trading desk</p>
            </div>
            <span className="paper-badge">Paper</span>
          </div>
          <div className="space-y-4 px-6 py-6">
            <div>
              <label htmlFor="passphrase" className="eyebrow">Passphrase</label>
              <input
                id="passphrase"
                type="password"
                autoComplete="current-password"
                autoFocus
                value={passphrase}
                onChange={(event) => setPassphrase(event.target.value)}
                placeholder="Enter passphrase"
                className="h-11 w-full border border-[var(--trading-border)] rounded-xl bg-[var(--trading-panel-deep)] px-3.5 text-sm text-[var(--trading-text)] outline-none placeholder:text-[var(--trading-muted)] focus:border-[#2962ff]"
              />
            </div>
            {status === "error" && (
              <p className="text-xs text-[#ef5350]" role="alert">{error}</p>
            )}
            <button
              type="submit"
              disabled={!passphrase || status === "submitting"}
              className="h-11 w-full rounded-xl bg-[#2962ff] text-sm font-semibold text-white transition-opacity hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-40"
            >
              {status === "submitting" ? "Signing in…" : "Start Trading"}
            </button>
          </div>
        </form>
        <p className="mt-5 text-center text-[11px] leading-relaxed text-[var(--trading-muted)]">
          Judging demo: use the passphrase provided by the team.
          <br />
          Live-money trading is disabled — paper only.
        </p>
      </div>
    </main>
  );
}