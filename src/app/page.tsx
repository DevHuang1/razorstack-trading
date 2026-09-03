"use client";

import React, { useState, useEffect, useRef, useCallback } from "react";

// ─── Types ────────────────────────────────────────────────────────────────────

type AgentRole =
  | "news"
  | "market_research"
  | "bull"
  | "bear"
  | "investment_committee"
  | "crisis_news"
  | "crisis_market"
  | "crisis_risk_analyst"
  | "crisis_options"
  | "crisis_committee";

type Stance = "bullish" | "bearish" | "neutral";
type Direction = "BUY" | "SELL" | "HOLD";

interface AgentMessage {
  role: AgentRole;
  stance: Stance;
  headline: string;
  body: string;
  confidence: number | null;
}

interface CIOThesis {
  symbol: string;
  direction: Direction;
  confidence: number;
  summary: string;
  catalysts: string[];
  risks: string[];
  recommendation: string;
}

interface StreamEvent {
  type: "status" | "agent_message" | "thesis" | "error" | "done";
  step?: string;
  detail?: string;
  message?: AgentMessage;
  thesis?: CIOThesis;
}

// ─── Agent config ─────────────────────────────────────────────────────────────

const NORMAL_AGENTS: { role: AgentRole; name: string; title: string; accent: string; emoji: string }[] = [
  { role: "news",                 name: "Sage",   title: "News Intelligence",     accent: "#6366f1", emoji: "◎" },
  { role: "market_research",      name: "Vector", title: "Market Structure",      accent: "#0ea5e9", emoji: "△" },
  { role: "bull",                 name: "Atlas",  title: "Bull Case",             accent: "#10b981", emoji: "↑" },
  { role: "bear",                 name: "Mara",   title: "Risk Challenge",        accent: "#f43f5e", emoji: "↓" },
  { role: "investment_committee", name: "North",  title: "CIO Synthesis",         accent: "#f59e0b", emoji: "✦" },
];

const CRISIS_AGENTS: { role: AgentRole; name: string; title: string; accent: string; emoji: string }[] = [
  { role: "crisis_news",          name: "Sentinel", title: "Crisis News",         accent: "#f43f5e", emoji: "!" },
  { role: "crisis_market",        name: "Radar",    title: "Crisis Market",       accent: "#f97316", emoji: "⬡" },
  { role: "crisis_risk_analyst",  name: "Gauge",    title: "Crisis Risk",         accent: "#a855f7", emoji: "⚑" },
  { role: "crisis_options",       name: "Hedge",    title: "Options Playbook",    accent: "#06b6d4", emoji: "⊕" },
  { role: "crisis_committee",     name: "Apex",     title: "Crisis Committee",    accent: "#dc2626", emoji: "★" },
];

// Popular tickers for the explore table
const EXPLORE_SYMBOLS = ["NVDA", "AAPL", "MSFT", "TSLA", "AMZN", "META", "GOOG", "SPY", "BTC", "ETH"];

const STANCE_COLORS: Record<Stance, string> = {
  bullish: "#10b981",
  bearish: "#f43f5e",
  neutral:  "#94a3b8",
};

const DIR_COLORS: Record<Direction, string> = {
  BUY:  "#10b981",
  SELL: "#f43f5e",
  HOLD: "#f59e0b",
};

// ─── Sub-components ───────────────────────────────────────────────────────────

function AgentOrb({
  accent,
  emoji,
  state = "idle",
  size = 40,
}: {
  accent: string;
  emoji: string;
  state?: "idle" | "thinking" | "active" | "done";
  size?: number;
}) {
  const pulse = state === "thinking" || state === "active";
  return (
    <div
      style={{
        width: size,
        height: size,
        borderRadius: "50%",
        background: `radial-gradient(circle at 35% 35%, ${accent}33, ${accent}11)`,
        border: `1.5px solid ${accent}55`,
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        fontSize: size * 0.38,
        color: accent,
        flexShrink: 0,
        boxShadow: pulse ? `0 0 12px ${accent}66` : "none",
        animation: pulse ? "orbPulse 1.4s ease-in-out infinite" : "none",
        transition: "box-shadow 0.3s ease",
      }}
    >
      {emoji}
    </div>
  );
}

function Sparkline({ positive }: { positive: boolean }) {
  // Tiny synthetic sparkline
  const points = positive
    ? "0,12 5,10 10,11 15,8 20,9 25,6 30,7 35,4 40,3"
    : "0,3 5,4 10,5 15,6 20,8 25,7 30,9 35,11 40,12";
  return (
    <svg width="40" height="14" viewBox="0 0 40 14" fill="none">
      <polyline
        points={points}
        stroke={positive ? "#10b981" : "#f43f5e"}
        strokeWidth="1.5"
        strokeLinecap="round"
        strokeLinejoin="round"
        fill="none"
        opacity="0.8"
      />
    </svg>
  );
}

function TickerRow({
  symbol,
  selected,
  onClick,
}: {
  symbol: string;
  selected: boolean;
  onClick: () => void;
}) {
  // Deterministic fake price data from symbol char codes
  const seed = symbol.split("").reduce((a, c) => a + c.charCodeAt(0), 0);
  const price = ((seed % 400) + 50 + (seed % 73) * 0.37).toFixed(2);
  const pct = (((seed % 17) - 8) * 0.6).toFixed(2);
  const positive = parseFloat(pct) >= 0;
  const cap = `$${((seed % 900) + 50).toFixed(0)}B`;

  return (
    <div
      onClick={onClick}
      style={{
        display: "grid",
        gridTemplateColumns: "1fr 90px 70px 80px 52px",
        alignItems: "center",
        padding: "10px 16px",
        cursor: "pointer",
        borderRadius: 8,
        background: selected ? "rgba(99,102,241,0.08)" : "transparent",
        borderLeft: selected ? "2px solid #6366f1" : "2px solid transparent",
        transition: "all 0.15s ease",
        gap: 8,
      }}
      onMouseEnter={e => {
        if (!selected) (e.currentTarget as HTMLElement).style.background = "rgba(255,255,255,0.03)";
      }}
      onMouseLeave={e => {
        if (!selected) (e.currentTarget as HTMLElement).style.background = "transparent";
      }}
    >
      {/* Name */}
      <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
        <div style={{
          width: 28, height: 28, borderRadius: "50%",
          background: `hsl(${seed % 360}, 60%, 25%)`,
          border: `1px solid hsl(${seed % 360}, 60%, 40%)`,
          display: "flex", alignItems: "center", justifyContent: "center",
          fontSize: 10, fontWeight: 700, color: `hsl(${seed % 360}, 80%, 75%)`,
          flexShrink: 0,
        }}>
          {symbol.slice(0, 2)}
        </div>
        <div>
          <div style={{ fontSize: 13, fontWeight: 600, color: "#e2e8f0" }}>{symbol}</div>
          <div style={{ fontSize: 11, color: "#64748b" }}>{symbol.toLowerCase()}</div>
        </div>
      </div>
      {/* Price */}
      <div style={{ fontSize: 13, color: "#cbd5e1", textAlign: "right" }}>${price}</div>
      {/* Sparkline */}
      <div style={{ display: "flex", justifyContent: "center" }}>
        <Sparkline positive={positive} />
      </div>
      {/* Change */}
      <div style={{ fontSize: 13, fontWeight: 500, color: positive ? "#10b981" : "#f43f5e", textAlign: "right" }}>
        {positive ? "+" : ""}{pct}%
      </div>
      {/* Market cap */}
      <div style={{ fontSize: 11, color: "#475569", textAlign: "right" }}>{cap}</div>
    </div>
  );
}

function AgentRow({
  agent,
  message,
  state,
  onClick,
  active,
}: {
  agent: { role: AgentRole; name: string; title: string; accent: string; emoji: string };
  message?: AgentMessage;
  state: "idle" | "thinking" | "active" | "done";
  onClick: () => void;
  active: boolean;
}) {
  return (
    <div
      onClick={onClick}
      style={{
        display: "flex",
        alignItems: "center",
        padding: "12px 16px",
        gap: 12,
        cursor: "pointer",
        borderRadius: 8,
        background: active ? `${agent.accent}10` : "transparent",
        borderLeft: active ? `2px solid ${agent.accent}` : "2px solid transparent",
        transition: "all 0.15s ease",
      }}
    >
      <AgentOrb accent={agent.accent} emoji={agent.emoji} state={state} size={36} />
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
          <span style={{ fontSize: 13, fontWeight: 600, color: "#e2e8f0" }}>{agent.name}</span>
          <span style={{ fontSize: 11, color: "#475569" }}>{agent.title}</span>
        </div>
        {message ? (
          <div style={{ fontSize: 11, color: "#94a3b8", marginTop: 2, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
            {message.headline}
          </div>
        ) : (
          <div style={{ fontSize: 11, color: "#334155", marginTop: 2 }}>
            {state === "thinking" ? "Analyzing…" : "Standby"}
          </div>
        )}
      </div>
      {/* Stance badge */}
      {message && (
        <div style={{
          fontSize: 10, fontWeight: 700,
          color: STANCE_COLORS[message.stance],
          background: `${STANCE_COLORS[message.stance]}18`,
          padding: "2px 7px", borderRadius: 4,
          flexShrink: 0,
          textTransform: "uppercase",
          letterSpacing: "0.04em",
        }}>
          {message.stance}
        </div>
      )}
      <div style={{ color: "#334155", fontSize: 14, flexShrink: 0 }}>›</div>
    </div>
  );
}

// ─── Main page ────────────────────────────────────────────────────────────────

export default function Home() {
  const [symbol, setSymbol] = useState("NVDA");
  const [inputVal, setInputVal] = useState("NVDA");
  const [crisis, setCrisis] = useState(false);
  const [running, setRunning] = useState(false);
  const [status, setStatus] = useState("");
  const [messages, setMessages] = useState<Map<AgentRole, AgentMessage>>(new Map());
  const [thesis, setThesis] = useState<CIOThesis | null>(null);
  const [activeAgent, setActiveAgent] = useState<AgentRole | null>(null);
  const [selectedSymbol, setSelectedSymbol] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<"pipeline" | "thesis">("pipeline");
  const abortRef = useRef<AbortController | null>(null);

  const agents = crisis ? CRISIS_AGENTS : NORMAL_AGENTS;

  const runResearch = useCallback(async (sym: string) => {
    if (running) {
      abortRef.current?.abort();
      setRunning(false);
      return;
    }
    const s = sym.trim().toUpperCase();
    if (!s) return;
    setSymbol(s);
    setRunning(true);
    setMessages(new Map());
    setThesis(null);
    setStatus("Connecting…");
    setActiveAgent(null);

    const ctrl = new AbortController();
    abortRef.current = ctrl;

    try {
      const res = await fetch("/api/research", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ symbol: s, crisis }),
        signal: ctrl.signal,
      });

      const reader = res.body?.getReader();
      if (!reader) throw new Error("No response body");
      const dec = new TextDecoder();

      let buf = "";
      while (true) {
        const { value, done } = await reader.read();
        if (done) break;
        buf += dec.decode(value, { stream: true });
        const lines = buf.split("\n");
        buf = lines.pop() ?? "";
        for (const line of lines) {
          if (!line.trim()) continue;
          try {
            const ev: StreamEvent = JSON.parse(line);
            if (ev.type === "status") {
              setStatus(ev.step ?? "");
              // detect which agent is running from step text
              const step = (ev.step ?? "").toLowerCase();
              for (const a of agents) {
                if (step.includes(a.name.toLowerCase())) {
                  setActiveAgent(a.role);
                  break;
                }
              }
            } else if (ev.type === "agent_message" && ev.message) {
              setMessages(prev => new Map(prev).set(ev.message!.role, ev.message!));
            } else if (ev.type === "thesis" && ev.thesis) {
              setThesis(ev.thesis);
              setActiveTab("thesis");
            } else if (ev.type === "done") {
              setStatus("Complete");
              setActiveAgent(null);
            } else if (ev.type === "error") {
              setStatus(`Error: ${ev.detail}`);
            }
          } catch { /* skip malformed */ }
        }
      }
    } catch (e: unknown) {
      if ((e as Error)?.name !== "AbortError") {
        setStatus("Request failed");
      }
    } finally {
      setRunning(false);
      setActiveAgent(null);
    }
  }, [running, crisis, agents]);

  // Sync input → symbol display
  const handleSymbolPick = (sym: string) => {
    setSelectedSymbol(sym);
    setInputVal(sym);
    setSymbol(sym);
    runResearch(sym);
  };

  // Giant fading ticker input (the Coinbase moment)
  const displaySymbol = inputVal || "TICKER";
  const phantomLabel = "Research";

  return (
    <>
      {/* Global animation keyframes */}
      <style>{`
        @keyframes orbPulse {
          0%, 100% { opacity: 1; transform: scale(1); }
          50% { opacity: 0.7; transform: scale(0.95); }
        }
        @keyframes slideIn {
          from { opacity: 0; transform: translateY(6px); }
          to { opacity: 1; transform: translateY(0); }
        }
        @keyframes blink {
          0%, 100% { opacity: 1; } 50% { opacity: 0; }
        }
        * { box-sizing: border-box; margin: 0; padding: 0; }
        body { background: #0a0a0f; color: #e2e8f0; font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif; }
        ::-webkit-scrollbar { width: 4px; } ::-webkit-scrollbar-track { background: transparent; } ::-webkit-scrollbar-thumb { background: #1e293b; border-radius: 2px; }
        input:focus { outline: none; }
      `}</style>

      <div style={{ display: "flex", height: "100vh", overflow: "hidden", background: "#0a0a0f" }}>

        {/* ── LEFT SIDEBAR ── */}
        <aside style={{
          width: 200,
          flexShrink: 0,
          borderRight: "1px solid #0f172a",
          display: "flex",
          flexDirection: "column",
          padding: "16px 8px",
          gap: 2,
        }}>
          {/* Logo */}
          <div style={{
            display: "flex", alignItems: "center", gap: 8,
            padding: "4px 8px 16px",
          }}>
            <div style={{
              width: 28, height: 28, borderRadius: "50%",
              background: "linear-gradient(135deg, #6366f1, #06b6d4)",
              display: "flex", alignItems: "center", justifyContent: "center",
              fontSize: 13, fontWeight: 800, color: "#fff",
            }}>R</div>
            <span style={{ fontSize: 14, fontWeight: 700, color: "#e2e8f0" }}>RazorStack</span>
          </div>

          {/* Nav items */}
          {[
            { icon: "⌂", label: "Dashboard",  active: true },
            { icon: "◉", label: "Research",   active: false },
            { icon: "∿", label: "Quant",      active: false },
            { icon: "⊞", label: "Portfolio",  active: false },
            { icon: "≡", label: "Signals",    active: false },
          ].map(item => (
            <div key={item.label} style={{
              display: "flex", alignItems: "center", gap: 10,
              padding: "9px 10px", borderRadius: 8,
              background: item.active ? "rgba(99,102,241,0.12)" : "transparent",
              color: item.active ? "#a5b4fc" : "#475569",
              cursor: "pointer", fontSize: 13, fontWeight: item.active ? 600 : 400,
              transition: "all 0.15s",
            }}>
              <span style={{ fontSize: 15, width: 18, textAlign: "center" }}>{item.icon}</span>
              {item.label}
            </div>
          ))}

          <div style={{ flex: 1 }} />

          {/* Regime badge at bottom */}
          <div style={{
            margin: "8px", padding: "10px 12px",
            background: "#0f172a", borderRadius: 10,
            border: "1px solid #1e293b",
          }}>
            <div style={{ fontSize: 10, color: "#475569", marginBottom: 4, textTransform: "uppercase", letterSpacing: "0.06em" }}>Market Regime</div>
            <div style={{ fontSize: 13, fontWeight: 700, color: "#10b981" }}>BULL QUIET</div>
            <div style={{ fontSize: 10, color: "#475569", marginTop: 2 }}>SPY-based · live</div>
          </div>
        </aside>

        {/* ── MAIN PANEL ── */}
        <main style={{ flex: 1, display: "flex", flexDirection: "column", overflow: "hidden" }}>
          {/* Top bar */}
          <div style={{
            display: "flex", alignItems: "center", justifyContent: "space-between",
            padding: "12px 20px",
            borderBottom: "1px solid #0f172a",
          }}>
            <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
              <span style={{ fontSize: 18, fontWeight: 700, color: "#e2e8f0" }}>Intelligence Desk</span>
              {selectedSymbol && (
                <span style={{
                  fontSize: 12, color: "#6366f1", background: "#6366f130",
                  padding: "2px 8px", borderRadius: 4, fontWeight: 600,
                }}>{selectedSymbol} ★</span>
              )}
            </div>
            <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
              {/* Search */}
              <div style={{
                display: "flex", alignItems: "center", gap: 8,
                background: "#0f172a", border: "1px solid #1e293b",
                borderRadius: 8, padding: "7px 12px",
              }}>
                <span style={{ color: "#475569", fontSize: 13 }}>⌕</span>
                <input
                  value={inputVal}
                  onChange={e => setInputVal(e.target.value.toUpperCase())}
                  onKeyDown={e => e.key === "Enter" && runResearch(inputVal)}
                  placeholder="Search symbol…"
                  style={{
                    background: "transparent", border: "none", color: "#e2e8f0",
                    fontSize: 13, width: 140,
                  }}
                />
              </div>
              {/* Avatar */}
              <div style={{
                width: 30, height: 30, borderRadius: "50%",
                background: "linear-gradient(135deg, #6366f1, #06b6d4)",
                display: "flex", alignItems: "center", justifyContent: "center",
                fontSize: 12, fontWeight: 700, color: "#fff",
              }}>T</div>
            </div>
          </div>

          {/* Asset table */}
          <div style={{ flex: 1, overflow: "auto" }}>
            {/* Column headers */}
            <div style={{
              display: "grid",
              gridTemplateColumns: "1fr 90px 70px 80px 52px",
              padding: "8px 16px",
              gap: 8,
              borderBottom: "1px solid #0f172a",
            }}>
              {["Asset", "Price", "Chart", "1D %", "Mkt Cap"].map(h => (
                <div key={h} style={{ fontSize: 11, color: "#334155", textTransform: "uppercase", letterSpacing: "0.05em" }}>
                  {h}
                </div>
              ))}
            </div>

            {/* Rows */}
            <div style={{ padding: "4px 0" }}>
              {EXPLORE_SYMBOLS.map(sym => (
                <TickerRow
                  key={sym}
                  symbol={sym}
                  selected={selectedSymbol === sym}
                  onClick={() => handleSymbolPick(sym)}
                />
              ))}
            </div>
          </div>
        </main>

        {/* ── RIGHT PANEL (Coinbase action panel) ── */}
        <aside style={{
          width: 320,
          flexShrink: 0,
          borderLeft: "1px solid #0f172a",
          display: "flex",
          flexDirection: "column",
          overflow: "hidden",
        }}>

          {/* Mode toggle (Normal / Crisis) */}
          <div style={{
            display: "flex", gap: 6, padding: "14px 16px 0",
          }}>
            {["Normal", "Crisis"].map(mode => (
              <button
                key={mode}
                onClick={() => setCrisis(mode === "Crisis")}
                style={{
                  flex: 1, padding: "7px 0", borderRadius: 8,
                  background: (mode === "Crisis") === crisis
                    ? (crisis ? "#dc2626" : "#1e293b")
                    : "transparent",
                  border: `1px solid ${(mode === "Crisis") === crisis ? "transparent" : "#1e293b"}`,
                  color: (mode === "Crisis") === crisis ? "#fff" : "#475569",
                  fontSize: 13, fontWeight: 600, cursor: "pointer",
                  transition: "all 0.2s",
                }}
              >
                {mode === "Crisis" ? "⚑ Crisis" : "Normal"}
              </button>
            ))}
          </div>

          {/* ── The Coinbase giant-ticker moment ── */}
          <div style={{ padding: "20px 16px 0" }}>
            <div style={{
              display: "flex", alignItems: "baseline", gap: 0,
              lineHeight: 1, marginBottom: 6,
            }}>
              {/* Bold ticker */}
              <span style={{
                fontSize: 52, fontWeight: 900, letterSpacing: "-2px",
                color: "#e2e8f0", fontVariantNumeric: "tabular-nums",
                lineHeight: 1,
              }}>
                {displaySymbol}
              </span>
              {/* Faded label — exactly like Coinbase's "SGD" */}
              <span style={{
                fontSize: 52, fontWeight: 900, letterSpacing: "-2px",
                color: "#1e293b", lineHeight: 1,
              }}>
                {" "}{phantomLabel}
              </span>
            </div>

            {/* Conversion hint */}
            <div style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 16 }}>
              <span style={{ fontSize: 11, color: "#334155" }}>↕</span>
              <span style={{ fontSize: 12, color: "#475569", fontWeight: 500 }}>
                {thesis ? `${thesis.direction} · ${thesis.confidence}% confidence` : "5-agent research pipeline"}
              </span>
            </div>

            {/* Agent pipeline rows — mirroring "Pay with / Buy" rows */}
            <div style={{ display: "flex", flexDirection: "column", marginBottom: 12 }}>
              {agents.map((a, i) => {
                const msg = messages.get(a.role);
                const agentState = activeAgent === a.role ? "thinking"
                  : msg ? "done"
                  : running ? "idle"
                  : "idle";

                return (
                  <React.Fragment key={a.role}>
                    <div
                      onClick={() => { if (msg) { setActiveAgent(a.role); setActiveTab("pipeline"); } }}
                      style={{
                        display: "flex", alignItems: "center", padding: "11px 0",
                        gap: 10, cursor: msg ? "pointer" : "default",
                        borderBottom: i < agents.length - 1 ? "1px solid #0f172a" : "none",
                      }}
                    >
                      <AgentOrb accent={a.accent} emoji={a.emoji} state={agentState} size={32} />
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <div style={{ fontSize: 13, fontWeight: 600, color: "#cbd5e1" }}>{a.name}</div>
                        <div style={{ fontSize: 11, color: "#475569", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                          {msg ? msg.headline : a.title}
                        </div>
                      </div>
                      {msg && (
                        <div style={{
                          fontSize: 10, fontWeight: 700,
                          color: STANCE_COLORS[msg.stance],
                          flexShrink: 0,
                        }}>
                          {msg.stance === "bullish" ? "↑" : msg.stance === "bearish" ? "↓" : "—"}
                        </div>
                      )}
                      {!msg && running && activeAgent === a.role && (
                        <div style={{ width: 6, height: 6, borderRadius: "50%", background: a.accent, animation: "orbPulse 0.8s infinite" }} />
                      )}
                      {msg && <span style={{ color: "#334155", fontSize: 14 }}>›</span>}
                    </div>
                  </React.Fragment>
                );
              })}
            </div>
          </div>

          {/* ── Run Research button (the blue pill) ── */}
          <div style={{ padding: "0 16px 16px" }}>
            <button
              onClick={() => runResearch(inputVal)}
              disabled={!inputVal.trim()}
              style={{
                width: "100%", padding: "14px 0",
                borderRadius: 12,
                background: running
                  ? "#1e293b"
                  : crisis
                  ? "linear-gradient(135deg, #dc2626, #b91c1c)"
                  : "linear-gradient(135deg, #6366f1, #4f46e5)",
                border: "none",
                color: running ? "#475569" : "#fff",
                fontSize: 15, fontWeight: 700,
                cursor: inputVal.trim() ? "pointer" : "not-allowed",
                display: "flex", alignItems: "center", justifyContent: "center", gap: 8,
                transition: "all 0.2s",
                letterSpacing: "0.01em",
              }}
            >
              {running ? (
                <>
                  <span style={{ animation: "orbPulse 0.8s infinite" }}>●</span>
                  {status || "Running…"}
                  <span style={{ fontSize: 12, marginLeft: 4 }}>Stop</span>
                </>
              ) : (
                <>Run Research →</>
              )}
            </button>
          </div>

          {/* ── Thesis card (Earning assets section equivalent) ── */}
          {thesis && (
            <div style={{
              margin: "0 12px 12px",
              padding: 14,
              background: "#0f172a",
              borderRadius: 10,
              border: "1px solid #1e293b",
              animation: "slideIn 0.3s ease",
              overflow: "auto",
              flex: 1,
            }}>
              <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 10 }}>
                <div style={{ fontSize: 11, color: "#475569", textTransform: "uppercase", letterSpacing: "0.06em" }}>
                  CIO Verdict · {thesis.symbol}
                </div>
                <div style={{
                  fontSize: 12, fontWeight: 800,
                  color: DIR_COLORS[thesis.direction],
                  background: `${DIR_COLORS[thesis.direction]}18`,
                  padding: "3px 9px", borderRadius: 5,
                }}>
                  {thesis.direction}
                </div>
              </div>

              <div style={{ fontSize: 13, color: "#94a3b8", lineHeight: 1.5, marginBottom: 10 }}>
                {thesis.summary}
              </div>

              {thesis.recommendation && (
                <div style={{
                  fontSize: 12, color: "#475569",
                  padding: "8px 10px", background: "#0a0a0f",
                  borderRadius: 6, lineHeight: 1.5,
                }}>
                  {thesis.recommendation}
                </div>
              )}

              <div style={{ display: "flex", justifyContent: "space-between", marginTop: 10 }}>
                {thesis.catalysts.slice(0, 2).map((c, i) => (
                  <div key={i} style={{
                    fontSize: 10, color: "#10b981",
                    background: "#10b98118", padding: "3px 7px", borderRadius: 4,
                    maxWidth: "48%", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap",
                  }}>↑ {c}</div>
                ))}
              </div>
              <div style={{ display: "flex", justifyContent: "space-between", marginTop: 4 }}>
                {thesis.risks.slice(0, 2).map((r, i) => (
                  <div key={i} style={{
                    fontSize: 10, color: "#f43f5e",
                    background: "#f43f5e18", padding: "3px 7px", borderRadius: 4,
                    maxWidth: "48%", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap",
                  }}>↓ {r}</div>
                ))}
              </div>

              {/* Confidence bar */}
              <div style={{ marginTop: 12 }}>
                <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 4 }}>
                  <span style={{ fontSize: 10, color: "#334155" }}>Confidence</span>
                  <span style={{ fontSize: 10, color: DIR_COLORS[thesis.direction], fontWeight: 700 }}>
                    {thesis.confidence}%
                  </span>
                </div>
                <div style={{ height: 3, background: "#1e293b", borderRadius: 2 }}>
                  <div style={{
                    height: "100%", borderRadius: 2,
                    width: `${thesis.confidence}%`,
                    background: DIR_COLORS[thesis.direction],
                    transition: "width 0.8s ease",
                  }} />
                </div>
              </div>
            </div>
          )}

          {/* Placeholder when no thesis yet */}
          {!thesis && !running && (
            <div style={{
              margin: "0 12px 12px", padding: 14,
              background: "#0f172a", borderRadius: 10,
              border: "1px solid #0f172a",
              flex: 1,
            }}>
              <div style={{ fontSize: 11, color: "#1e293b", marginBottom: 8, textTransform: "uppercase", letterSpacing: "0.06em" }}>
                Active Thesis
              </div>
              {EXPLORE_SYMBOLS.slice(0, 3).map(sym => {
                const seed = sym.split("").reduce((a, c) => a + c.charCodeAt(0), 0);
                const apy = ((seed % 6) + 2.1).toFixed(2);
                return (
                  <div key={sym} style={{
                    display: "flex", alignItems: "center", justifyContent: "space-between",
                    padding: "9px 0", borderBottom: "1px solid #0f172a",
                  }}>
                    <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                      <div style={{
                        width: 24, height: 24, borderRadius: "50%",
                        background: `hsl(${seed % 360}, 60%, 15%)`,
                        border: `1px solid hsl(${seed % 360}, 60%, 30%)`,
                        display: "flex", alignItems: "center", justifyContent: "center",
                        fontSize: 9, fontWeight: 700, color: `hsl(${seed % 360}, 80%, 65%)`,
                      }}>{sym.slice(0, 2)}</div>
                      <div>
                        <div style={{ fontSize: 12, color: "#334155" }}>{sym}</div>
                      </div>
                    </div>
                    <span style={{ fontSize: 11, color: "#10b981", fontWeight: 600 }}>{apy}% yield</span>
                  </div>
                );
              })}
            </div>
          )}
        </aside>
      </div>
    </>
  );
}
