"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";

const GREEN = "#26a69a", RED = "#ef5350";
type Timeframe = "5m" | "15m" | "1H" | "4H" | "1D";
interface Bar { t:string; o:number; h:number; l:number; c:number; v:number }
interface Snapshot { price:number; bid:number; ask:number; open:number; high:number; low:number; volume:number; change:number; changePct:number }
interface Thesis { symbol:string; direction:"BUY"|"SELL"|"HOLD"; confidence:number; summary?:string }
interface ResearchEvent { type?:string; step?:string; thesis?:Thesis }

const SYMBOLS = ["BTC","ETH","SOL","NVDA","AAPL","MSFT","TSLA","SPY"];
const BASES:Record<string,number> = { BTC:70000,ETH:2650,SOL:175,NVDA:135,AAPL:195,MSFT:425,TSLA:250,SPY:555 };

function seededBars(symbol:string,timeframe:Timeframe,count=80):Bar[] {
  let seed=symbol.split("").reduce((sum,char)=>sum+char.charCodeAt(0),0)+timeframe.length*211;
  let price=BASES[symbol]??100;
  const random=()=>{seed=(seed*1664525+1013904223)>>>0;return seed/4294967296};
  return Array.from({length:count},(_,index)=>{const o=price,c=o*(1+(random()-.49)*.018),swing=random()*.006;price=c;return {t:new Date(Date.now()-(count-index)*60000).toISOString(),o,c,h:Math.max(o,c)*(1+swing),l:Math.min(o,c)*(1-swing),v:random()*900+40}});
}

function PriceChart({bars}:{bars:Bar[]}) {
  const width=900,height=390,pad=72,values=bars.flatMap(bar=>[bar.h,bar.l]);
  const min=Math.min(...values)*.999,max=Math.max(...values)*1.001,range=max-min||1;
  const x=(index:number)=>10+index*((width-pad-20)/Math.max(bars.length-1,1));
  const y=(price:number)=>14+(height-42)*(1-(price-min)/range);
  const candleWidth=Math.max(3,(width-pad)/bars.length-2);
  return <div className="quant-chart" aria-label="Price candlestick chart"><svg viewBox={`0 0 ${width} ${height}`} role="img">
    {[0,.25,.5,.75,1].map(step=>{const price=min+range*step;return <g key={step}><line x1="0" x2={width-pad} y1={y(price)} y2={y(price)} className="quant-chart__grid"/><text x={width-pad+10} y={y(price)+4} className="quant-chart__label">{price.toFixed(2)}</text></g>})}
    {bars.map((bar,index)=>{const color=bar.c>=bar.o?GREEN:RED,top=y(Math.max(bar.o,bar.c)),bodyHeight=Math.max(1,y(Math.min(bar.o,bar.c))-top);return <g key={`${bar.t}-${index}`}><line x1={x(index)} x2={x(index)} y1={y(bar.h)} y2={y(bar.l)} stroke={color}/><rect x={x(index)-candleWidth/2} y={top} width={candleWidth} height={bodyHeight} fill={color}/></g>})}
  </svg></div>;
}

function OrderBook({price,bid,ask}:{price:number;bid?:number;ask?:number}) {
  const levels=useMemo(()=>Array.from({length:6},(_,index)=>({ask:(ask??price*1.0005)+index*price*.0004,bid:(bid??price*.9995)-index*price*.0004,size:((index+1)*.0317).toFixed(4)})),[price,bid,ask]);
  return <section className="quant-card quant-book"><div className="quant-card__heading"><div><p className="eyebrow">Indicative</p><h2>Order book</h2></div><span className="data-pill is-synthetic">Synthetic depth</span></div>
    <div className="book-head"><span>Size</span><span>Ask</span></div>{[...levels].reverse().map(level=><div className="book-row" key={level.ask}><span>{level.size}</span><strong className="negative">{level.ask.toFixed(2)}</strong></div>)}
    <div className="book-mid"><strong>{price.toFixed(2)}</strong><span>Reference price</span></div>{levels.map(level=><div className="book-row" key={level.bid}><span>{level.size}</span><strong className="positive">{level.bid.toFixed(2)}</strong></div>)}
  </section>;
}

export default function QuantTerminal() {
  const [symbol,setSymbol]=useState("BTC"),[inputSymbol,setInputSymbol]=useState("BTC"),[timeframe,setTimeframe]=useState<Timeframe>("5m");
  const [bars,setBars]=useState<Bar[]>([]),[snapshot,setSnapshot]=useState<Snapshot|null>(null),[loading,setLoading]=useState(true),[synthetic,setSynthetic]=useState(false);
  const [running,setRunning]=useState(false),[researchStatus,setResearchStatus]=useState(""),[thesis,setThesis]=useState<Thesis|null>(null);
  const abortRef=useRef<AbortController|null>(null),snapshotPendingRef=useRef(false);

  const fetchMarket=useCallback(async(nextSymbol:string,nextTimeframe:Timeframe)=>{await Promise.resolve();setLoading(true);try{const [barsResponse,snapshotResponse]=await Promise.all([fetch(`/api/market/bars?symbol=${nextSymbol}&tf=${nextTimeframe}&limit=80`),fetch(`/api/market/snapshot?symbol=${nextSymbol}`)]);if(!barsResponse.ok)throw new Error("Market bars unavailable");const barsData=await barsResponse.json() as {bars?:Bar[]};if(!barsData.bars?.length)throw new Error("No market bars returned");setBars(barsData.bars);setSnapshot(snapshotResponse.ok?await snapshotResponse.json() as Snapshot:null);setSynthetic(false)}catch{setBars(seededBars(nextSymbol,nextTimeframe));setSnapshot(null);setSynthetic(true)}finally{setLoading(false)}},[]);
  // Fetching remote market state is the synchronization this effect owns.
  // eslint-disable-next-line react-hooks/set-state-in-effect
  useEffect(()=>{void fetchMarket(symbol,timeframe)},[symbol,timeframe,fetchMarket]);

  const refreshSnapshot=useCallback(async(nextSymbol:string)=>{if(snapshotPendingRef.current)return;snapshotPendingRef.current=true;try{const response=await fetch(`/api/market/snapshot?symbol=${nextSymbol}`,{cache:"no-store",signal:AbortSignal.timeout(6000)});if(!response.ok)return;const next=await response.json() as Snapshot;setSnapshot(next);setBars(current=>current.length?current.map((bar,index)=>index===current.length-1?{...bar,c:next.price,h:Math.max(bar.h,next.price),l:Math.min(bar.l,next.price)}:bar):current)}catch{/* Keep the last confirmed price during a transient refresh failure. */}finally{snapshotPendingRef.current=false}},[]);
  useEffect(()=>{const snapshotTimer=window.setInterval(()=>{void refreshSnapshot(symbol)},2000);const candleTimer=window.setInterval(()=>{void fetchMarket(symbol,timeframe)},30000);return()=>{window.clearInterval(snapshotTimer);window.clearInterval(candleTimer)}},[symbol,timeframe,refreshSnapshot,fetchMarket]);

  const runResearch=async()=>{if(running){abortRef.current?.abort();return}const nextSymbol=inputSymbol.trim().toUpperCase();if(!nextSymbol)return;setSymbol(nextSymbol);setRunning(true);setThesis(null);setResearchStatus("Connecting");const controller=new AbortController();abortRef.current=controller;try{const response=await fetch("/api/research",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({symbol:nextSymbol,crisis:false}),signal:controller.signal});if(!response.ok||!response.body)throw new Error("Research unavailable");const reader=response.body.getReader(),decoder=new TextDecoder();let buffer="";while(true){const {value,done}=await reader.read();if(done)break;buffer+=decoder.decode(value,{stream:true});const lines=buffer.split("\n");buffer=lines.pop()??"";for(const line of lines){if(!line.trim())continue;const event=JSON.parse(line) as ResearchEvent;if(event.type==="status")setResearchStatus(event.step??"Working");if(event.type==="thesis"&&event.thesis)setThesis(event.thesis)}}setResearchStatus("")}catch(error){if(!(error instanceof DOMException&&error.name==="AbortError"))setResearchStatus("Research failed. Try again.")}finally{setRunning(false)}};

  const price=snapshot?.price??bars.at(-1)?.c??BASES[symbol]??0;
  const changePct=snapshot?.changePct??(bars.length>1?((bars.at(-1)!.c-bars[0].o)/bars[0].o)*100:0);
  const high=bars.length?Math.max(...bars.map(bar=>bar.h)):price,low=bars.length?Math.min(...bars.map(bar=>bar.l)):price;

  return <div className="quant-page">
    <header className="quant-header"><div><p className="eyebrow">Quant workspace</p><h1>{symbol} <span>/ USD</span></h1></div><div className="quant-header__price"><strong>${price.toLocaleString(undefined,{maximumFractionDigits:2})}</strong><span className={changePct>=0?"positive":"negative"}>{changePct>=0?"+":""}{changePct.toFixed(2)}%</span></div><span className={`data-pill ${synthetic?"is-synthetic":"is-market"}`}><span className="live-dot"/>{loading?"Connecting":synthetic?"Synthetic fallback":"Live polling"}</span><span className="paper-badge">Paper trading only</span></header>
    <main className="quant-grid">
      <section className="quant-card quant-market"><div className="quant-card__heading quant-toolbar"><div><p className="eyebrow">Price chart</p><h2>{symbol} market</h2></div><div className="segmented" aria-label="Chart timeframe">{(["5m","15m","1H","4H","1D"] as Timeframe[]).map(item=><button type="button" key={item} className={timeframe===item?"is-active":""} onClick={()=>setTimeframe(item)}>{item}</button>)}</div></div>{loading?<div className="quant-loading"><span className="spinner"/>Loading market data…</div>:<PriceChart bars={bars}/>}<div className="market-stats"><div><span>24h high</span><strong>{(snapshot?.high??high).toFixed(2)}</strong></div><div><span>24h low</span><strong>{(snapshot?.low??low).toFixed(2)}</strong></div><div><span>Volume</span><strong>{(snapshot?.volume??bars.reduce((sum,bar)=>sum+bar.v,0)).toLocaleString(undefined,{maximumFractionDigits:0})}</strong></div></div></section>
      <section className="quant-card quant-research"><div className="quant-card__heading"><div><p className="eyebrow">Decision support</p><h2>AI research</h2></div><span className="data-pill">Not an order</span></div><label className="field-label" htmlFor="research-symbol">Market symbol</label><div className="research-input"><input id="research-symbol" value={inputSymbol} onChange={event=>setInputSymbol(event.target.value.toUpperCase())} onKeyDown={event=>{if(event.key==="Enter")void runResearch()}}/><button type="button" onClick={()=>void runResearch()}>{running?"Stop":"Run research"}</button></div><div className="symbol-list">{SYMBOLS.map(item=><button type="button" key={item} className={symbol===item?"is-active":""} onClick={()=>{setSymbol(item);setInputSymbol(item)}}>{item}</button>)}</div>{researchStatus&&<p className="research-status" role="status">{researchStatus}</p>}{thesis?<article className="thesis"><div><span>CIO thesis · {thesis.symbol}</span><strong className={thesis.direction==="BUY"?"positive":thesis.direction==="SELL"?"negative":""}>{thesis.direction}</strong></div><p>{thesis.summary||"Research complete."}</p><footer>Confidence <strong>{thesis.confidence}%</strong></footer></article>:<p className="empty-copy">Run the research desk for a thesis. Research results never create an order.</p>}</section>
      <OrderBook price={price} bid={snapshot?.bid} ask={snapshot?.ask}/>
      <section className="quant-card quant-orders"><div className="quant-card__heading"><div><p className="eyebrow">Activity</p><h2>Paper orders</h2></div></div><div className="orders-empty"><span aria-hidden="true">↗</span><strong>No paper orders yet</strong><p>AI research is kept separate from order activity.</p></div></section>
    </main>
  </div>;
}
