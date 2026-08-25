import React, {useEffect, useMemo, useState} from "react";
import {createRoot} from "react-dom/client";
import "./style.css";

const fmtOdds = n => Number(n).toFixed(2);
const pct = n => `${(n*100).toFixed(1)}%`;

function noVig(odds){
  const p = odds.map(o => 1/Number(o)).filter(Number.isFinite);
  const s = p.reduce((a,b)=>a+b,0);
  return p.map(x => x/s);
}

function scanEvents(data, minValue){
  const rows=[];
  const events = Array.isArray(data) ? data : (data?.events || []);
  for(const ev of events){
    const marketOutcomes = {};
    for(const book of (ev.bookmakers || [])){
      const h2h = (book.markets || []).find(m => m.key === "h2h");
      if(!h2h?.outcomes?.length) continue;
      const valid = h2h.outcomes.every(o => Number(o.price) > 1);
      if(!valid) continue;
      const probs = noVig(h2h.outcomes.map(o => Number(o.price)));
      h2h.outcomes.forEach((o,i)=>{
        (marketOutcomes[o.name] ||= []).push({book:book.title, price:Number(o.price), probability:probs[i]});
      });
    }

    for(const [outcome, quotes] of Object.entries(marketOutcomes)){
      if(quotes.length < 2) continue;
      const fairProb = quotes.reduce((sum,q)=>sum+q.probability,0)/quotes.length;
      if(!(fairProb > 0 && fairProb < 1)) continue;
      const fairOdds=1/fairProb;
      const best=quotes.reduce((a,b)=>b.price>a.price?b:a);
      const value=(best.price/fairOdds)-1;
      if(value >= minValue/100){
        rows.push({
          id:`${ev.id}-${outcome}`, sport:ev.sport_title || ev.sport_key || "", league:ev.league_title || ev.sport_title || ev.sport_key || "",
          home:ev.home_team, away:ev.away_team, commence:ev.commence_time,
          outcome, bookmaker:best.book, odds:best.price, fairOdds,
          probability:fairProb, value, books:quotes.length
        });
      }
    }
  }
  return rows.sort((a,b)=>b.value-a.value);
}

function App(){
  const [rows,setRows]=useState([]);
  const [loading,setLoading]=useState(false);
  const [error,setError]=useState("");
  const [minValue,setMinValue]=useState(3);
  const [sport,setSport]=useState("all");
  const [last,setLast]=useState(null);

  async function scan(){
    setLoading(true); setError("");
    try{
      const r=await fetch(`/api/odds`);
      const j=await r.json();
      if(!r.ok) throw new Error(j.error || `API request failed (${r.status})`);
      const scanned=scanEvents(j,minValue);
      setRows(sport === "all" ? scanned : scanned.filter(x => x.sport === sport));
      setLast(new Date());
    }catch(e){setError(e.message)}
    finally{setLoading(false)}
  }
  useEffect(()=>{scan()},[]);

  const sports=useMemo(()=>["all",...new Set(rows.map(x=>x.sport))],[rows]);

  return <div className="app">
    <header><div><div className="eyebrow">LIVE MARKET SCANNER</div><h1>Value Bet Scanner</h1>
    <p>Find bookmaker prices trading above the market-derived fair odds.</p></div>
    <button className="scan" onClick={scan} disabled={loading}>{loading?"SCANNING…":"SCAN NOW"}</button></header>

    <section className="controls">
      <label>Minimum value <input type="number" min="0" step=".5" value={minValue} onChange={e=>setMinValue(e.target.value)}/>%</label>
      <label>Sport <select value={sport} onChange={e=>setSport(e.target.value)}>
        {sports.map(s=><option key={s} value={s}>{s==="all"?"All sports":s}</option>)}
      </select></label>
      <div className="status">{last?`Updated ${last.toLocaleTimeString()}`:"Waiting for scan"}</div>
    </section>

    {error && <div className="error">{error}</div>}
    <div className="note">Fair odds are calculated from the available bookmaker market and margin-adjusted probabilities. They are an estimate, not a guarantee of profit.</div>

    <main>
      <div className="tableHead"><span>VALUE BET</span><span>BOOK</span><span>ODDS</span><span>FAIR ODDS</span><span>PROBABILITY</span><span>VALUE</span></div>
      {rows.length===0 && !loading ? <div className="empty">No bets currently meet {minValue}% value. Lower the filter or scan again.</div> :
      rows.map(r=><article className="row" key={r.id}>
        <div><strong>{r.outcome}</strong><small>{r.home} vs {r.away}<br/>{r.league}</small></div>
        <div>{r.bookmaker}<small>{r.books} prices checked</small></div>
        <div className="odds">{fmtOdds(r.odds)}</div>
        <div>{fmtOdds(r.fairOdds)}</div>
        <div>{pct(r.probability)}</div>
        <div className="value">+{(r.value*100).toFixed(1)}%</div>
      </article>)}
    </main>
    <footer>Built for Netlify • Odds are informational only • Always check bookmaker rules and market status.</footer>
  </div>
}
createRoot(document.getElementById("root")).render(<App/>);