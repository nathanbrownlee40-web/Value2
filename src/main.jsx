import React, {useMemo, useState} from "react";
import {createRoot} from "react-dom/client";
import "./style.css";

const marketOptions=[
  ["all","All markets"],["h2h","Match Result"],["totals","Goals O/U"],["btts","BTTS"],
  ["alternate_totals_corners","Corners O/U"],["alternate_spreads_corners","Corner Handicap"],["alternate_team_totals_corners","Team Corners"],
  ["alternate_totals_cards","Cards O/U"],["alternate_spreads_cards","Card Handicap"],["player_shots","Player Shots"],
  ["player_shots_on_target","Shots on Target"],["player_to_receive_card","Player Cards"]
];
const today=()=>new Date().toISOString().slice(0,10);
const fmtDate=d=>new Date(d).toLocaleDateString("en-GB", {weekday:"short",day:"2-digit",month:"short",year:"numeric",timeZone:"Europe/London"});
const fmtTime=d=>new Date(d).toLocaleTimeString("en-GB", {hour:"2-digit",minute:"2-digit",hour12:false,timeZone:"Europe/London"});

function App(){
 const [from,setFrom]=useState(today()),[to,setTo]=useState(today()),[competition,setCompetition]=useState("all"),[market,setMarket]=useState("all"),[region,setRegion]=useState("uk"),[minValue,setMinValue]=useState(3),[maxGames,setMaxGames]=useState(8),[confidence,setConfidence]=useState("ALL");
 const [rows,setRows]=useState([]),[meta,setMeta]=useState(null),[loading,setLoading]=useState(false),[error,setError]=useState("");
 async function scan(){
   if(from>to){setError("FROM date cannot be after TO date.");return;}
   setLoading(true);setError("");
   try{
     const p=new URLSearchParams({from,to,league:competition,markets:market,minValue:String(minValue),maxGames:String(maxGames),region});
     const r=await fetch(`/api/scanner?${p}`); const j=await r.json();
     if(!r.ok) throw new Error(j.error||"Scan failed");
     setRows(j.rows||[]);setMeta(j);
   }catch(e){setError(e.message)}finally{setLoading(false)}
 }
 const competitions=useMemo(()=>{
   const base=[{key:"all",title:"All competitions"},{key:"major",title:"⭐ Major leagues + cups"}];
   const dynamic=(meta?.competitions||[]).map(x=>({key:x.key,title:x.title}));
   const seen=new Set();return [...base,...dynamic].filter(x=>!seen.has(x.key)&&seen.add(x.key));
 },[meta]);
 const shown=useMemo(()=>rows.filter(r=>confidence==="ALL"||r.confidence===confidence),[rows,confidence]);
 return <div className="app">
  <header><div><div className="eyebrow">LIVE FOOTBALL VALUE ENGINE</div><h1>Bet Scanner <b>3.4</b></h1><p>Leagues + cup games • Goals • Corners • Shots • SOT • Cards • BTTS • Value</p></div><button onClick={scan} disabled={loading}>{loading?"SCANNING…":"SCAN NOW"}</button></header>
  <section className="filters">
   <div><label>FROM</label><input type="date" value={from} onChange={e=>setFrom(e.target.value)}/></div>
   <div><label>TO</label><input type="date" value={to} onChange={e=>setTo(e.target.value)}/></div>
   <div><label>COMPETITION</label><select value={competition} onChange={e=>setCompetition(e.target.value)}>{competitions.map(x=><option key={x.key} value={x.key}>{x.title}</option>)}</select></div>
   <div><label>MARKET</label><select value={market} onChange={e=>setMarket(e.target.value)}>{marketOptions.map(x=><option key={x[0]} value={x[0]}>{x[1]}</option>)}</select></div>
   <div><label>BOOKMAKER REGION</label><select value={region} onChange={e=>setRegion(e.target.value)}><option value="uk">UK bookmakers</option><option value="eu">EU bookmakers</option><option value="us">US bookmakers</option></select></div>
   <div><label>MIN VALUE %</label><input type="number" min="0" step="0.5" value={minValue} onChange={e=>setMinValue(e.target.value)}/></div>
   <div><label>MAX GAMES</label><select value={maxGames} onChange={e=>setMaxGames(e.target.value)}>{[4,6,8,10,12,16,20,25].map(n=><option key={n} value={n}>{n}</option>)}</select></div>
   <div><label>CONFIDENCE</label><select value={confidence} onChange={e=>setConfidence(e.target.value)}><option>ALL</option><option>VERY HIGH</option><option>HIGH</option><option>MEDIUM</option><option>LOW</option></select></div>
  </section>
  {error&&<div className="error">{error}</div>}
  <section className="stats"><div><strong>{shown.length}</strong><span>VALUE BETS</span></div><div><strong>{meta?.gamesFound??0}</strong><span>GAMES FOUND</span></div><div><strong>{meta?.eventsScanned??0}</strong><span>GAMES SCANNED</span></div><div><strong>{meta?.usage?.remaining??"—"}</strong><span>CREDITS LEFT</span></div></section>
  <div className="tip">{meta?.warning||"Fair odds are calculated from bookmaker market consensus. Specialist markets only appear when supplied by the API for the selected event and region."}</div>
  <main>{shown.length===0&&!loading?<div className="empty">No value bets found. Try a wider date range, All competitions, another market, or a lower value threshold.</div>:shown.map(r=><article className="card" key={r.id}>
   <div className="top"><div><div className="tags"><span className="tag">{r.marketLabel}</span><span className="league">{r.league}</span></div><h2>{r.selection}</h2><p>{r.home} <b>vs</b> {r.away}</p></div><span className={`confidence ${r.confidence.replace(" ","-").toLowerCase()}`}>{r.confidence}</span></div>
   <div className="event"><span>📅 {fmtDate(r.commence_time)}</span><span>🕒 {fmtTime(r.commence_time)}</span></div>
   <div className="grid"><div><small>BEST ODDS</small><strong>{Number(r.odds).toFixed(2)}</strong><em>{r.bookmaker}</em></div><div><small>FAIR ODDS</small><strong>{Number(r.fairOdds).toFixed(2)}</strong></div><div><small>PROBABILITY</small><strong>{(r.probability*100).toFixed(1)}%</strong></div><div><small>VALUE</small><strong className="green">+{(r.value*100).toFixed(1)}%</strong></div></div>
   <div className="meta">{r.point!==null&&r.point!==undefined?`Line: ${r.point} • `:""}Books compared: {r.books}</div>
  </article>)}</main>
  <footer>Bet Scanner 3.4 • The Odds API • Always verify the market and price at the bookmaker before betting.</footer>
 </div>
}
createRoot(document.getElementById("root")).render(<App/>);
