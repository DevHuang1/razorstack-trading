"use client";
import React, { useState, useCallback, useRef, useMemo, useEffect } from "react";

// ─── Exact Coinbase Advanced colors ─────────────────────────────────────────
const BG  = "var(--trading-bg)";
const PNL = "var(--trading-panel)";
const PN2 = "var(--trading-panel-raised)";
const PN3 = "var(--trading-panel-deep)";
const BRD = "var(--trading-border)";
const TXT = "var(--trading-text)";
const DIM = "var(--trading-muted)";
const G   = "#26a69a";
const R   = "#ef5350";
const BLU = "#2962ff";
const ORG = "#f7931a";
const AMB = "#f59e0b";

// ─── Types ────────────────────────────────────────────────────────────────────
type Side = "buy" | "sell";
type OType = "LIMIT" | "MARKET" | "STOP LIMIT";
type Tf = "1m" | "5m" | "15m" | "1H" | "4H" | "1D" | "1W";
type ChartTab = "price" | "depth";
type BookTab = "order_book" | "trade_history";
type Modal = "none" | "chart_settings" | "go_to";
type SettSect = "symbol" | "status_line" | "scales" | "canvas";
interface Bar { t: string; o: number; h: number; l: number; c: number; v: number; }
interface Snap { price: number; bid: number; ask: number; open: number; high: number; low: number; volume: number; change: number; changePct: number; }
interface Level { price: number; amount: number; cum: number; }

// ─── Seeded fallback RNG ─────────────────────────────────────────────────────
function mkRng(seed: number) {
  let s = seed >>> 0;
  return () => { s = (s * 1664525 + 1013904223) >>> 0; return s / 4294967296; };
}
const BASES: Record<string, number> = {
  BTC:70000,ETH:2650,NVDA:135,AAPL:195,MSFT:425,TSLA:250,SPY:555,SOL:175,BNB:590,XRP:0.52,
};
function genFallbackCandles(sym: string, tf: Tf, n = 120): Bar[] {
  const tfs = ["1m","5m","15m","1H","4H","1D","1W"];
  const seed = sym.split("").reduce((a,c)=>a+c.charCodeAt(0),0)+tfs.indexOf(tf)*211+7;
  const r = mkRng(seed);
  let p = BASES[sym] ?? (60 + (seed % 380));
  return Array.from({ length: n }, () => {
    const vol = 0.007 + r()*0.016, o=p, c=o*(1+(r()-0.487)*vol*2);
    const swing = r()*vol*0.55;
    const h=Math.max(o,c)*(1+swing), l=Math.min(o,c)*(1-swing);
    p=c;
    return { t: new Date().toISOString(), o, h, l, c, v: r()*900+40 };
  });
}

// ─── Generate synthetic order book ───────────────────────────────────────────
function genBook(price: number, side: "asks"|"bids", n=16): Level[] {
  const r = mkRng(Math.floor(price*137));
  const step = price*0.00008;
  let cum=0;
  return Array.from({ length:n },(_,i) => {
    const amount = r()*0.6+0.001; cum+=amount;
    const px = side==="asks" ? price*1.0001+step*i : price*0.9999-step*i;
    return { price:px, amount, cum };
  });
}

// ─── SVG Candle Chart ─────────────────────────────────────────────────────────
function CandleChart({ bars, live }: { bars: Bar[]; live: boolean }) {
  const W=760, H=300, VOL=48, PAD=64, TOP=6;
  const cH=H-VOL-10;
  const prices = bars.flatMap(c=>[c.h,c.l]);
  const pMin=Math.min(...prices)*0.9982, pMax=Math.max(...prices)*1.0018;
  const pRng=pMax-pMin||1;
  const maxV=Math.max(...bars.map(c=>c.v));
  const cW=Math.max(4,Math.floor((W-PAD)/bars.length)-1);
  const gap=Math.max(1,Math.floor((W-PAD)/bars.length)-cW);
  const pY=(p:number)=>TOP+cH-((p-pMin)/pRng)*cH;
  const xC=(i:number)=>i*(cW+gap)+cW/2;
  const last=bars[bars.length-1];
  const lastC=last?.c??0, firstO=bars[0]?.o??0;
  const pct=firstO?(lastC-firstO)/firstO*100:0;
  const isUp=pct>=0;
  const grids=[0,0.25,0.5,0.75,1].map(t=>({ p:pMin+pRng*t, y:pY(pMin+pRng*t) }));
  return (
    <div style={{ position:"relative", width:"100%", overflow:"hidden", background:PN3, flex:1, display:"flex", flexDirection:"column" }}>
      <div style={{ display:"flex", alignItems:"baseline", gap:8, padding:"3px 8px", fontSize:11, fontFamily:"monospace", flexShrink:0 }}>
        {[["O",bars[bars.length-3]?.o.toFixed(2),""],["H",Math.max(...bars.slice(-20).map(c=>c.h)).toFixed(2),G],["L",Math.min(...bars.slice(-20).map(c=>c.l)).toFixed(2),R],["C",lastC.toFixed(2),""]].map(([l,v,c])=>(
          <React.Fragment key={String(l)}>
            <span style={{ color:DIM }}>{l}</span>
            <span style={{ color:String(c)||TXT }}>{v}</span>
          </React.Fragment>
        ))}
        <span style={{ color:isUp?G:R, marginLeft:4 }}>{isUp?"+":""}{pct.toFixed(2)}%</span>
        {live && <span style={{ marginLeft:8, fontSize:10, color:G, display:"flex", alignItems:"center", gap:3 }}><span style={{ width:6, height:6, borderRadius:"50%", background:G, display:"inline-block", animation:"pulse 1.5s infinite" }}/>LIVE</span>}
      </div>
      <svg viewBox={`0 0 ${W} ${H}`} style={{ width:"100%", display:"block", flex:1 }}>
        <defs>
          <linearGradient id="vgg" x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stopColor={G} stopOpacity={0.55}/><stop offset="100%" stopColor={G} stopOpacity={0.04}/></linearGradient>
          <linearGradient id="vgr" x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stopColor={R} stopOpacity={0.55}/><stop offset="100%" stopColor={R} stopOpacity={0.04}/></linearGradient>
        </defs>
        {grids.map((g,i)=>(
          <g key={i}>
            <line x1={0} y1={g.y} x2={W-PAD} y2={g.y} stroke={BRD} strokeWidth={0.45}/>
            <text x={W-PAD+4} y={g.y+3} fill={DIM} fontSize={9} fontFamily="monospace">{g.p.toFixed(2)}</text>
          </g>
        ))}
        {bars.map((c,i)=>{
          const up=c.c>=c.o, col=up?G:R;
          const bTop=pY(Math.max(c.o,c.c));
          const bH=Math.max(1,pY(Math.min(c.o,c.c))-bTop);
          const cx=xC(i);
          return (
            <g key={i}>
              <line x1={cx} y1={pY(c.h)} x2={cx} y2={pY(c.l)} stroke={col} strokeWidth={0.8}/>
              <rect x={i*(cW+gap)} y={bTop} width={cW} height={bH} fill={col}/>
            </g>
          );
        })}
        <line x1={0} y1={pY(lastC)} x2={W-PAD} y2={pY(lastC)} stroke={ORG} strokeWidth={0.7} strokeDasharray="3,2" opacity={0.85}/>
        <rect x={W-PAD+1} y={pY(lastC)-8} width={PAD-3} height={16} fill={ORG} rx={2}/>
        <text x={W-PAD/2} y={pY(lastC)+4} fill="#000" fontSize={9.5} fontWeight={700} textAnchor="middle" fontFamily="monospace">{lastC.toFixed(2)}</text>
        {bars.map((c,i)=>{
          const up=c.c>=c.o;
          const bH2=(c.v/maxV)*(VOL-8);
          return <rect key={i} x={i*(cW+gap)} y={H-VOL+(VOL-8-bH2)} width={cW} height={bH2} fill={up?"url(#vgg)":"url(#vgr)"}/>;
        })}
        <text x={4} y={H-VOL+11} fill={DIM} fontSize={9}>VOLUME</text>
      </svg>
    </div>
  );
}

// ─── Order Book ───────────────────────────────────────────────────────────────
function OrderBook({ snap }: { snap: Snap | null }) {
  const price = snap?.price ?? 70000;
  const asks = useMemo(()=>genBook(price,"asks",16).reverse(),[price]);
  const bids = useMemo(()=>genBook(price,"bids",16),[price]);
  const maxAsk=asks[asks.length-1]?.cum??1;
  const maxBid=bids[bids.length-1]?.cum??1;
  const spread=((asks[asks.length-1]?.price??0)-(bids[0]?.price??0)).toFixed(2);
  const Row=({ lvl, side, max }: { lvl:Level; side:"ask"|"bid"; max:number })=>{
    const pct=(lvl.cum/max)*100;
    const col=side==="ask"?R:G;
    return (
      <div style={{ position:"relative", display:"grid", gridTemplateColumns:"1fr 1fr", padding:"1.5px 8px", fontSize:11, fontFamily:"monospace", lineHeight:"17px" }}>
        <div style={{ position:"absolute", inset:0, background:side==="ask"?`rgba(239,83,80,0.10)`:`rgba(38,166,154,0.10)`, width:`${pct}%`, right:side==="ask"?"0":"auto", left:side==="bid"?"0":"auto" }}/>
        <span style={{ color:DIM, zIndex:1 }}>{lvl.amount.toFixed(4)}</span>
        <span style={{ color:col, textAlign:"right", zIndex:1 }}>{lvl.price.toFixed(2)}</span>
      </div>
    );
  };
  return (
    <div style={{ display:"flex", flexDirection:"column", height:"100%", overflow:"hidden" }}>
      <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr", padding:"3px 8px", borderBottom:`1px solid ${BRD}`, flexShrink:0 }}>
        <span style={{ fontSize:9, color:DIM, textTransform:"uppercase" }}>AMOUNT</span>
        <span style={{ fontSize:9, color:DIM, textTransform:"uppercase", textAlign:"right" }}>PRICE (USD)</span>
      </div>
      <div style={{ flex:1, overflow:"auto" }}>{asks.map((a,i)=><Row key={i} lvl={a} side="ask" max={maxAsk}/>)}</div>
      <div style={{ padding:"3px 8px", background:`${R}22`, borderTop:`1px solid ${BRD}22`, borderBottom:`1px solid ${BRD}22`, flexShrink:0 }}>
        <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr" }}>
          <span style={{ fontSize:12, fontWeight:700, color:R, fontFamily:"monospace" }}>{(snap?.ask??price).toFixed(2)}</span>
          <span style={{ fontSize:12, color:DIM, textAlign:"right", fontFamily:"monospace" }}>{(snap?.bid??price*0.9999).toFixed(2)}</span>
        </div>
      </div>
      <div style={{ flex:1, overflow:"auto" }}>{bids.map((b,i)=><Row key={i} lvl={b} side="bid" max={maxBid}/>)}</div>
      <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr", padding:"3px 8px", borderTop:`1px solid ${BRD}`, flexShrink:0, background:PN2 }}>
        <span style={{ fontSize:10, color:DIM, fontFamily:"monospace" }}>USD SPREAD</span>
        <span style={{ fontSize:10, color:DIM, textAlign:"right", fontFamily:"monospace" }}>{spread}</span>
      </div>
    </div>
  );
}

// ─── Chart Settings Modal ────────────────────────────────────────────────────
function ChartSettingsModal({ onClose }: { onClose:()=>void }) {
  const [sect,setSect]=useState<SettSect>("symbol");
  const [nav,setNav]=useState("Visible on mouse over");
  const [pane,setPane]=useState("Visible on mouse over");
  const [top,setTop]=useState("10");
  const [bot,setBot]=useState("8");
  const [right,setRight]=useState("10");
  const sects=[
    { id:"symbol" as SettSect,icon:"◈",label:"Symbol" },
    { id:"status_line" as SettSect,icon:"≡",label:"Status line" },
    { id:"scales" as SettSect,icon:"⊣",label:"Scales" },
    { id:"canvas" as SettSect,icon:"✏",label:"Canvas" },
  ];
  return (
    <div style={{ position:"fixed",inset:0,background:"rgba(0,0,0,0.75)",display:"flex",alignItems:"center",justifyContent:"center",zIndex:200 }}>
      <div style={{ background:PNL,border:`1px solid ${BRD}`,borderRadius:8,width:520,overflow:"hidden",display:"flex",flexDirection:"column" }}>
        <div style={{ display:"flex",alignItems:"center",justifyContent:"space-between",padding:"12px 16px",borderBottom:`1px solid ${BRD}` }}>
          <span style={{ fontSize:14,fontWeight:600,color:TXT }}>Chart settings</span>
          <button onClick={onClose} style={{ background:"transparent",border:"none",color:DIM,fontSize:20,cursor:"pointer",lineHeight:1 }}>×</button>
        </div>
        <div style={{ display:"flex",minHeight:280 }}>
          <div style={{ width:155,borderRight:`1px solid ${BRD}`,padding:"6px 0" }}>
            {sects.map(s=>(
              <div key={s.id} onClick={()=>setSect(s.id)} style={{
                display:"flex",alignItems:"center",gap:8,padding:"9px 14px",cursor:"pointer",fontSize:13,
                color:sect===s.id?TXT:DIM,background:sect===s.id?PN2:"transparent",
                borderLeft:sect===s.id?`2px solid ${BLU}`:"2px solid transparent",
              }}>
                <span style={{ fontSize:14,minWidth:16 }}>{s.icon}</span><span>{s.label}</span>
              </div>
            ))}
          </div>
          <div style={{ flex:1,padding:"16px 18px",overflowY:"auto" }}>
            {sect==="symbol" ? (
              <>
                <div style={{ fontSize:10,color:DIM,textTransform:"uppercase",letterSpacing:"0.08em",marginBottom:12 }}>BUTTONS</div>
                {[["Navigation",nav,setNav],["Pane",pane,setPane]].map(([lbl,val,fn])=>(
                  <div key={String(lbl)} style={{ display:"flex",alignItems:"center",justifyContent:"space-between",marginBottom:10 }}>
                    <span style={{ fontSize:13,color:TXT }}>{String(lbl)}</span>
                    <div style={{ position:"relative" }}>
                      <select value={String(val)} onChange={e=>(fn as Function)(e.target.value)}
                        style={{ background:PN2,border:`1px solid ${BRD}`,color:TXT,fontSize:12,padding:"5px 28px 5px 8px",borderRadius:4,width:200,cursor:"pointer",outline:"none",appearance:"none" as any }}>
                        {["Visible on mouse over","Always visible","Hidden"].map(o=><option key={o}>{o}</option>)}
                      </select>
                      <span style={{ position:"absolute",right:8,top:"50%",transform:"translateY(-50%)",color:DIM,fontSize:10,pointerEvents:"none" }}>▾</span>
                    </div>
                  </div>
                ))}
                <div style={{ fontSize:10,color:DIM,textTransform:"uppercase",letterSpacing:"0.08em",margin:"16px 0 12px" }}>MARGINS</div>
                {[["Top",top,setTop,"%"],["Bottom",bot,setBot,"%"],["Right",right,setRight,"bars"]].map(([lbl,val,fn,unit])=>(
                  <div key={String(lbl)} style={{ display:"flex",alignItems:"center",justifyContent:"space-between",marginBottom:10 }}>
                    <span style={{ fontSize:13,color:TXT }}>{String(lbl)}</span>
                    <div style={{ display:"flex",alignItems:"center",gap:6 }}>
                      <input value={String(val)} onChange={e=>(fn as Function)(e.target.value)}
                        style={{ background:PN2,border:`1px solid ${BRD}`,color:TXT,fontSize:12,padding:"5px 8px",borderRadius:4,width:80,textAlign:"right" as any,outline:"none" }}/>
                      <span style={{ fontSize:12,color:DIM,width:30 }}>{String(unit)}</span>
                    </div>
                  </div>
                ))}
              </>
            ) : <div style={{ color:DIM,fontSize:13,paddingTop:20,textAlign:"center" as any }}>{sects.find(s=>s.id===sect)?.label} settings</div>}
          </div>
        </div>
        <div style={{ display:"flex",alignItems:"center",justifyContent:"space-between",padding:"10px 16px",borderTop:`1px solid ${BRD}` }}>
          <div style={{ position:"relative" }}>
            <select style={{ background:PN2,border:`1px solid ${BRD}`,color:TXT,fontSize:12,padding:"5px 24px 5px 10px",borderRadius:4,cursor:"pointer",outline:"none",appearance:"none" as any }}><option>Template</option></select>
            <span style={{ position:"absolute",right:8,top:"50%",transform:"translateY(-50%)",color:DIM,fontSize:10,pointerEvents:"none" }}>▾</span>
          </div>
          <div style={{ display:"flex",gap:8 }}>
            <button onClick={onClose} style={{ background:"transparent",border:`1px solid ${BRD}`,color:TXT,fontSize:13,padding:"6px 20px",borderRadius:6,cursor:"pointer" }}>Cancel</button>
            <button onClick={onClose} style={{ background:BLU,border:"none",color:"#fff",fontSize:13,fontWeight:600,padding:"6px 20px",borderRadius:6,cursor:"pointer" }}>Ok</button>
          </div>
        </div>
      </div>
    </div>
  );
}

// ─── Go To Modal ─────────────────────────────────────────────────────────────
function GoToModal({ onClose }: { onClose:()=>void }) {
  const [tab,setTab]=useState<"date"|"range">("date");
  const [selDay,setSelDay]=useState(10);
  const [month,setMonth]=useState(new Date(2024,9,1));
  const [dateStr,setDateStr]=useState("2024-10-10");
  const [timeStr,setTimeStr]=useState("01:00");
  const dim=new Date(month.getFullYear(),month.getMonth()+1,0).getDate();
  const fdow=(new Date(month.getFullYear(),month.getMonth(),1).getDay()+6)%7;
  const ml=month.toLocaleString("en",{month:"long",year:"numeric"});
  const cells:(number|null)[]=[];
  for(let i=0;i<fdow;i++)cells.push(null);
  for(let d=1;d<=dim;d++)cells.push(d);
  return (
    <div style={{ position:"fixed",inset:0,background:"rgba(0,0,0,0.75)",display:"flex",alignItems:"center",justifyContent:"center",zIndex:200 }}>
      <div style={{ background:PNL,border:`1px solid ${BRD}`,borderRadius:8,width:340,overflow:"hidden" }}>
        <div style={{ display:"flex",alignItems:"center",justifyContent:"space-between",padding:"12px 16px" }}>
          <span style={{ fontSize:14,fontWeight:600,color:TXT }}>Go to</span>
          <button onClick={onClose} style={{ background:"transparent",border:"none",color:DIM,fontSize:20,cursor:"pointer",lineHeight:1 }}>×</button>
        </div>
        <div style={{ display:"flex",margin:"0 16px",borderBottom:`1px solid ${BRD}` }}>
          {(["date","range"] as const).map(t=>(
            <button key={t} onClick={()=>setTab(t)} style={{
              flex:1,padding:"8px 0",background:"transparent",border:"none",
              borderBottom:tab===t?`2px solid ${BLU}`:"2px solid transparent",
              color:tab===t?TXT:DIM,fontSize:13,cursor:"pointer",fontWeight:tab===t?600:400,marginBottom:-1,
            }}>{t==="date"?"Date":"Custom range"}</button>
          ))}
        </div>
        <div style={{ display:"flex",gap:8,padding:"12px 16px" }}>
          <div style={{ flex:1,display:"flex",alignItems:"center",background:PN2,border:`1px solid ${BRD}`,borderRadius:4,padding:"6px 8px",gap:4 }}>
            <input value={dateStr} onChange={e=>setDateStr(e.target.value)}
              style={{ flex:1,background:"transparent",border:"none",color:TXT,fontSize:13,outline:"none" }}/>
            <span style={{ color:DIM }}>📅</span>
          </div>
          <div style={{ display:"flex",alignItems:"center",background:PN2,border:`1px solid ${BRD}`,borderRadius:4,padding:"6px 8px",gap:4 }}>
            <input value={timeStr} onChange={e=>setTimeStr(e.target.value)}
              style={{ background:"transparent",border:"none",color:TXT,fontSize:13,outline:"none",width:48 }}/>
            <span style={{ color:DIM }}>🕐</span>
          </div>
        </div>
        <div style={{ padding:"0 16px 12px" }}>
          <div style={{ display:"flex",alignItems:"center",justifyContent:"space-between",marginBottom:8 }}>
            <button onClick={()=>setMonth(new Date(month.getFullYear(),month.getMonth()-1,1))}
              style={{ background:"transparent",border:"none",color:DIM,fontSize:18,cursor:"pointer",lineHeight:1 }}>‹</button>
            <span style={{ fontSize:13,fontWeight:600,color:TXT }}>{ml}</span>
            <button onClick={()=>setMonth(new Date(month.getFullYear(),month.getMonth()+1,1))}
              style={{ background:"transparent",border:"none",color:DIM,fontSize:18,cursor:"pointer",lineHeight:1 }}>›</button>
          </div>
          <div style={{ display:"grid",gridTemplateColumns:"repeat(7,1fr)",gap:2 }}>
            {["Mo","Tu","We","Th","Fr","Sa","Su"].map(d=>(
              <div key={d} style={{ fontSize:11,color:DIM,textAlign:"center" as any,padding:"2px 0" }}>{d}</div>
            ))}
            {cells.map((d,i)=>(
              <div key={i} onClick={()=>d&&setSelDay(d)} style={{
                fontSize:12.5,textAlign:"center" as any,padding:"5px 0",cursor:d?"pointer":"default",borderRadius:"50%",
                background:d===selDay?BLU:"transparent",color:d?(d===selDay?"#fff":TXT):"transparent",fontWeight:d===selDay?700:400,
              }}>{d??""}</div>
            ))}
          </div>
        </div>
        <div style={{ display:"flex",gap:8,padding:"10px 16px",borderTop:`1px solid ${BRD}` }}>
          <button onClick={onClose} style={{ flex:1,padding:"8px",background:"transparent",border:`1px solid ${BRD}`,color:TXT,fontSize:13,borderRadius:6,cursor:"pointer" }}>Cancel</button>
          <button onClick={onClose} style={{ flex:1,padding:"8px",background:BLU,border:"none",color:"#fff",fontSize:13,fontWeight:600,borderRadius:6,cursor:"pointer" }}>Go to</button>
        </div>
      </div>
    </div>
  );
}

// ─── Main Terminal ────────────────────────────────────────────────────────────
const SYMS = ["NVDA","AAPL","MSFT","TSLA","BTC","ETH","SOL","SPY"];

export default function QuantTerminal() {
  const [sym,setSym] = useState("BTC");
  const [inputSym,setInputSym] = useState("BTC");
  const [tf,setTf] = useState<Tf>("5m");
  const [chartTab,setChartTab] = useState<ChartTab>("price");
  const [bookTab,setBookTab] = useState<BookTab>("order_book");
  const [side,setSide] = useState<Side>("buy");
  const [oType,setOType] = useState<OType>("LIMIT");
  const [modal,setModal] = useState<Modal>("none");
  const [banner,setBanner] = useState(true);
  const [crisis,setCrisis] = useState(false);
  const [running,setRunning] = useState(false);
  const [statusMsg,setStatusMsg] = useState("");
  const [messages,setMessages] = useState<Map<string,any>>(new Map());
  const [thesis,setThesis] = useState<any>(null);
  const abortRef = useRef<AbortController|null>(null);

  // ── Live data state ─────────────────────────────────────────────────────────
  const [bars,setBars] = useState<Bar[]>([]);
  const [snap,setSnap] = useState<Snap|null>(null);
  const [loading,setLoading] = useState(true);
  const [liveError,setLiveError] = useState(false);

  // Fetch historical bars
  const fetchBars = useCallback(async (s: string, t: Tf) => {
    setLoading(true);
    try {
      const res = await fetch(`/api/market/bars?symbol=${s}&tf=${t}&limit=120`);
      if (res.ok) {
        const data = await res.json();
        if (data.bars?.length > 0) {
          setBars(data.bars); setLiveError(false); setLoading(false); return;
        }
      }
    } catch {}
    // Fallback to synthetic if API fails
    setBars(genFallbackCandles(s, t, 120));
    setLiveError(true); setLoading(false);
  }, []);

  // Fetch snapshot (price + bid/ask + stats)
  const fetchSnap = useCallback(async (s: string) => {
    try {
      const res = await fetch(`/api/market/snapshot?symbol=${s}`);
      if (res.ok) { setSnap(await res.json()); setLiveError(false); }
    } catch {}
  }, []);

  // Load on symbol/tf change
  useEffect(() => { fetchBars(sym, tf); fetchSnap(sym); }, [sym, tf, fetchBars, fetchSnap]);

  // Poll snapshot every 2 s for live price
  useEffect(() => {
    const id = setInterval(() => fetchSnap(sym), 2000);
    return () => clearInterval(id);
  }, [sym, fetchSnap]);

  // Poll bars every 30 s (new candle)
  useEffect(() => {
    const id = setInterval(() => fetchBars(sym, tf), 30000);
    return () => clearInterval(id);
  }, [sym, tf, fetchBars]);

  // Effective price from snap or last bar
  const price = snap?.price ?? bars[bars.length-1]?.c ?? 70000;
  const high24 = snap?.high ?? Math.max(...(bars.length?bars.map(b=>b.h):[price]));
  const low24  = snap?.low  ?? Math.min(...(bars.length?bars.map(b=>b.l):[price]));
  const vol24  = snap?.volume ?? bars.reduce((a,b)=>a+b.v,0);
  const pct = snap?.changePct ?? (bars.length>1 ? (bars[bars.length-1].c-bars[0].o)/bars[0].o*100 : 0);
  const isUp = pct >= 0;

  // Use bars for chart if we have them, else fallback
  const chartBars = bars.length > 0 ? bars : genFallbackCandles(sym, tf, 120);

  const runResearch = useCallback(async (s: string) => {
    if (running) { abortRef.current?.abort(); setRunning(false); return; }
    const sym2=s.trim().toUpperCase(); if(!sym2) return;
    setSym(sym2); setRunning(true); setMessages(new Map()); setThesis(null);
    setStatusMsg("Connecting…");
    const ctrl=new AbortController(); abortRef.current=ctrl;
    try {
      const res=await fetch("/api/research",{
        method:"POST",headers:{"Content-Type":"application/json"},
        body:JSON.stringify({symbol:sym2,crisis}),signal:ctrl.signal,
      });
      const reader=res.body?.getReader(); if(!reader) throw new Error("No body");
      const dec=new TextDecoder(); let buf="";
      while(true){
        const{value,done}=await reader.read(); if(done) break;
        buf+=dec.decode(value,{stream:true});
        const lines=buf.split("\n"); buf=lines.pop()??"";
        for(const line of lines){
          if(!line.trim()) continue;
          try{
            const ev=JSON.parse(line);
            if(ev.type==="status") setStatusMsg(ev.step??"");
            else if(ev.type==="agent_message"&&ev.message) setMessages(p=>new Map(p).set(ev.message.role,ev.message));
            else if(ev.type==="thesis"&&ev.thesis) setThesis(ev.thesis);
            else if(ev.type==="done") setStatusMsg("");
          }catch{}
        }
      }
    }catch(e:any){if(e?.name!=="AbortError") setStatusMsg("Failed");}
    finally{setRunning(false);}
  },[running,crisis]);

  const dirColor=thesis?(thesis.direction==="BUY"?G:thesis.direction==="SELL"?R:AMB):G;
  const now=new Date();
  const timeStr=now.toLocaleTimeString("en",{hour:"2-digit",minute:"2-digit",second:"2-digit",hour12:false})+" (UTC+6:30)";

  return (
    <>
      <style>{`
        *{box-sizing:border-box;margin:0;padding:0}
        html,body{height:100%;background:${BG};color:${TXT};font-family:-apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif}
        ::-webkit-scrollbar{width:3px;height:3px}::-webkit-scrollbar-track{background:transparent}::-webkit-scrollbar-thumb{background:${BRD};border-radius:2px}
        input:focus,select:focus{outline:none}button{cursor:pointer;font-family:inherit}
        @keyframes pulse{0%,100%{opacity:1}50%{opacity:0.4}}
        @keyframes slideUp{from{opacity:0;transform:translateY(3px)}to{opacity:1;transform:translateY(0)}}
        @keyframes spin{to{transform:rotate(360deg)}}
        .tb-btn:hover{color:${TXT}!important;background:${PN2}!important}
        .nav-item:hover{color:${TXT}!important}
      `}</style>

      <div className="h-full w-full max-w-[1600px] mx-auto">
      <div style={{ display:"flex",flexDirection:"column",height:"100%",minWidth:0,overflow:"hidden",background:BG }}>

        {/* TOP HEADER */}
        <div style={{ display:"flex",alignItems:"center",background:PNL,borderBottom:`1px solid ${BRD}`,height:44,flexShrink:0,padding:"0 8px",gap:4 }}>
          <div style={{ width:28,height:28,borderRadius:"50%",background:"linear-gradient(135deg,#6366f1,#06b6d4)",display:"flex",alignItems:"center",justifyContent:"center",fontSize:12,fontWeight:800,color:"#fff",marginRight:4,flexShrink:0 }}>R</div>
          <div style={{ display:"flex",alignItems:"center",gap:6,background:PN2,padding:"4px 10px",borderRadius:6,cursor:"pointer",flexShrink:0,border:`1px solid ${BRD}` }}>
            <div style={{ width:16,height:16,borderRadius:"50%",background:ORG,display:"flex",alignItems:"center",justifyContent:"center",fontSize:8,fontWeight:800,color:"#fff" }}>₿</div>
            <span style={{ fontSize:13,fontWeight:700 }}>{sym}-USD</span>
            <span style={{ fontSize:9,color:DIM }}>▾</span>
          </div>
          {/* Stats strip */}
          {[
            { lbl:"LAST PRICE", val:`$${price.toLocaleString("en",{minimumFractionDigits:2,maximumFractionDigits:2})}`, extra:`${isUp?"+":""}${pct.toFixed(2)}%`, ec:isUp?G:R },
            { lbl:"24H VOLUME", val:`$${(vol24*price/1e6).toFixed(2)}M` },
            { lbl:"24H HIGH", val:`$${high24.toFixed(2)}` },
            { lbl:"24H LOW", val:`$${low24.toFixed(2)}` },
          ].map(s=>(
            <div key={s.lbl} style={{ padding:"0 10px",borderRight:`1px solid ${BRD}` }}>
              <div style={{ fontSize:8.5,color:DIM,textTransform:"uppercase" as any,letterSpacing:"0.05em" }}>{s.lbl}</div>
              <div style={{ fontSize:11.5,fontWeight:600,fontFamily:"monospace",display:"flex",gap:5,alignItems:"baseline" }}>
                <span>{s.val}</span>{s.extra&&<span style={{ fontSize:11,color:s.ec }}>{s.extra}</span>}
              </div>
            </div>
          ))}
          {liveError && <span style={{ fontSize:9,color:AMB,padding:"2px 6px",background:`${AMB}18`,borderRadius:4 }}>⚠ synthetic data</span>}
          <div style={{ flex:1 }}/>
          <button style={{ padding:"5px 12px",borderRadius:6,background:PN2,border:`1px solid ${BRD}`,color:TXT,fontSize:12,fontWeight:600 }}>Transfer</button>
          {["🔔","?","⊞"].map(ic=>(
            <button key={ic} className="tb-btn" style={{ width:28,height:28,background:"transparent",border:"none",color:DIM,fontSize:13,display:"flex",alignItems:"center",justifyContent:"center",borderRadius:4,transition:"all 0.15s" }}>{ic}</button>
          ))}
          <div style={{ width:28,height:28,borderRadius:"50%",background:BLU,display:"flex",alignItems:"center",justifyContent:"center",fontSize:11,fontWeight:700,color:"#fff",marginLeft:2 }}>S</div>
        </div>

        {/* INFO BANNER */}
        {banner&&(
          <div style={{ display:"flex",alignItems:"center",gap:8,padding:"5px 12px",background:"#091e3a",borderBottom:`1px solid #173261`,flexShrink:0 }}>
            <span style={{ fontSize:13 }}>ℹ️</span>
            <div style={{ flex:1,fontSize:12 }}>
              <span style={{ fontWeight:600 }}>Alpaca Hackathon — Razorstack Trading</span>
              <span style={{ color:DIM }}> Live market data powered by </span>
              <span style={{ color:BLU }}>Alpaca Markets API</span>
            </div>
            <button onClick={()=>setBanner(false)} style={{ background:"transparent",border:"none",color:DIM,fontSize:18,cursor:"pointer",lineHeight:1 }}>×</button>
          </div>
        )}

        <div style={{ flex:1,display:"flex",overflow:"hidden",minWidth:0 }}>

          {/* CHART PANEL */}
          <div style={{ flex:1,display:"flex",flexDirection:"column",overflow:"hidden",minWidth:0 }}>

            {/* Chart tabs */}
            <div style={{ display:"flex",alignItems:"center",background:PNL,borderBottom:`1px solid ${BRD}`,height:34,flexShrink:0,paddingLeft:8 }}>
              {(["price","depth"] as ChartTab[]).map(t=>(
                <button key={t} onClick={()=>setChartTab(t)} style={{
                  padding:"0 14px",height:"100%",background:"transparent",border:"none",
                  borderBottom:chartTab===t?`2px solid ${BLU}`:"2px solid transparent",
                  color:chartTab===t?TXT:DIM,fontSize:12,fontWeight:chartTab===t?600:400,marginBottom:-1,cursor:"pointer",
                }}>{t==="price"?"Price chart":"Depth chart"}</button>
              ))}
            </div>

            {/* Chart toolbar */}
            <div style={{ display:"flex",alignItems:"center",gap:2,padding:"0 8px",borderBottom:`1px solid ${BRD}`,height:36,flexShrink:0,background:PNL }}>
              <div style={{ display:"flex",alignItems:"center",background:PN2,border:`1px solid ${BRD}`,borderRadius:4,padding:"2px 8px",fontSize:12,color:TXT,cursor:"pointer",gap:4,marginRight:4 }}>
                {tf} <span style={{ fontSize:9,color:DIM }}>▾</span>
              </div>
              <div style={{ width:1,height:16,background:BRD }}/>
              {[{icon:"⊕",t:"Crosshair"},{icon:"∥",t:"Bar type"},{icon:"←",t:"Back"}].map(t=>(
                <button key={t.icon} className="tb-btn" title={t.t} style={{ width:26,height:26,background:"transparent",border:"none",color:DIM,fontSize:14,display:"flex",alignItems:"center",justifyContent:"center",borderRadius:4,transition:"all 0.15s" }}>{t.icon}</button>
              ))}
              <button className="tb-btn" style={{ background:"transparent",border:"none",color:DIM,fontSize:12,padding:"0 6px",display:"flex",alignItems:"center",gap:3,borderRadius:4,transition:"all 0.15s" }}>
                <span style={{ fontSize:10 }}>⊹</span> Indicators
              </button>
              <div style={{ flex:1 }}/>
              {[{icon:"✦",t:"Alerts"},{icon:"⚙",t:"Chart settings",action:()=>setModal("chart_settings")},{icon:"⊡",t:"Fullscreen"},{icon:"📷",t:"Snapshot"}].map(t=>(
                <button key={t.icon} className="tb-btn" title={t.t} onClick={t.action}
                  style={{ width:26,height:26,background:"transparent",border:"none",color:DIM,fontSize:14,display:"flex",alignItems:"center",justifyContent:"center",borderRadius:4,transition:"all 0.15s" }}>{t.icon}</button>
              ))}
            </div>

            {/* Live chart */}
            {loading ? (
              <div style={{ flex:1,display:"flex",alignItems:"center",justifyContent:"center",background:PN3,flexDirection:"column",gap:10 }}>
                <div style={{ width:22,height:22,border:`2px solid ${BRD}`,borderTop:`2px solid ${BLU}`,borderRadius:"50%",animation:"spin 0.8s linear infinite" }}/>
                <span style={{ fontSize:11,color:DIM }}>Loading live data from Alpaca…</span>
              </div>
            ) : <CandleChart bars={chartBars} live={!liveError}/>}

            {/* Bottom timeframe bar */}
            <div style={{ display:"flex",alignItems:"center",gap:1,padding:"0 8px",borderTop:`1px solid ${BRD}`,height:30,flexShrink:0,background:PNL }}>
              {(["6M","3M","1M","5D","1D","4H","1H"] as const).map(t=>(
                <button key={t} onClick={()=>{
                  if(t==="1H") setTf("1H");
                  else if(t==="4H") setTf("4H");
                  else if(t==="1D") setTf("1D");
                }} style={{
                  padding:"2px 7px",borderRadius:3,
                  background:t===tf||((t==="1D"&&tf==="1D")||(t==="4H"&&tf==="4H")||(t==="1H"&&tf==="1H"))?PN2:"transparent",
                  border:"none",color:DIM,fontSize:11,cursor:"pointer",
                }}>{t}</button>
              ))}
              <button style={{ width:22,height:22,background:"transparent",border:"none",color:DIM,fontSize:12,cursor:"pointer" }}>→</button>
              <div style={{ flex:1 }}/>
              <button onClick={()=>setModal("go_to")} style={{ background:"transparent",border:"none",color:DIM,fontSize:10,cursor:"pointer",fontFamily:"monospace" }}>{timeStr}</button>
              <div style={{ width:1,height:12,background:BRD,margin:"0 4px" }}/>
              {["%","LOG","AUTO"].map(b=>(
                <button key={b} className="tb-btn" style={{ padding:"2px 5px",background:"transparent",border:"none",color:DIM,fontSize:10,borderRadius:3,transition:"all 0.15s" }}>{b}</button>
              ))}
            </div>
          </div>

          {/* ORDER BOOK */}
          <div style={{ width:215,borderLeft:`1px solid ${BRD}`,display:"flex",flexDirection:"column",flexShrink:0 }}>
            <div style={{ display:"flex",borderBottom:`1px solid ${BRD}`,height:34,flexShrink:0 }}>
              {(["order_book","trade_history"] as BookTab[]).map(t=>(
                <button key={t} onClick={()=>setBookTab(t)} style={{
                  flex:1,background:"transparent",border:"none",
                  borderBottom:bookTab===t?`2px solid ${BLU}`:"2px solid transparent",
                  color:bookTab===t?TXT:DIM,fontSize:10.5,cursor:"pointer",fontWeight:bookTab===t?600:400,marginBottom:-1,
                }}>{t==="order_book"?"Order book":"Trade history"}</button>
              ))}
            </div>
            <div style={{ display:"flex",alignItems:"center",justifyContent:"space-between",padding:"5px 8px",borderBottom:`1px solid ${BRD}`,flexShrink:0 }}>
              <button style={{ width:20,height:20,background:PN2,border:`1px solid ${BRD}`,color:TXT,fontSize:14,borderRadius:3,display:"flex",alignItems:"center",justifyContent:"center" }}>−</button>
              <span style={{ fontSize:12,fontFamily:"monospace" }}>0.01</span>
              <button style={{ width:20,height:20,background:PN2,border:`1px solid ${BRD}`,color:TXT,fontSize:14,borderRadius:3,display:"flex",alignItems:"center",justifyContent:"center" }}>+</button>
            </div>
            <div style={{ flex:1,overflow:"hidden" }}>
              {bookTab==="order_book"?<OrderBook snap={snap}/>:
                <div style={{ padding:12,color:DIM,fontSize:11,textAlign:"center" as any,marginTop:20 }}>Trade history</div>
              }
            </div>
          </div>

          {/* ORDER FORM */}
          <div style={{ width:224,borderLeft:`1px solid ${BRD}`,display:"flex",flexDirection:"column",flexShrink:0,overflow:"hidden" }}>
            <div style={{ padding:"8px 10px",borderBottom:`1px solid ${BRD}`,flexShrink:0 }}>
              <div style={{ fontSize:11,color:DIM,marginBottom:5 }}>Available to trade</div>
              {[{lbl:sym},{lbl:"USDC"}].map(r=>(
                <div key={r.lbl} style={{ display:"flex",justifyContent:"space-between",marginBottom:1 }}>
                  <span style={{ fontSize:12 }}>{r.lbl} <span style={{ color:DIM,fontSize:9 }}>?</span></span>
                  <span style={{ fontSize:12,fontFamily:"monospace" }}>0</span>
                </div>
              ))}
            </div>
            <div style={{ display:"flex",height:36,borderBottom:`1px solid ${BRD}`,flexShrink:0 }}>
              {(["buy","sell"] as Side[]).map(s=>(
                <button key={s} onClick={()=>setSide(s)} style={{
                  flex:1,background:side===s?(s==="buy"?`${G}15`:`${R}15`):"transparent",
                  border:"none",borderBottom:side===s?`2px solid ${s==="buy"?G:R}`:"2px solid transparent",
                  color:side===s?(s==="buy"?G:R):DIM,fontSize:13,fontWeight:600,cursor:"pointer",marginBottom:-1,textTransform:"capitalize" as any,
                }}>{s}</button>
              ))}
            </div>
            <div style={{ display:"flex",gap:2,padding:"5px 6px",borderBottom:`1px solid ${BRD}`,flexShrink:0 }}>
              {(["LIMIT","MARKET","STOP LIMIT"] as OType[]).map(t=>(
                <button key={t} onClick={()=>setOType(t)} style={{
                  flex:t==="STOP LIMIT"?1.4:1,padding:"3px 0",borderRadius:3,
                  background:oType===t?PN2:"transparent",border:`1px solid ${oType===t?BRD:"transparent"}`,
                  color:oType===t?TXT:DIM,fontSize:9.5,fontWeight:600,cursor:"pointer",
                }}>{t}</button>
              ))}
            </div>
            <div style={{ flex:1,overflowY:"auto",padding:"8px 8px" }}>
              {oType!=="MARKET"&&(
                <div style={{ marginBottom:8 }}>
                  <div style={{ fontSize:9,color:DIM,textTransform:"uppercase" as any,letterSpacing:"0.07em",marginBottom:4 }}>LIMIT PRICE</div>
                  <div style={{ display:"flex",alignItems:"center",justifyContent:"space-between",background:PN3,border:`1px solid ${BRD}`,borderRadius:4,padding:"5px 8px" }}>
                    <span style={{ fontSize:13,fontFamily:"monospace",fontWeight:600 }}>{price.toFixed(2)}</span>
                    <span style={{ fontSize:11,color:DIM }}>USDC</span>
                  </div>
                  <div style={{ display:"flex",gap:3,marginTop:4 }}>
                    {["MID","BID","1%↓","5%↓"].map(b=>(
                      <button key={b} style={{ flex:1,padding:"3px 0",background:PN2,border:`1px solid ${BRD}`,color:DIM,fontSize:9,borderRadius:3 }}>{b}</button>
                    ))}
                  </div>
                </div>
              )}
              <div style={{ marginBottom:8 }}>
                <div style={{ fontSize:9,color:DIM,textTransform:"uppercase" as any,letterSpacing:"0.07em",marginBottom:4 }}>AMOUNT</div>
                <div style={{ display:"flex",alignItems:"center",justifyContent:"space-between",background:PN3,border:`1px solid ${BRD}`,borderRadius:4,padding:"5px 8px" }}>
                  <span style={{ fontSize:13,fontFamily:"monospace" }}>0.00000000</span>
                  <span style={{ fontSize:11,color:DIM }}>{sym}</span>
                </div>
                <div style={{ display:"flex",gap:3,marginTop:4 }}>
                  {["25%","50%","MAX"].map(b=>(
                    <button key={b} style={{ flex:1,padding:"3px 0",background:PN2,border:`1px solid ${BRD}`,color:DIM,fontSize:10,borderRadius:3 }}>{b}</button>
                  ))}
                </div>
              </div>
              <div style={{ display:"flex",justifyContent:"space-between",padding:"4px 0",borderBottom:`1px solid ${BRD}20`,marginBottom:4 }}>
                <span style={{ fontSize:11,color:DIM }}>PAY WITH</span><span style={{ fontSize:11 }}>USDC</span>
              </div>
              <div style={{ display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:6 }}>
                <span style={{ fontSize:11,color:DIM }}>EXECUTION</span>
                <div style={{ position:"relative" }}>
                  <select style={{ background:PN2,border:`1px solid ${BRD}`,color:TXT,fontSize:10,padding:"2px 22px 2px 6px",borderRadius:3,cursor:"pointer",outline:"none",appearance:"none" as any }}>
                    <option>ALLOW TAKER</option><option>MAKER ONLY</option>
                  </select>
                  <span style={{ position:"absolute",right:5,top:"50%",transform:"translateY(-50%)",color:DIM,fontSize:8,pointerEvents:"none" }}>▾</span>
                </div>
              </div>
              <div style={{ display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:10 }}>
                <span style={{ fontSize:11,color:DIM }}>TIME IN FORCE</span>
                <div style={{ position:"relative" }}>
                  <select style={{ background:PN2,border:`1px solid ${BRD}`,color:TXT,fontSize:10,padding:"2px 22px 2px 6px",borderRadius:3,cursor:"pointer",outline:"none",appearance:"none" as any }}>
                    <option>GOOD TIL CANCELED</option><option>FILL OR KILL</option><option>IMMEDIATE OR CANCEL</option>
                  </select>
                  <span style={{ position:"absolute",right:5,top:"50%",transform:"translateY(-50%)",color:DIM,fontSize:8,pointerEvents:"none" }}>▾</span>
                </div>
              </div>
              {[["SUBTOTAL","--"],["FEE","--"],["TOTAL","--"]].map(([l,v])=>(
                <div key={l} style={{ display:"flex",justifyContent:"space-between",marginBottom:3 }}>
                  <span style={{ fontSize:11,color:DIM }}>{l}</span><span style={{ fontSize:11,color:DIM }}>{v}</span>
                </div>
              ))}
              <button style={{
                width:"100%",padding:"11px 0",marginTop:10,borderRadius:8,
                background:side==="buy"?`linear-gradient(135deg,${G},#00966a)`:`linear-gradient(135deg,${R},#b91c1c)`,
                border:"none",color:"#000",fontSize:13,fontWeight:800,cursor:"pointer",
              }}>Add funds to continue</button>
              <div style={{ fontSize:9,color:DIM,textAlign:"center" as any,marginTop:5 }}>
                Crypto markets are unique. <span style={{ color:BLU,cursor:"pointer" }}>View more</span>
              </div>

              {/* AI Research panel */}
              <div style={{ marginTop:14,paddingTop:12,borderTop:`1px solid ${BRD}` }}>
                <div style={{ fontSize:9,color:DIM,textTransform:"uppercase" as any,letterSpacing:"0.07em",marginBottom:6 }}>AI Research</div>
                <div style={{ display:"flex",gap:3,marginBottom:6 }}>
                  <input value={inputSym} onChange={e=>setInputSym(e.target.value.toUpperCase())}
                    onKeyDown={e=>e.key==="Enter"&&runResearch(inputSym)}
                    placeholder="Symbol" style={{ flex:1,background:PN3,border:`1px solid ${BRD}`,color:TXT,fontSize:12,padding:"4px 6px",borderRadius:4,fontFamily:"monospace" }}/>
                </div>
                <div style={{ display:"flex",gap:3,flexWrap:"wrap" as any,marginBottom:6 }}>
                  {SYMS.map(s=>(
                    <button key={s} onClick={()=>{setInputSym(s);setSym(s);}} style={{
                      padding:"2px 5px",borderRadius:3,fontSize:9,fontWeight:600,
                      background:sym===s?PN2:"transparent",border:`1px solid ${sym===s?BLU:BRD}`,
                      color:sym===s?BLU:DIM,cursor:"pointer",
                    }}>{s}</button>
                  ))}
                </div>
                <button onClick={()=>runResearch(inputSym)} style={{
                  width:"100%",padding:"7px 0",borderRadius:6,
                  background:running?BRD:(crisis?`linear-gradient(135deg,${R},#b91c1c)`:BLU),
                  border:"none",color:running?DIM:"#fff",fontSize:11,fontWeight:700,cursor:"pointer",
                }}>{running?`⟳ ${statusMsg||"Running..."}`:crisis?"⚠ Crisis Research →":"Run Research →"}</button>
                {thesis&&(
                  <div style={{ marginTop:10,padding:8,background:PN2,borderRadius:6,animation:"slideUp 0.3s ease" }}>
                    <div style={{ display:"flex",justifyContent:"space-between",marginBottom:4 }}>
                      <span style={{ fontSize:10,color:DIM }}>CIO Verdict · {thesis.symbol}</span>
                      <span style={{ fontSize:11,fontWeight:800,color:dirColor,background:`${dirColor}18`,padding:"1px 6px",borderRadius:3 }}>{thesis.direction}</span>
                    </div>
                    <div style={{ fontSize:10,color:"#94a3b8",lineHeight:1.5 }}>{thesis.summary?.slice(0,120)}...</div>
                    <div style={{ marginTop:6 }}>
                      <div style={{ display:"flex",justifyContent:"space-between",marginBottom:2 }}>
                        <span style={{ fontSize:9,color:DIM }}>Confidence</span>
                        <span style={{ fontSize:9,color:dirColor,fontWeight:700 }}>{thesis.confidence}%</span>
                      </div>
                      <div style={{ height:3,background:BRD,borderRadius:2 }}>
                        <div style={{ height:"100%",background:dirColor,width:`${thesis.confidence}%`,borderRadius:2,transition:"width 0.8s ease" }}/>
                      </div>
                    </div>
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>

        {/* BOTTOM ORDERS TABLE */}
        <div style={{ borderTop:`1px solid ${BRD}`,background:PNL,flexShrink:0,maxHeight:170,overflowY:"auto" }}>
          <div style={{ display:"flex",alignItems:"center",padding:"5px 10px",gap:8,borderBottom:`1px solid ${BRD}`,position:"sticky",top:0,background:PNL,zIndex:2 }}>
            <span style={{ fontSize:12,fontWeight:600 }}>Orders</span>
            <span style={{ fontSize:9,color:DIM }}>?</span>
            <div style={{ flex:1 }}/>
            <span style={{ fontSize:11,color:R,cursor:"pointer" }}>Cancel all</span>
            <span style={{ fontSize:11,color:BLU,cursor:"pointer" }}>View all</span>
            {["ALL MARKETS ▼","ALL STATUSES ▼","⌄"].map(b=>(
              <button key={b} style={{ padding:"2px 8px",background:PN2,border:`1px solid ${BRD}`,color:TXT,fontSize:10,borderRadius:4 }}>{b}</button>
            ))}
          </div>
          {messages.size>0?(
            <>
              <div style={{ display:"grid",gridTemplateColumns:"90px 80px 55px 50px 1fr 70px 70px",padding:"3px 10px",borderBottom:`1px solid ${BRD}`,gap:6 }}>
                {["TIME PLACED","NAME","TYPE","SIDE","PRICE","AMOUNT","STATUS"].map(h=>(
                  <div key={h} style={{ fontSize:8.5,color:DIM,textTransform:"uppercase" as any }}>{h}</div>
                ))}
              </div>
              {Array.from(messages.values()).map((msg:any)=>(
                <div key={msg.role} style={{ display:"grid",gridTemplateColumns:"90px 80px 55px 50px 1fr 70px 70px",padding:"5px 10px",gap:6,alignItems:"center",borderBottom:`1px solid ${BRD}15`,animation:"slideUp 0.2s ease" }}>
                  <div style={{ fontSize:10,color:DIM }}>{new Date().toLocaleTimeString()}</div>
                  <div style={{ fontSize:11,fontWeight:600,overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap" as any }}>{msg.role.replace(/_/g," ")}</div>
                  <div style={{ fontSize:10,color:DIM }}>LIMIT</div>
                  <div style={{ fontSize:10,fontWeight:700,color:msg.stance==="bullish"?G:R }}>{msg.stance==="bullish"?"BUY":"SELL"}</div>
                  <div style={{ fontSize:10,fontFamily:"monospace" }}>{price.toFixed(2)}</div>
                  <div style={{ fontSize:10,fontFamily:"monospace" }}>{((msg.confidence??50)/10000).toFixed(6)}</div>
                  <div style={{ fontSize:9,color:G,background:`${G}15`,padding:"2px 5px",borderRadius:3,textAlign:"center" as any }}>Filled</div>
                </div>
              ))}
            </>
          ):(
            <div style={{ display:"flex",flexDirection:"column",alignItems:"center",padding:"18px 0",color:DIM }}>
              <div style={{ fontSize:28,marginBottom:6 }}>⊟</div>
              <div style={{ fontSize:12 }}>No orders</div>
            </div>
          )}
        </div>
      </div>
      </div>

      {modal==="chart_settings"&&<ChartSettingsModal onClose={()=>setModal("none")}/>}
      {modal==="go_to"&&<GoToModal onClose={()=>setModal("none")}/>}
    </>
  );
}
