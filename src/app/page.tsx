"use client";
import React, { useState, useMemo } from "react";

const BG  = "#0e1117";
const PNL = "#161b27";
const PN2 = "#1a2235";
const BRD = "#252e3f";
const TXT = "#d1d4dc";
const DIM = "#787b86";
const G   = "#26a69a";
const R   = "#ef5350";
const BLU = "#2962ff";
const ORG = "#f7931a";

function mkRng(seed: number) {
  let s = seed >>> 0;
  return () => { s = (s * 1664525 + 1013904223) >>> 0; return s / 4294967296; };
}

const COINS = [
  { sym:"BTC",  name:"Bitcoin",  price:72231.87, chg:-0.02, mcap:"$1.4T",  apy:"",     icon:"₿",  color:ORG,   starred:true },
  { sym:"ETH",  name:"Ethereum", price:2644.06,  chg:+0.42, mcap:"$318.4B",apy:"2.12", icon:"Ξ",  color:"#627eea" },
  { sym:"USDT", name:"Tether",   price:1.00,     chg:+0.00, mcap:"$120.5B",apy:"",     icon:"₮",  color:"#26a17b" },
  { sym:"BNB",  name:"BNB",      price:590.48,   chg:-1.95, mcap:"$86.2B", apy:"",     icon:"B",  color:"#f3ba2f" },
  { sym:"SOL",  name:"Solana",   price:175.03,   chg:-3.03, mcap:"$82.3B", apy:"5.51", icon:"◎",  color:"#9945ff" },
  { sym:"USDC", name:"USDC",     price:1.00,     chg:+0.00, mcap:"$35.0B", apy:"4.70", icon:"$",  color:"#2775ca" },
  { sym:"XRP",  name:"XRP",      price:0.52,     chg:-0.79, mcap:"$29.6B", apy:"",     icon:"✕",  color:"#346aa9" },
  { sym:"DOGE", name:"Dogecoin", price:0.17,     chg:-2.74, mcap:"$25.0B", apy:"",     icon:"Ð",  color:"#c2a633" },
];

function genSparkline(sym: string, chg: number, n = 40): {x:number;y:number}[] {
  const seed = sym.split("").reduce((a,c)=>a+c.charCodeAt(0),0);
  const r = mkRng(seed);
  let p = 0;
  const pts: number[] = [];
  for (let i=0;i<n;i++) { p += (r()-0.47+chg*0.01)*2; pts.push(p); }
  const mn = Math.min(...pts), mx = Math.max(...pts);
  return pts.map((v,i) => ({ x:(i/(n-1))*100, y:100-((v-mn)/(mx-mn||1))*90-5 }));
}

function Sparkline({ sym, chg }: { sym:string; chg:number }) {
  const pts = useMemo(() => genSparkline(sym, chg), [sym, chg]);
  const col = chg >= 0 ? G : R;
  const d = pts.map((p,i)=>`${i===0?"M":"L"}${p.x},${p.y}`).join(" ");
  return (
    <svg viewBox="0 0 100 100" style={{ width:80, height:32, display:"block" }} preserveAspectRatio="none">
      <path d={d} fill="none" stroke={col} strokeWidth={2.5}/>
    </svg>
  );
}

function AreaChart({ sym, col }: { sym:string; col:string }) {
  const pts = useMemo(() => {
    const seed = sym.split("").reduce((a,c)=>a+c.charCodeAt(0),0)+99;
    const r = mkRng(seed);
    let p = 0;
    const arr: {x:number;y:number}[] = [];
    for (let i=0;i<60;i++) { p+=(r()-0.47)*3; arr.push({ x:(i/59)*100, y:p }); }
    const mn = Math.min(...arr.map(a=>a.y)), mx = Math.max(...arr.map(a=>a.y));
    return arr.map(a => ({ x:a.x, y:100-((a.y-mn)/(mx-mn||1))*80-10 }));
  }, [sym]);
  const line = pts.map((p,i)=>`${i===0?"M":"L"}${p.x.toFixed(2)},${p.y.toFixed(2)}`).join(" ");
  const fill = `${line} L${pts[pts.length-1].x.toFixed(2)},100 L0,100 Z`;
  return (
    <svg viewBox="0 0 100 100" style={{ width:"100%", height:"100%", display:"block" }} preserveAspectRatio="none">
      <defs>
        <linearGradient id={`ag${sym}`} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor={col} stopOpacity={0.35}/>
          <stop offset="100%" stopColor={col} stopOpacity={0.02}/>
        </linearGradient>
      </defs>
      <path d={fill} fill={`url(#ag${sym})`}/>
      <path d={line} fill="none" stroke={col} strokeWidth={1.5}/>
    </svg>
  );
}

function TimeLabels() {
  return (
    <div style={{ display:"flex", justifyContent:"space-between", padding:"4px 0 0", fontSize:10, color:DIM, fontFamily:"monospace" }}>
      {["1:20 PM","5:35 PM","9:50 PM","2:10 AM","6:25 AM","10:40 AM"].map(t => <span key={t}>{t}</span>)}
    </div>
  );
}

type Screen = "trade" | "asset";

export default function Dashboard() {
  const [screen, setScreen] = useState<Screen>("trade");
  const [activeCoin, setActiveCoin] = useState(COINS[0]);
  const [tf, setTf] = useState("1D");
  const [tradeTab, setTradeTab] = useState<"buy"|"sell"|"convert">("convert");
  const [starred, setStarred] = useState<Set<string>>(new Set(["BTC"]));
  const [search, setSearch] = useState("");
  const [assetTf, setAssetTf] = useState("1D");
  const [assetTab, setAssetTab] = useState("overview");

  const filtered = COINS.filter(c =>
    !search || c.name.toLowerCase().includes(search.toLowerCase()) || c.sym.toLowerCase().includes(search.toLowerCase())
  );

  const openAsset = (coin: typeof COINS[0]) => { setActiveCoin(coin); setScreen("asset"); };

  const NavItem = ({ label, icon, target }: { label:string; icon:string; target:Screen|null }) => (
    <div onClick={() => target && setScreen(target)} style={{
      display:"flex", alignItems:"center", gap:10, padding:"10px 14px",
      borderRadius:8, cursor: target?"pointer":"default",
      background: screen===target ? "#1a2235" : "transparent",
      color: screen===target ? TXT : DIM, fontSize:14,
      transition:"all 0.15s",
    }}>
      <span style={{ fontSize:16, minWidth:18 }}>{icon}</span>
      {label}
    </div>
  );

  return (
    <>
      <style>{`
        *{box-sizing:border-box;margin:0;padding:0}
        html,body{height:100%;background:${BG};color:${TXT};font-family:-apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif}
        ::-webkit-scrollbar{width:4px} ::-webkit-scrollbar-track{background:transparent} ::-webkit-scrollbar-thumb{background:${BRD};border-radius:2px}
        input:focus{outline:none} button{cursor:pointer;font-family:inherit}
        .row:hover{background:${PN2}!important}
        .nav-item:hover{background:${PN2}!important;color:${TXT}!important}
        @keyframes slideUp{from{opacity:0;transform:translateY(4px)}to{opacity:1;transform:translateY(0)}}
      `}</style>

      <div style={{ display:"flex", height:"100vh", overflow:"hidden", background:BG }}>

        {/* ── Left nav ─────────────────────────────────────────────────────── */}
        <nav style={{ width:200, background:PNL, borderRight:`1px solid ${BRD}`, display:"flex", flexDirection:"column", padding:"16px 8px 12px", flexShrink:0 }}>
          {/* Logo */}
          <div style={{ display:"flex", alignItems:"center", gap:10, padding:"0 10px 18px" }}>
            <div style={{ width:32, height:32, borderRadius:"50%", background:`linear-gradient(135deg,#6366f1,#06b6d4)`, display:"flex", alignItems:"center", justifyContent:"center", fontSize:14, fontWeight:800, color:"#fff" }}>R</div>
          </div>
          {/* Nav links */}
          {[
            { label:"Home", icon:"⌂", target:null },
            { label:"My assets", icon:"◎", target:null },
            { label:"Trade", icon:"↗", target:"trade" as Screen },
            { label:"Perpetuals", icon:"⟳", target:null },
            { label:"Earn", icon:"%", target:null },
            { label:"More", icon:"⋯", target:null },
          ].map(it => (
            <NavItem key={it.label} label={it.label} icon={it.icon} target={it.target}/>
          ))}
          <div style={{ flex:1 }}/>
          <div style={{ display:"flex", alignItems:"center", gap:8, padding:"8px 14px" }}>
            <span style={{ fontSize:12, color:DIM }}>Advanced</span>
            <a href="/quant" style={{ display:"flex", alignItems:"center", textDecoration:"none" }}>
              <div style={{ width:28, height:16, borderRadius:8, background:BLU, position:"relative" }}>
                <div style={{ position:"absolute", top:2, left:14, width:12, height:12, borderRadius:"50%", background:"#fff" }}/>
              </div>
            </a>
          </div>
        </nav>

        {/* ── Main content ─────────────────────────────────────────────────── */}
        <div style={{ flex:1, display:"flex", flexDirection:"column", overflow:"hidden" }}>

          {/* Top bar */}
          <div style={{ display:"flex", alignItems:"center", justifyContent:"space-between", padding:"10px 20px", borderBottom:`1px solid ${BRD}`, flexShrink:0, background:PNL }}>
            <div style={{ display:"flex", alignItems:"center", gap:6 }}>
              {screen==="asset" && (
                <button onClick={() => setScreen("trade")} style={{ background:"transparent", border:"none", color:DIM, fontSize:18, marginRight:4 }}>←</button>
              )}
              <span style={{ fontSize:18, fontWeight:700 }}>{screen==="asset" ? "Assets" : "Trade"}</span>
            </div>
            <div style={{ display:"flex", alignItems:"center", gap:8 }}>
              {screen==="asset" && (
                <div style={{ display:"flex", alignItems:"center", gap:6, background:PN2, border:`1px solid ${BRD}`, borderRadius:20, padding:"5px 12px" }}>
                  <span style={{ color:DIM, fontSize:12 }}>🔍</span>
                  <input placeholder="Search for an asset" value={search} onChange={e => setSearch(e.target.value)}
                    style={{ background:"transparent", border:"none", color:TXT, fontSize:13, width:180 }}/>
                </div>
              )}
              {["Buy & Sell","Send & Receive"].map(b => (
                <button key={b} style={{
                  padding:"7px 14px", borderRadius:20,
                  background: b==="Buy & Sell" ? BLU : PN2,
                  border: b==="Buy & Sell" ? "none" : `1px solid ${BRD}`,
                  color: b==="Buy & Sell" ? "#fff" : TXT, fontSize:13, fontWeight:600,
                }}>{b}</button>
              ))}
              {["🔔","?","⊞"].map(ic => (
                <button key={ic} style={{ width:30, height:30, background:PN2, border:`1px solid ${BRD}`, color:DIM, borderRadius:"50%", fontSize:13 }}>{ic}</button>
              ))}
              <div style={{ width:30, height:30, borderRadius:"50%", background:BLU, display:"flex", alignItems:"center", justifyContent:"center", fontWeight:700, color:"#fff" }}>S</div>
            </div>
          </div>

          {/* Setup progress banner */}
          <div style={{ display:"flex", alignItems:"center", gap:10, padding:"8px 20px", background:PN2, borderBottom:`1px solid ${BRD}`, flexShrink:0 }}>
            <span style={{ color:BLU, fontSize:14 }}>✓</span>
            <span style={{ fontSize:12, color:TXT }}>You're almost there, finish account setup</span>
            <div style={{ flex:1, maxWidth:120, height:5, background:BRD, borderRadius:3, overflow:"hidden" }}>
              <div style={{ height:"100%", width:"50%", background:BLU, borderRadius:3 }}/>
            </div>
            <span style={{ fontSize:12, color:DIM }}>2/4</span>
            <span style={{ flex:1 }}/>
            <span style={{ fontSize:12, color:BLU, cursor:"pointer" }}>Add a payment method →</span>
          </div>

          {/* ── Body ── */}
          <div style={{ flex:1, display:"flex", overflow:"hidden" }}>

            {/* Left / main area */}
            <div style={{ flex:1, overflowY:"auto", padding:"0" }}>

              {screen === "trade" ? (
                <div style={{ padding:"0" }}>
                  {/* Search + filters */}
                  <div style={{ display:"flex", alignItems:"center", gap:10, padding:"12px 16px", borderBottom:`1px solid ${BRD}` }}>
                    <div style={{ flex:1, display:"flex", alignItems:"center", gap:8, background:PN2, border:`1px solid ${BRD}`, borderRadius:20, padding:"8px 14px" }}>
                      <span style={{ color:DIM }}>🔍</span>
                      <input placeholder="Search all assets" value={search} onChange={e => setSearch(e.target.value)}
                        style={{ flex:1, background:"transparent", border:"none", color:TXT, fontSize:14 }}/>
                    </div>
                    <div style={{ position:"relative" }}>
                      <select value={tf} onChange={e => setTf(e.target.value)}
                        style={{ background:PN2, border:`1px solid ${BRD}`, color:TXT, fontSize:13, padding:"8px 28px 8px 12px", borderRadius:6, outline:"none", appearance:"none", cursor:"pointer" }}>
                        {["1H","1D","1W","1M"].map(t => <option key={t}>{t}</option>)}
                      </select>
                      <span style={{ position:"absolute", right:8, top:"50%", transform:"translateY(-50%)", color:DIM, fontSize:10, pointerEvents:"none" }}>▾</span>
                    </div>
                    <div style={{ position:"relative" }}>
                      <select style={{ background:PN2, border:`1px solid ${BRD}`, color:TXT, fontSize:13, padding:"8px 28px 8px 12px", borderRadius:6, outline:"none", appearance:"none", cursor:"pointer" }}>
                        <option>All assets</option>
                      </select>
                      <span style={{ position:"absolute", right:8, top:"50%", transform:"translateY(-50%)", color:DIM, fontSize:10, pointerEvents:"none" }}>▾</span>
                    </div>
                  </div>

                  {/* Table header */}
                  <div style={{ display:"grid", gridTemplateColumns:"2fr 1fr 1fr 1fr 80px 48px", padding:"6px 16px", gap:8, borderBottom:`1px solid ${BRD}` }}>
                    {["Name","Price","Change","Market cap ▼","","Watch"].map(h => (
                      <div key={h} style={{ fontSize:11, color:DIM, textAlign: h==="Name"?"left":"right", cursor:"pointer" }}>{h}</div>
                    ))}
                  </div>

                  {/* Rows */}
                  {filtered.map(c => (
                    <div key={c.sym} className="row" onClick={() => openAsset(c)} style={{
                      display:"grid", gridTemplateColumns:"2fr 1fr 1fr 1fr 80px 48px",
                      padding:"10px 16px", gap:8, alignItems:"center",
                      borderBottom:`1px solid ${BRD}18`, cursor:"pointer",
                      transition:"background 0.15s", background:"transparent",
                    }}>
                      {/* Name + icon */}
                      <div style={{ display:"flex", alignItems:"center", gap:10 }}>
                        <div style={{ width:32, height:32, borderRadius:"50%", background:c.color, display:"flex", alignItems:"center", justifyContent:"center", fontSize:14, fontWeight:800, color:"#fff", flexShrink:0 }}>{c.icon}</div>
                        <div>
                          <div style={{ fontSize:14, fontWeight:600 }}>{c.name}</div>
                          <div style={{ fontSize:11, color:DIM }}>{c.sym}{c.apy ? ` · ${c.apy}% APY` : ""}</div>
                        </div>
                      </div>
                      <div style={{ fontSize:14, fontFamily:"monospace", textAlign:"right" }}>${c.price.toLocaleString("en",{minimumFractionDigits:2,maximumFractionDigits:2})}</div>
                      <div style={{ fontSize:13, fontWeight:600, color:c.chg>=0?G:R, textAlign:"right" }}>{c.chg>=0?"+":""}{c.chg.toFixed(2)}%</div>
                      <div style={{ fontSize:13, textAlign:"right" }}>{c.mcap}</div>
                      <div style={{ display:"flex", justifyContent:"flex-end" }}>
                        <Sparkline sym={c.sym} chg={c.chg}/>
                      </div>
                      <div style={{ display:"flex", justifyContent:"center" }}>
                        <span onClick={e => { e.stopPropagation(); setStarred(p => { const n=new Set(p); n.has(c.sym)?n.delete(c.sym):n.add(c.sym); return n; }); }}
                          style={{ fontSize:16, cursor:"pointer", color: starred.has(c.sym) ? BLU : DIM }}>
                          {starred.has(c.sym) ? "★" : "☆"}
                        </span>
                      </div>
                    </div>
                  ))}
                </div>

              ) : (
                // Asset detail screen (screenshot 406)
                <div style={{ padding:"20px", animation:"slideUp 0.25s ease" }}>
                  {/* Asset header */}
                  <div style={{ display:"flex", alignItems:"center", justifyContent:"space-between", marginBottom:20 }}>
                    <div style={{ display:"flex", alignItems:"center", gap:12 }}>
                      <div style={{ width:44, height:44, borderRadius:"50%", background:activeCoin.color, display:"flex", alignItems:"center", justifyContent:"center", fontSize:20, fontWeight:800, color:"#fff" }}>{activeCoin.icon}</div>
                      <div>
                        <span style={{ fontSize:22, fontWeight:700 }}>{activeCoin.name} </span>
                        <span style={{ fontSize:16, color:DIM }}>{activeCoin.sym}</span>
                      </div>
                    </div>
                    <div style={{ display:"flex", alignItems:"center", gap:4, cursor:"pointer" }}>
                      <span style={{ color:DIM, fontSize:13 }}>☆ Add to Watchlist</span>
                    </div>
                  </div>

                  {/* Asset tabs */}
                  <div style={{ display:"flex", gap:0, marginBottom:16, borderBottom:`1px solid ${BRD}` }}>
                    {["overview","Primary balance","Vault"].map(t => (
                      <button key={t} onClick={() => setAssetTab(t)} style={{
                        padding:"8px 16px", background:"transparent", border:"none",
                        borderBottom: assetTab===t ? `2px solid ${TXT}` : "2px solid transparent",
                        color: assetTab===t ? TXT : DIM, fontSize:13, fontWeight: assetTab===t?600:400,
                        marginBottom:-1, cursor:"pointer", textTransform:"capitalize",
                      }}>{t}</button>
                    ))}
                  </div>

                  {/* Chart card */}
                  <div style={{ background:PNL, borderRadius:10, padding:20, border:`1px solid ${BRD}` }}>
                    <div style={{ marginBottom:12 }}>
                      <div style={{ fontSize:11, color:DIM }}>{activeCoin.sym} Price</div>
                      <div style={{ fontSize:30, fontWeight:700, fontFamily:"monospace" }}>${activeCoin.price.toLocaleString()}</div>
                      <div style={{ fontSize:13, color:activeCoin.chg>=0?G:R, marginTop:2 }}>
                        {activeCoin.chg>=0?"↗":"↘"} $0.00 ({activeCoin.chg>=0?"+":""}{activeCoin.chg.toFixed(2)}%)
                      </div>
                    </div>
                    {/* TF buttons */}
                    <div style={{ display:"flex", gap:4, marginBottom:10 }}>
                      {["1H","1D","1W","1M","1Y","ALL"].map(t => (
                        <button key={t} onClick={() => setAssetTf(t)} style={{
                          padding:"4px 12px", borderRadius:20,
                          background: assetTf===t ? BLU : "transparent",
                          border: `1px solid ${assetTf===t ? BLU : BRD}`,
                          color: assetTf===t ? "#fff" : DIM, fontSize:12, cursor:"pointer",
                          fontWeight: assetTf===t ? 700 : 400,
                        }}>{t}</button>
                      ))}
                    </div>
                    <div style={{ height:220, width:"100%", position:"relative" }}>
                      <AreaChart sym={`${activeCoin.sym}-${assetTf}`} col={activeCoin.chg>=0?G:R}/>
                    </div>
                    <TimeLabels/>
                  </div>
                </div>
              )}
            </div>

            {/* ── Right panel ─────────────────────────────────────────────── */}
            <div style={{ width:304, borderLeft:`1px solid ${BRD}`, display:"flex", flexDirection:"column", flexShrink:0, overflow:"hidden" }}>
              {/* Buy/Sell/Convert tabs */}
              <div style={{ display:"flex", borderBottom:`1px solid ${BRD}`, height:44, flexShrink:0 }}>
                {(["buy","sell","convert"] as const).map(t => (
                  <button key={t} onClick={() => setTradeTab(t)} style={{
                    flex:1, background:"transparent", border:"none",
                    borderBottom: tradeTab===t ? `2px solid ${TXT}` : "2px solid transparent",
                    color: tradeTab===t ? TXT : DIM,
                    fontSize:13, fontWeight: tradeTab===t ? 700:400, cursor:"pointer",
                    marginBottom:-1, textTransform:"capitalize",
                    background2: tradeTab===t ? PN2 : "transparent",
                  } as any}>{t.charAt(0).toUpperCase()+t.slice(1)}</button>
                ))}
              </div>

              <div style={{ flex:1, overflowY:"auto", padding:16 }}>
                {/* Big USD input */}
                <div style={{ display:"flex", alignItems:"center", justifyContent:"space-between", marginBottom:4 }}>
                  <div style={{ display:"flex", alignItems:"baseline", gap:6 }}>
                    <span style={{ fontSize:52, fontWeight:700, fontFamily:"monospace", color:TXT }}>0</span>
                    <span style={{ fontSize:22, color:DIM }}>USD</span>
                  </div>
                  <button style={{ padding:"5px 12px", background:PN2, border:`1px solid ${BRD}`, color:TXT, fontSize:12, fontWeight:600, borderRadius:20 }}>Max</button>
                </div>

                {/* Error message */}
                <div style={{ display:"flex", alignItems:"flex-start", gap:6, margin:"8px 0 16px", padding:"8px 10px", background:"#2d1519", borderRadius:6 }}>
                  <span style={{ color:R, fontSize:13 }}>⊘</span>
                  <span style={{ fontSize:12, color:R }}>You don't have any {activeCoin.name} to convert. Try buying some to get started.</span>
                </div>

                {/* From / To */}
                {tradeTab === "convert" && (
                  <>
                    {[
                      { lbl:"From", coin:activeCoin, bal:"$0.00" },
                    ].map(row => (
                      <div key={row.lbl} style={{ display:"flex", alignItems:"center", justifyContent:"space-between", padding:"10px 0", borderTop:`1px solid ${BRD}` }}>
                        <div style={{ display:"flex", alignItems:"center", gap:8 }}>
                          <div style={{ width:28, height:28, borderRadius:"50%", background:row.coin.color, display:"flex", alignItems:"center", justifyContent:"center", fontSize:13, fontWeight:700, color:"#fff" }}>{row.coin.icon}</div>
                          <div>
                            <div style={{ fontSize:11, color:DIM }}>{row.lbl}</div>
                            <div style={{ fontSize:14, fontWeight:600 }}>{row.coin.name}</div>
                          </div>
                        </div>
                        <div style={{ textAlign:"right" }}>
                          <div style={{ fontSize:13 }}>{row.bal}</div>
                          <div style={{ fontSize:10, color:DIM }}>Available</div>
                        </div>
                        <span style={{ color:DIM, fontSize:14 }}>›</span>
                      </div>
                    ))}
                    <div style={{ display:"flex", justifyContent:"center", padding:"4px 0", borderTop:`1px solid ${BRD}` }}>
                      <button style={{ background:PN2, border:`1px solid ${BRD}`, color:DIM, width:24, height:24, borderRadius:"50%", fontSize:14, display:"flex", alignItems:"center", justifyContent:"center" }}>⇅</button>
                    </div>
                    <div style={{ display:"flex", alignItems:"center", justifyContent:"space-between", padding:"10px 0", borderTop:`1px solid ${BRD}` }}>
                      <div style={{ display:"flex", alignItems:"center", gap:8 }}>
                        <div style={{ width:28, height:28, borderRadius:"50%", background:"#627eea", display:"flex", alignItems:"center", justifyContent:"center", fontSize:13, fontWeight:700, color:"#fff" }}>Ξ</div>
                        <div>
                          <div style={{ fontSize:11, color:DIM }}>To</div>
                          <div style={{ fontSize:14, fontWeight:600 }}>Bitcoin</div>
                        </div>
                      </div>
                      <span style={{ color:DIM, fontSize:14 }}>›</span>
                    </div>
                  </>
                )}

                {/* Review button */}
                <button style={{
                  width:"100%", padding:"14px 0", marginTop:12, borderRadius:30,
                  background:"linear-gradient(135deg,#1d53e0,#2962ff)", border:"none",
                  color:"#fff", fontSize:15, fontWeight:700, display:"flex", alignItems:"center", justifyContent:"center", gap:6,
                }}>Review order <span style={{ fontSize:16 }}>→</span></button>

                {/* New on Coinbase */}
                <div style={{ marginTop:20 }}>
                  <div style={{ fontSize:14, fontWeight:600, marginBottom:10 }}>New on Coinbase</div>
                  {[
                    { name:"Degen", sub:"Added 2 weeks ago", col:"#8b5cf6" },
                    { name:"io.net", sub:"Added 3 weeks ago", col:"#0ea5e9" },
                  ].map(n => (
                    <div key={n.name} style={{ display:"flex", alignItems:"center", justifyContent:"space-between", padding:"8px 0", borderBottom:`1px solid ${BRD}18`, cursor:"pointer" }}>
                      <div style={{ display:"flex", alignItems:"center", gap:8 }}>
                        <div style={{ width:32, height:32, borderRadius:"50%", background:n.col, display:"flex", alignItems:"center", justifyContent:"center", fontSize:14, color:"#fff" }}>◉</div>
                        <div>
                          <div style={{ fontSize:13, fontWeight:600 }}>{n.name}</div>
                          <div style={{ fontSize:11, color:DIM }}>{n.sub}</div>
                        </div>
                      </div>
                      <span style={{ color:DIM }}>›</span>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </>
  );
}
