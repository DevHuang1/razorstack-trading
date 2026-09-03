"use client";

import React, { useState, useCallback, useRef, useMemo } from "react";

// ─── Design tokens (Coinbase Advanced dark navy) ──────────────────────────────
const G = "#00c07f";   // green
const R = "#f6465d";   // red
const B = "#3b82f6";   // blue accent
const NAVY = "#080e1a";
const PANEL = "#0d1526";
const BORDER = "#1a2540";
const TEXT = "#e6e9ef";
const MUTED = "#5e6673";
const AMBER = "#f59e0b";

// ─── Types ────────────────────────────────────────────────────────────────────
type AgentRole = "news" | "market_research" | "bull" | "bear" | "investment_committee"
  | "crisis_news" | "crisis_market" | "crisis_risk_analyst" | "crisis_options" | "crisis_committee";
type Stance = "bullish" | "bearish" | "neutral";
type Direction = "BUY" | "SELL" | "HOLD";
interface AgentMessage { role: AgentRole; stance: Stance; headline: string; body: string; confidence: number | null; }
interface CIOThesis { symbol: string; direction: Direction; confidence: number; summary: string; catalysts: string[]; risks: string[]; recommendation: string; }
interface StreamEvent { type: "status" | "agent_message" | "thesis" | "error" | "done"; step?: string; detail?: string; message?: AgentMessage; thesis?: CIOThesis; }
interface Candle { open: number; high: number; low: number; close: number; volume: number; }

// ─── Agent definitions ────────────────────────────────────────────────────────
const NORMAL_AGENTS = [
  { role: "news" as AgentRole,                 name: "Sage",     title: "News Intelligence",  accent: "#6366f1", emoji: "◎" },
  { role: "market_research" as AgentRole,      name: "Vector",   title: "Market Structure",   accent: "#0ea5e9", emoji: "△" },
  { role: "bull" as AgentRole,                 name: "Atlas",    title: "Bull Case",          accent: G,         emoji: "↑" },
  { role: "bear" as AgentRole,                 name: "Mara",     title: "Risk Challenge",     accent: R,         emoji: "↓" },
  { role: "investment_committee" as AgentRole, name: "North",    title: "CIO Synthesis",      accent: AMBER,     emoji: "✦" },
];
const CRISIS_AGENTS = [
  { role: "crisis_news" as AgentRole,          name: "Sentinel", title: "Crisis News",        accent: R,         emoji: "!" },
  { role: "crisis_market" as AgentRole,        name: "Radar",    title: "Crisis Market",      accent: "#f97316", emoji: "⬡" },
  { role: "crisis_risk_analyst" as AgentRole,  name: "Gauge",    title: "Crisis Risk",        accent: "#a855f7", emoji: "⚑" },
  { role: "crisis_options" as AgentRole,       name: "Hedge",    title: "Options Playbook",   accent: "#06b6d4", emoji: "⊕" },
  { role: "crisis_committee" as AgentRole,     name: "Apex",     title: "Crisis Committee",   accent: "#dc2626", emoji: "★" },
];

const TIMEFRAMES = ["1m", "5m", "15m", "1H", "4H", "1D", "1W"];
const CHART_TYPES = ["Candles", "Area", "Columns"];
const WATCHLIST = ["NVDA", "AAPL", "MSFT", "TSLA", "AMZN", "SPY", "BTC", "ETH"];

// ─── Synthetic OHLCV data ─────────────────────────────────────────────────────
function seededRng(seed: number) {
  let s = seed >>> 0;
  return () => { s = (s * 1664525 + 1013904223) >>> 0; return s / 4294967296; };
}

function generateCandles(symbol: string, tf: string, count = 55): Candle[] {
  let seed = symbol.split("").reduce((a, c) => a + c.charCodeAt(0), 0);
  seed += TIMEFRAMES.indexOf(tf) * 199 + 7;
  const rng = seededRng(seed);
  let price = 60 + (seed % 380);
  return Array.from({ length: count }, () => {
    const vol = 0.012 + rng() * 0.022;
    const open = price;
    const close = open * (1 + (rng() - 0.475) * vol * 2);
    const high = Math.max(open, close) * (1 + rng() * vol * 0.55);
    const low = Math.min(open, close) * (1 - rng() * vol * 0.55);
    price = close;
    return { open, high, low, close, volume: rng() * 700 + 90 };
  });
}

// ─── SVG Chart ────────────────────────────────────────────────────────────────
function Chart({ symbol, tf, chartType }: { symbol: string; tf: string; chartType: string }) {
  const candles = useMemo(() => generateCandles(symbol, tf), [symbol, tf]);
  const W = 760, H = 320, VOL_H = 52, PRPAD = 58, TOP = 6;
  const chartH = H - VOL_H - 8;
  const chartW = W - PRPAD;
  const prices = candles.flatMap(c => [c.high, c.low]);
  const pMin = Math.min(...prices) * 0.9985;
  const pMax = Math.max(...prices) * 1.0015;
  const pRange = pMax - pMin || 1;
  const maxVol = Math.max(...candles.map(c => c.volume));
  const cW = Math.max(7, Math.floor(chartW / candles.length) - 2);
  const gap = Math.floor(chartW / candles.length) - cW;
  const pY = (p: number) => TOP + chartH - ((p - pMin) / pRange) * chartH;
  const xC = (i: number) => i * (cW + gap) + cW / 2;
  const last = candles[candles.length - 1];
  const lastClose = last?.close ?? 0;
  const pctChange = candles.length > 1
    ? ((lastClose - candles[0].open) / candles[0].open * 100)
    : 0;
  const isUp = pctChange >= 0;

  // Area path
  const aLine = candles.map((c, i) => `${i === 0 ? "M" : "L"}${xC(i).toFixed(1)},${pY(c.close).toFixed(1)}`).join(" ");
  const aFill = aLine + ` L${xC(candles.length - 1).toFixed(1)},${(TOP + chartH).toFixed(1)} L${xC(0).toFixed(1)},${(TOP + chartH).toFixed(1)} Z`;

  // Price labels
  const prLabels = [0, 0.25, 0.5, 0.75, 1].map(t => ({
    p: pMin + pRange * t,
    y: pY(pMin + pRange * t),
  }));

  return (
    <div style={{ position: "relative", width: "100%", overflow: "hidden" }}>
      {/* Mini stats above chart */}
      <div style={{ display: "flex", alignItems: "baseline", gap: 12, padding: "4px 8px 2px", fontSize: 11, fontFamily: "monospace" }}>
        <span style={{ color: MUTED }}>O</span><span style={{ color: TEXT }}>{candles[0]?.open.toFixed(2)}</span>
        <span style={{ color: MUTED }}>H</span><span style={{ color: TEXT }}>{Math.max(...candles.map(c => c.high)).toFixed(2)}</span>
        <span style={{ color: MUTED }}>L</span><span style={{ color: TEXT }}>{Math.min(...candles.map(c => c.low)).toFixed(2)}</span>
        <span style={{ color: MUTED }}>C</span><span style={{ color: TEXT }}>{lastClose.toFixed(2)}</span>
        <span style={{ color: isUp ? G : R }}>
          {isUp ? "+" : ""}{pctChange.toFixed(2)}%
        </span>
      </div>
      <svg viewBox={`0 0 ${W} ${H}`} style={{ width: "100%", display: "block" }}>
        <defs>
          <linearGradient id="areaGrad" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor={B} stopOpacity={0.28} />
            <stop offset="100%" stopColor={B} stopOpacity={0.01} />
          </linearGradient>
          <linearGradient id="volGradG" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor={G} stopOpacity={0.55} />
            <stop offset="100%" stopColor={G} stopOpacity={0.1} />
          </linearGradient>
          <linearGradient id="volGradR" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor={R} stopOpacity={0.55} />
            <stop offset="100%" stopColor={R} stopOpacity={0.1} />
          </linearGradient>
        </defs>

        {/* Grid */}
        {prLabels.map((l, i) => (
          <line key={i} x1={0} y1={l.y} x2={W - PRPAD} y2={l.y}
            stroke={BORDER} strokeWidth={0.6} />
        ))}

        {/* Chart content */}
        {chartType === "Area" ? (
          <>
            <path d={aFill} fill="url(#areaGrad)" />
            <path d={aLine} fill="none" stroke={B} strokeWidth={1.5} />
          </>
        ) : chartType === "Columns" ? (
          candles.map((c, i) => {
            const up = c.close >= c.open;
            const colH = Math.max(1, Math.abs(pY(c.open) - pY(c.close)));
            return (
              <rect key={i} x={i * (cW + gap)} y={pY(Math.max(c.open, c.close))}
                width={cW} height={colH} fill={up ? G : R} opacity={0.85} />
            );
          })
        ) : (
          candles.map((c, i) => {
            const up = c.close >= c.open;
            const color = up ? G : R;
            const bTop = pY(Math.max(c.open, c.close));
            const bH = Math.max(1, pY(Math.min(c.open, c.close)) - bTop);
            const cx = xC(i);
            return (
              <g key={i}>
                <line x1={cx} y1={pY(c.high)} x2={cx} y2={pY(c.low)} stroke={color} strokeWidth={1} />
                <rect x={i * (cW + gap)} y={bTop} width={cW} height={bH} fill={color} />
              </g>
            );
          })
        )}

        {/* Current price line */}
        <line x1={0} y1={pY(lastClose)} x2={W - PRPAD} y2={pY(lastClose)}
          stroke={AMBER} strokeWidth={0.8} strokeDasharray="4,3" opacity={0.8} />
        <rect x={W - PRPAD + 1} y={pY(lastClose) - 9} width={PRPAD - 2} height={18}
          fill={AMBER} rx={2} />
        <text x={W - PRPAD / 2} y={pY(lastClose) + 4}
          fill="#000" fontSize={9.5} fontWeight={700} textAnchor="middle"
          fontFamily="monospace">
          {lastClose.toFixed(2)}
        </text>

        {/* Price axis */}
        {prLabels.map((l, i) => (
          <text key={i} x={W - PRPAD + 4} y={l.y + 3}
            fill={MUTED} fontSize={9} fontFamily="monospace">
            {l.p.toFixed(2)}
          </text>
        ))}

        {/* Volume bars */}
        {candles.map((c, i) => {
          const up = c.close >= c.open;
          const barH = (c.volume / maxVol) * (VOL_H - 6);
          return (
            <rect key={i} x={i * (cW + gap)}
              y={H - VOL_H + (VOL_H - 6 - barH)}
              width={cW} height={barH}
              fill={`url(#volGrad${up ? "G" : "R"})`} />
          );
        })}

        {/* Volume label */}
        <text x={4} y={H - VOL_H + 12} fill={MUTED} fontSize={8.5}>VOLUME</text>
      </svg>
    </div>
  );
}

// ─── Signal Feed (Order Book equivalent) ──────────────────────────────────────
function SignalFeed({
  messages,
  activeAgent,
  crisis,
}: {
  messages: Map<AgentRole, AgentMessage>;
  activeAgent: AgentRole | null;
  crisis: boolean;
}) {
  const agents = crisis ? CRISIS_AGENTS : NORMAL_AGENTS;
  const bears = agents.filter(a => messages.get(a.role)?.stance === "bearish");
  const bulls = agents.filter(a => messages.get(a.role)?.stance === "bullish");
  const pending = agents.filter(a => !messages.get(a.role));

  const Row = ({ a, side }: { a: typeof NORMAL_AGENTS[0]; side: "bull" | "bear" | "pending" }) => {
    const msg = messages.get(a.role);
    const isActive = activeAgent === a.role;
    const color = side === "bull" ? G : side === "bear" ? R : MUTED;
    const conf = msg?.confidence ?? null;
    return (
      <div style={{
        display: "grid", gridTemplateColumns: "1fr 42px 56px",
        padding: "3px 10px", gap: 4,
        background: isActive ? `${a.accent}18` : "transparent",
        transition: "background 0.2s",
      }}>
        <div style={{
          color, fontSize: 10.5, fontFamily: "monospace",
          overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap",
          opacity: msg ? 1 : 0.25,
        }}>
          {isActive ? (
            <span style={{ animation: "blink 0.6s infinite" }}>●</span>
          ) : null}{" "}
          {msg ? msg.headline.slice(0, 24) : a.name}
        </div>
        <div style={{ color, fontSize: 10.5, fontFamily: "monospace", textAlign: "right", opacity: msg ? 1 : 0.2 }}>
          {conf !== null ? conf : "—"}
        </div>
        <div style={{ color, fontSize: 10.5, fontFamily: "monospace", textAlign: "right", opacity: msg ? 1 : 0.2 }}>
          {msg ? msg.stance.slice(0, 4) : a.title.slice(0, 5)}
        </div>
      </div>
    );
  };

  return (
    <div style={{ display: "flex", flexDirection: "column", height: "100%", overflow: "hidden" }}>
      {/* Header row */}
      <div style={{
        display: "grid", gridTemplateColumns: "1fr 42px 56px",
        padding: "4px 10px", gap: 4, borderBottom: `1px solid ${BORDER}`,
      }}>
        {["Signal", "Conf", "Stance"].map(h => (
          <div key={h} style={{ fontSize: 9, color: MUTED, textTransform: "uppercase", letterSpacing: "0.06em", textAlign: h === "Signal" ? "left" : "right" }}>{h}</div>
        ))}
      </div>

      {/* Bear rows (asks) */}
      <div style={{ flex: 1, overflow: "auto" }}>
        {agents.filter(a => messages.get(a.role)?.stance !== "bullish").reverse().map(a => (
          <Row key={a.role} a={a} side={messages.get(a.role)?.stance === "bearish" ? "bear" : "pending"} />
        ))}

        {/* Spread */}
        <div style={{
          display: "flex", alignItems: "center", justifyContent: "space-between",
          padding: "5px 10px", background: BORDER, margin: "2px 0",
        }}>
          <span style={{ fontSize: 10, color: MUTED, fontFamily: "monospace" }}>SIGNAL SPREAD</span>
          <span style={{ fontSize: 10, color: MUTED, fontFamily: "monospace" }}>
            {Math.abs(bulls.length - bears.length)} agents
          </span>
        </div>

        {/* Bull rows (bids) */}
        {agents.filter(a => messages.get(a.role)?.stance === "bullish" || !messages.get(a.role)).map(a => (
          <Row key={a.role} a={a} side={messages.get(a.role)?.stance === "bullish" ? "bull" : "pending"} />
        ))}
      </div>
    </div>
  );
}

// ─── Main Terminal ────────────────────────────────────────────────────────────
export default function QuantTerminal() {
  const [symbol, setSymbol] = useState("NVDA");
  const [inputVal, setInputVal] = useState("NVDA");
  const [tf, setTf] = useState("4H");
  const [chartType, setChartType] = useState("Candles");
  const [showChartMenu, setShowChartMenu] = useState(false);
  const [crisis, setCrisis] = useState(false);
  const [running, setRunning] = useState(false);
  const [statusMsg, setStatusMsg] = useState("");
  const [messages, setMessages] = useState<Map<AgentRole, AgentMessage>>(new Map());
  const [thesis, setThesis] = useState<CIOThesis | null>(null);
  const [activeAgent, setActiveAgent] = useState<AgentRole | null>(null);
  const [feedTab, setFeedTab] = useState<"order_book" | "history">("order_book");
  const [chartTab, setChartTab] = useState<"price" | "depth">("price");
  const abortRef = useRef<AbortController | null>(null);

  const agents = crisis ? CRISIS_AGENTS : NORMAL_AGENTS;

  // Synthetic price stats from candle data
  const candles = useMemo(() => generateCandles(symbol, tf), [symbol, tf]);
  const lastClose = candles[candles.length - 1]?.close ?? 0;
  const firstOpen = candles[0]?.open ?? 0;
  const high24 = Math.max(...candles.map(c => c.high));
  const low24 = Math.min(...candles.map(c => c.low));
  const vol24 = candles.reduce((a, c) => a + c.volume, 0);
  const change24 = lastClose - firstOpen;
  const change24Pct = firstOpen ? change24 / firstOpen * 100 : 0;
  const isUp = change24Pct >= 0;

  const runResearch = useCallback(async (sym: string) => {
    if (running) { abortRef.current?.abort(); setRunning(false); return; }
    const s = sym.trim().toUpperCase();
    if (!s) return;
    setSymbol(s);
    setRunning(true);
    setMessages(new Map());
    setThesis(null);
    setStatusMsg("Connecting…");
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
      if (!reader) throw new Error("No body");
      const dec = new TextDecoder();
      let buf = "";
      while (true) {
        const { value, done } = await reader.read();
        if (done) break;
        buf += dec.decode(value, { stream: true });
        const lines = buf.split("\n"); buf = lines.pop() ?? "";
        for (const line of lines) {
          if (!line.trim()) continue;
          try {
            const ev: StreamEvent = JSON.parse(line);
            if (ev.type === "status") {
              setStatusMsg(ev.step ?? "");
              const step = (ev.step ?? "").toLowerCase();
              for (const a of agents) {
                if (step.includes(a.name.toLowerCase())) { setActiveAgent(a.role); break; }
              }
            } else if (ev.type === "agent_message" && ev.message) {
              setMessages(p => new Map(p).set(ev.message!.role, ev.message!));
            } else if (ev.type === "thesis" && ev.thesis) {
              setThesis(ev.thesis);
            } else if (ev.type === "done") {
              setStatusMsg(""); setActiveAgent(null);
            }
          } catch { /* skip */ }
        }
      }
    } catch (e: unknown) {
      if ((e as Error)?.name !== "AbortError") setStatusMsg("Request failed");
    } finally {
      setRunning(false); setActiveAgent(null);
    }
  }, [running, crisis, agents]);

  const dirColor = thesis ? (thesis.direction === "BUY" ? G : thesis.direction === "SELL" ? R : AMBER) : G;

  return (
    <>
      <style>{`
        * { box-sizing: border-box; margin: 0; padding: 0; }
        body { background: ${NAVY}; color: ${TEXT}; font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif; }
        ::-webkit-scrollbar { width: 3px; height: 3px; } ::-webkit-scrollbar-track { background: transparent; } ::-webkit-scrollbar-thumb { background: ${BORDER}; border-radius: 2px; }
        input:focus { outline: none; }
        @keyframes blink { 0%,100%{opacity:1}50%{opacity:0} }
        @keyframes slideUp { from{opacity:0;transform:translateY(4px)} to{opacity:1;transform:translateY(0)} }
        @keyframes pulse { 0%,100%{opacity:1}50%{opacity:0.5} }
        button { cursor: pointer; }
      `}</style>

      <div style={{ display: "flex", height: "100vh", overflow: "hidden", background: NAVY }}>

        {/* ── ICON SIDEBAR (48px) ── */}
        <nav style={{
          width: 48, flexShrink: 0,
          background: NAVY,
          borderRight: `1px solid ${BORDER}`,
          display: "flex", flexDirection: "column", alignItems: "center",
          padding: "12px 0", gap: 4,
        }}>
          {/* Logo */}
          <div style={{
            width: 28, height: 28, borderRadius: "50%",
            background: "linear-gradient(135deg, #6366f1, #06b6d4)",
            display: "flex", alignItems: "center", justifyContent: "center",
            fontSize: 12, fontWeight: 800, color: "#fff", marginBottom: 8,
          }}>R</div>

          {[
            { icon: "⌂", label: "Dashboard", href: "/" },
            { icon: "◎", label: "Research", href: "/research" },
            { icon: "∿", label: "Quant", href: "/quant", active: true },
            { icon: "⊞", label: "Signals", href: "#" },
            { icon: "◰", label: "Portfolio", href: "#" },
            { icon: "⊕", label: "API", href: "#" },
            { icon: "○", label: "History", href: "#" },
          ].map(item => (
            <a key={item.label} href={item.href} title={item.label} style={{
              width: 36, height: 36, borderRadius: 8,
              display: "flex", alignItems: "center", justifyContent: "center",
              background: item.active ? "rgba(59,130,246,0.15)" : "transparent",
              color: item.active ? B : MUTED,
              fontSize: 16, textDecoration: "none",
              position: "relative",
              transition: "all 0.15s",
            }}>
              {item.icon}
              {item.active && (
                <div style={{
                  position: "absolute", right: 3, top: "50%", transform: "translateY(-50%)",
                  width: 4, height: 4, borderRadius: "50%", background: B,
                }} />
              )}
            </a>
          ))}

          <div style={{ flex: 1 }} />

          {/* Advanced toggle (bottom) */}
          <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 4 }}>
            <span style={{ fontSize: 10, color: MUTED, textAlign: "center", lineHeight: 1.2 }}>
              ADV
            </span>
            <div
              onClick={() => setCrisis(p => !p)}
              style={{
                width: 28, height: 16, borderRadius: 8,
                background: crisis ? R : "#1a2540",
                position: "relative", cursor: "pointer", transition: "background 0.2s",
              }}
            >
              <div style={{
                position: "absolute", top: 2, left: crisis ? 14 : 2,
                width: 12, height: 12, borderRadius: "50%", background: "#fff",
                transition: "left 0.2s",
              }} />
            </div>
          </div>
        </nav>

        {/* ── RIGHT OF SIDEBAR ── */}
        <div style={{ flex: 1, display: "flex", flexDirection: "column", overflow: "hidden" }}>

          {/* ── TOP STATS BAR ── */}
          <div style={{
            display: "flex", alignItems: "center",
            borderBottom: `1px solid ${BORDER}`,
            height: 44, flexShrink: 0, padding: "0 12px", gap: 8,
          }}>
            {/* Symbol pair pill */}
            <div style={{
              display: "flex", alignItems: "center", gap: 6,
              background: "#1a2540", padding: "5px 10px", borderRadius: 6,
              cursor: "pointer", flexShrink: 0,
            }}>
              <div style={{
                width: 18, height: 18, borderRadius: "50%",
                background: `hsl(${symbol.charCodeAt(0) * 20 % 360}, 60%, 35%)`,
                display: "flex", alignItems: "center", justifyContent: "center",
                fontSize: 8, fontWeight: 800,
                color: `hsl(${symbol.charCodeAt(0) * 20 % 360}, 80%, 75%)`,
              }}>{symbol.slice(0, 2)}</div>
              <span style={{ fontSize: 13, fontWeight: 700 }}>{symbol}-USD</span>
              <span style={{ fontSize: 10, color: MUTED }}>▾</span>
            </div>

            {/* Stats strip */}
            {[
              { label: "LAST PRICE (24H)", value: lastClose.toFixed(2), color: isUp ? G : R },
              { label: "24H CHANGE", value: `${isUp ? "+" : ""}${change24Pct.toFixed(2)}%`, color: isUp ? G : R },
              { label: "24H VOLUME", value: `$${(vol24 * lastClose / 1e6).toFixed(1)}M`, color: TEXT },
              { label: "24H HIGH", value: high24.toFixed(2), color: TEXT },
              { label: "24H LOW", value: low24.toFixed(2), color: TEXT },
              { label: "REGIME", value: crisis ? "CRISIS" : "BULL QUIET", color: crisis ? R : G },
            ].map(s => (
              <div key={s.label} style={{ flexShrink: 0, marginLeft: 12 }}>
                <div style={{ fontSize: 9, color: MUTED, textTransform: "uppercase", letterSpacing: "0.05em" }}>{s.label}</div>
                <div style={{ fontSize: 12, fontWeight: 600, color: s.color, fontFamily: "monospace" }}>{s.value}</div>
              </div>
            ))}

            <div style={{ flex: 1 }} />

            {/* Transfer button */}
            <button style={{
              padding: "6px 14px", borderRadius: 6,
              background: "#1a2540", border: `1px solid ${BORDER}`,
              color: TEXT, fontSize: 12, fontWeight: 600,
            }}>Transfer</button>
          </div>

          {/* ── MAIN AREA ── */}
          <div style={{ flex: 1, display: "flex", overflow: "hidden" }}>

            {/* ── CHART PANEL ── */}
            <div style={{ flex: 1, display: "flex", flexDirection: "column", overflow: "hidden", minWidth: 0 }}>

              {/* Chart tabs + toolbar */}
              <div style={{
                display: "flex", alignItems: "center",
                borderBottom: `1px solid ${BORDER}`,
                height: 36, padding: "0 12px", gap: 12, flexShrink: 0,
              }}>
                {/* Price / Depth tabs */}
                {[
                  { id: "price", label: "Price chart" },
                  { id: "depth", label: "Depth chart" },
                ].map(t => (
                  <button key={t.id} onClick={() => setChartTab(t.id as "price" | "depth")} style={{
                    background: "transparent", border: "none", padding: "0 0 8px",
                    fontSize: 12, fontWeight: chartTab === t.id ? 600 : 400,
                    color: chartTab === t.id ? TEXT : MUTED,
                    borderBottom: chartTab === t.id ? `2px solid ${B}` : "2px solid transparent",
                    marginBottom: -1,
                  }}>{t.label}</button>
                ))}

                <div style={{ width: 1, height: 16, background: BORDER }} />

                {/* Timeframe */}
                {TIMEFRAMES.map(t => (
                  <button key={t} onClick={() => setTf(t)} style={{
                    background: tf === t ? "#1a2540" : "transparent",
                    border: "none",
                    color: tf === t ? TEXT : MUTED,
                    fontSize: 11, fontWeight: tf === t ? 600 : 400,
                    padding: "3px 6px", borderRadius: 4,
                  }}>{t}</button>
                ))}

                <div style={{ width: 1, height: 16, background: BORDER }} />

                {/* Chart type dropdown */}
                <div style={{ position: "relative" }}>
                  <button
                    onClick={() => setShowChartMenu(p => !p)}
                    style={{
                      background: "transparent", border: "none",
                      color: MUTED, fontSize: 11, padding: "3px 6px",
                      display: "flex", alignItems: "center", gap: 4,
                    }}
                  >
                    <span>⊞</span> {chartType} <span>▾</span>
                  </button>
                  {showChartMenu && (
                    <div style={{
                      position: "absolute", top: "100%", left: 0, zIndex: 100,
                      background: PANEL, border: `1px solid ${BORDER}`,
                      borderRadius: 8, padding: "6px 0", minWidth: 160,
                      boxShadow: "0 8px 24px #00000060",
                      animation: "slideUp 0.15s ease",
                    }}>
                      {CHART_TYPES.map(ct => (
                        <button key={ct} onClick={() => { setChartType(ct); setShowChartMenu(false); }}
                          style={{
                            display: "block", width: "100%", textAlign: "left",
                            padding: "7px 16px", background: ct === chartType ? "#1a2540" : "transparent",
                            border: "none", color: ct === chartType ? TEXT : MUTED,
                            fontSize: 12, cursor: "pointer",
                          }}>{ct}</button>
                      ))}
                    </div>
                  )}
                </div>

                <div style={{ flex: 1 }} />

                {/* Indicators */}
                <button style={{
                  background: "transparent", border: "none",
                  color: MUTED, fontSize: 11, padding: "3px 8px",
                  display: "flex", alignItems: "center", gap: 4,
                }}>∿ Indicators</button>
              </div>

              {/* Chart area */}
              <div style={{ flex: 1, overflow: "hidden", background: PANEL }}>
                <Chart symbol={symbol} tf={tf} chartType={chartType} />
              </div>

              {/* ── BOTTOM ORDERS TABLE ── */}
              <div style={{
                borderTop: `1px solid ${BORDER}`, flexShrink: 0, maxHeight: 180,
                overflow: "auto",
              }}>
                <div style={{
                  display: "flex", alignItems: "center",
                  padding: "6px 12px", gap: 12, borderBottom: `1px solid ${BORDER}`,
                  position: "sticky", top: 0, background: NAVY,
                }}>
                  <span style={{ fontSize: 12, fontWeight: 600 }}>Agent Results</span>
                  {running && (
                    <span style={{ fontSize: 11, color: AMBER, animation: "pulse 1s infinite" }}>
                      ● {statusMsg}
                    </span>
                  )}
                  <div style={{ flex: 1 }} />
                  <span style={{ fontSize: 11, color: MUTED }}>{messages.size} / {agents.length} complete</span>
                </div>

                {messages.size === 0 ? (
                  <div style={{
                    display: "flex", alignItems: "center", justifyContent: "center",
                    padding: "24px 0", flexDirection: "column", gap: 8,
                  }}>
                    <div style={{ fontSize: 24 }}>≡</div>
                    <div style={{ fontSize: 12, color: MUTED }}>No results yet — run research to populate</div>
                  </div>
                ) : (
                  <>
                    {/* Table header */}
                    <div style={{
                      display: "grid",
                      gridTemplateColumns: "100px 80px 80px 80px 1fr 80px 80px",
                      padding: "4px 12px", borderBottom: `1px solid ${BORDER}`,
                      gap: 8,
                    }}>
                      {["AGENT", "ROLE", "STANCE", "CONF", "HEADLINE", "DIRECTION", "STATUS"].map(h => (
                        <div key={h} style={{ fontSize: 9, color: MUTED, textTransform: "uppercase", letterSpacing: "0.05em" }}>{h}</div>
                      ))}
                    </div>
                    {Array.from(messages.values()).map(msg => {
                      const agentDef = agents.find(a => a.role === msg.role);
                      const color = msg.stance === "bullish" ? G : msg.stance === "bearish" ? R : MUTED;
                      return (
                        <div key={msg.role} style={{
                          display: "grid",
                          gridTemplateColumns: "100px 80px 80px 80px 1fr 80px 80px",
                          padding: "6px 12px", borderBottom: `1px solid ${BORDER}10`,
                          gap: 8, alignItems: "center",
                          animation: "slideUp 0.2s ease",
                        }}>
                          <div style={{ fontSize: 12, fontWeight: 600 }}>
                            {agentDef?.emoji} {agentDef?.name ?? msg.role}
                          </div>
                          <div style={{ fontSize: 11, color: MUTED }}>{agentDef?.title ?? msg.role}</div>
                          <div style={{ fontSize: 11, color, fontWeight: 600, textTransform: "uppercase" }}>{msg.stance.slice(0, 4)}</div>
                          <div style={{ fontSize: 11, fontFamily: "monospace", color }}>
                            {msg.confidence ?? "—"}
                          </div>
                          <div style={{
                            fontSize: 11, color: "#94a3b8",
                            overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap",
                          }}>{msg.headline}</div>
                          <div style={{
                            fontSize: 10, fontWeight: 700, color,
                            background: `${color}18`, padding: "2px 6px", borderRadius: 4,
                            textAlign: "center",
                          }}>
                            {msg.stance === "bullish" ? "LONG" : msg.stance === "bearish" ? "SHORT" : "FLAT"}
                          </div>
                          <div style={{ fontSize: 11, color: G }}>Filled</div>
                        </div>
                      );
                    })}
                  </>
                )}
              </div>
            </div>

            {/* ── SIGNAL FEED (Order book) ── */}
            <div style={{
              width: 240, flexShrink: 0,
              borderLeft: `1px solid ${BORDER}`,
              display: "flex", flexDirection: "column",
              overflow: "hidden",
            }}>
              {/* Tabs */}
              <div style={{
                display: "flex", borderBottom: `1px solid ${BORDER}`,
                height: 36, flexShrink: 0,
              }}>
                {[
                  { id: "order_book", label: "Signal feed" },
                  { id: "history", label: "Thesis" },
                ].map(t => (
                  <button key={t.id} onClick={() => setFeedTab(t.id as "order_book" | "history")} style={{
                    flex: 1, background: "transparent", border: "none",
                    borderBottom: feedTab === t.id ? `2px solid ${B}` : "2px solid transparent",
                    color: feedTab === t.id ? TEXT : MUTED,
                    fontSize: 11, fontWeight: feedTab === t.id ? 600 : 400,
                    padding: "0 0 1px",
                  }}>{t.label}</button>
                ))}
              </div>

              {feedTab === "order_book" ? (
                <SignalFeed messages={messages} activeAgent={activeAgent} crisis={crisis} />
              ) : (
                <div style={{ flex: 1, overflow: "auto", padding: 12 }}>
                  {thesis ? (
                    <div style={{ animation: "slideUp 0.3s ease" }}>
                      <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 10 }}>
                        <div style={{ fontSize: 11, color: MUTED }}>CIO Verdict · {thesis.symbol}</div>
                        <div style={{
                          fontSize: 12, fontWeight: 800, color: dirColor,
                          background: `${dirColor}18`, padding: "2px 8px", borderRadius: 4,
                        }}>{thesis.direction}</div>
                      </div>
                      <div style={{ fontSize: 12, color: "#94a3b8", lineHeight: 1.6, marginBottom: 10 }}>
                        {thesis.summary}
                      </div>
                      <div style={{ fontSize: 11, color: MUTED, marginBottom: 4 }}>Catalysts</div>
                      {thesis.catalysts.slice(0, 2).map((c, i) => (
                        <div key={i} style={{ fontSize: 11, color: G, marginBottom: 3 }}>↑ {c}</div>
                      ))}
                      <div style={{ fontSize: 11, color: MUTED, margin: "8px 0 4px" }}>Risks</div>
                      {thesis.risks.slice(0, 2).map((r, i) => (
                        <div key={i} style={{ fontSize: 11, color: R, marginBottom: 3 }}>↓ {r}</div>
                      ))}
                      <div style={{ marginTop: 12 }}>
                        <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 4 }}>
                          <span style={{ fontSize: 10, color: MUTED }}>Confidence</span>
                          <span style={{ fontSize: 10, fontWeight: 700, color: dirColor }}>{thesis.confidence}%</span>
                        </div>
                        <div style={{ height: 3, background: BORDER, borderRadius: 2 }}>
                          <div style={{
                            height: "100%", borderRadius: 2, background: dirColor,
                            width: `${thesis.confidence}%`, transition: "width 0.8s ease",
                          }} />
                        </div>
                      </div>
                    </div>
                  ) : (
                    <div style={{ color: MUTED, fontSize: 12, textAlign: "center", marginTop: 40 }}>
                      Run research to see CIO thesis
                    </div>
                  )}
                </div>
              )}
            </div>

            {/* ── RIGHT PANEL (Order form) ── */}
            <div style={{
              width: 240, flexShrink: 0,
              borderLeft: `1px solid ${BORDER}`,
              display: "flex", flexDirection: "column",
              overflow: "hidden",
            }}>
              {/* Available agents */}
              <div style={{ padding: "12px 14px", borderBottom: `1px solid ${BORDER}` }}>
                <div style={{ fontSize: 10, color: MUTED, textTransform: "uppercase", letterSpacing: "0.06em", marginBottom: 6 }}>
                  Available to analyze
                </div>
                <div style={{ display: "flex", justifyContent: "space-between" }}>
                  <span style={{ fontSize: 11, color: MUTED }}>Agents</span>
                  <span style={{ fontSize: 11, fontFamily: "monospace" }}>{agents.length}</span>
                </div>
                <div style={{ display: "flex", justifyContent: "space-between", marginTop: 3 }}>
                  <span style={{ fontSize: 11, color: MUTED }}>Mode</span>
                  <span style={{ fontSize: 11, fontFamily: "monospace", color: crisis ? R : G }}>
                    {crisis ? "CRISIS" : "NORMAL"}
                  </span>
                </div>
              </div>

              {/* Normal / Crisis tabs */}
              <div style={{ display: "flex", borderBottom: `1px solid ${BORDER}`, flexShrink: 0 }}>
                {["Normal", "Crisis"].map(m => (
                  <button key={m} onClick={() => setCrisis(m === "Crisis")} style={{
                    flex: 1, height: 36, background: "transparent", border: "none",
                    borderBottom: (m === "Crisis") === crisis
                      ? `2px solid ${crisis ? R : G}` : "2px solid transparent",
                    color: (m === "Crisis") === crisis ? (crisis ? R : G) : MUTED,
                    fontSize: 12, fontWeight: 600,
                  }}>{m === "Crisis" ? "⚑ Crisis" : "Normal"}</button>
                ))}
              </div>

              {/* Order type tabs (LIMIT / MARKET / STOP) */}
              <div style={{
                display: "flex", gap: 4, padding: "8px 10px",
                borderBottom: `1px solid ${BORDER}`, flexShrink: 0,
              }}>
                {["Research", "Quick", "Deep"].map((m, i) => (
                  <button key={m} style={{
                    flex: 1, padding: "5px 0", borderRadius: 5,
                    background: i === 0 ? "#1a2540" : "transparent",
                    border: `1px solid ${i === 0 ? B : BORDER}`,
                    color: i === 0 ? B : MUTED,
                    fontSize: 10, fontWeight: 600,
                  }}>{m}</button>
                ))}
              </div>

              {/* Symbol input (LIMIT PRICE equivalent) */}
              <div style={{ padding: "10px 14px", borderBottom: `1px solid ${BORDER}`, flexShrink: 0 }}>
                <div style={{ fontSize: 10, color: MUTED, textTransform: "uppercase", letterSpacing: "0.06em", marginBottom: 5 }}>
                  Symbol
                </div>
                <div style={{
                  display: "flex", alignItems: "center", justifyContent: "space-between",
                  background: "#0a0f1a", border: `1px solid ${BORDER}`, borderRadius: 6, padding: "6px 10px",
                }}>
                  <input
                    value={inputVal}
                    onChange={e => setInputVal(e.target.value.toUpperCase())}
                    onKeyDown={e => e.key === "Enter" && runResearch(inputVal)}
                    style={{
                      background: "transparent", border: "none", color: TEXT,
                      fontSize: 16, fontWeight: 700, width: "100%", fontFamily: "monospace",
                    }}
                    placeholder="NVDA"
                  />
                  <span style={{ fontSize: 11, color: MUTED }}>USD</span>
                </div>
              </div>

              {/* Quick picks (25% / 50% / MAX equivalent) */}
              <div style={{
                display: "flex", gap: 4, padding: "8px 10px",
                borderBottom: `1px solid ${BORDER}`, flexShrink: 0,
              }}>
                {WATCHLIST.slice(0, 4).map(sym => (
                  <button key={sym} onClick={() => { setInputVal(sym); setSymbol(sym); }}
                    style={{
                      flex: 1, padding: "4px 0", borderRadius: 4,
                      background: symbol === sym ? "#1a2540" : "transparent",
                      border: `1px solid ${symbol === sym ? B : BORDER}`,
                      color: symbol === sym ? B : MUTED,
                      fontSize: 9, fontWeight: 600,
                    }}>{sym}</button>
                ))}
              </div>

              {/* MID / BID / % buttons */}
              <div style={{
                display: "flex", gap: 4, padding: "6px 10px",
                borderBottom: `1px solid ${BORDER}`, flexShrink: 0,
              }}>
                {WATCHLIST.slice(4).map(sym => (
                  <button key={sym} onClick={() => { setInputVal(sym); setSymbol(sym); }}
                    style={{
                      flex: 1, padding: "4px 0", borderRadius: 4,
                      background: symbol === sym ? "#1a2540" : "transparent",
                      border: `1px solid ${symbol === sym ? B : BORDER}`,
                      color: symbol === sym ? B : MUTED,
                      fontSize: 9, fontWeight: 600,
                    }}>{sym}</button>
                ))}
              </div>

              {/* Execution / Time in Force rows */}
              <div style={{ padding: "8px 14px", borderBottom: `1px solid ${BORDER}`, flexShrink: 0 }}>
                {[
                  { label: "Execution", value: crisis ? "CRISIS MODE ▾" : "NORMAL MODE ▾" },
                  { label: "Time in force", value: "ALL AGENTS ▾" },
                ].map(row => (
                  <div key={row.label} style={{ display: "flex", justifyContent: "space-between", padding: "4px 0" }}>
                    <span style={{ fontSize: 11, color: MUTED }}>{row.label}</span>
                    <span style={{ fontSize: 11 }}>{row.value}</span>
                  </div>
                ))}
              </div>

              {/* Subtotal */}
              <div style={{ padding: "8px 14px", borderBottom: `1px solid ${BORDER}`, flexShrink: 0 }}>
                {[
                  { label: "Agents running", value: running ? statusMsg || "…" : `${agents.length}` },
                  { label: "Est. time", value: crisis ? "~60s" : "~30s" },
                  { label: "Results", value: `${messages.size} / ${agents.length}` },
                ].map(row => (
                  <div key={row.label} style={{ display: "flex", justifyContent: "space-between", padding: "3px 0" }}>
                    <span style={{ fontSize: 11, color: MUTED }}>{row.label}</span>
                    <span style={{ fontSize: 11, color: TEXT }}>{row.value}</span>
                  </div>
                ))}
              </div>

              {/* THE CTA BUTTON */}
              <div style={{ padding: "12px 10px" }}>
                <button
                  onClick={() => runResearch(inputVal)}
                  disabled={!inputVal.trim()}
                  style={{
                    width: "100%", padding: "14px 0", borderRadius: 8,
                    background: running ? BORDER
                      : crisis ? `linear-gradient(135deg, ${R}, #b91c1c)`
                      : `linear-gradient(135deg, ${G}, #00966a)`,
                    border: "none",
                    color: running ? MUTED : "#000",
                    fontSize: 14, fontWeight: 800,
                    letterSpacing: "0.01em",
                    transition: "all 0.2s",
                    display: "flex", alignItems: "center", justifyContent: "center", gap: 6,
                  }}
                >
                  {running ? (
                    <>
                      <span style={{ animation: "pulse 0.8s infinite" }}>●</span>
                      Stop research
                    </>
                  ) : (
                    `${crisis ? "⚑ Crisis" : "Run"} Research →`
                  )}
                </button>
                <div style={{ fontSize: 9, color: MUTED, textAlign: "center", marginTop: 6 }}>
                  AI research pipelines are non-deterministic.{" "}
                  <span style={{ color: B, cursor: "pointer" }}>Learn more</span>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </>
  );
}
