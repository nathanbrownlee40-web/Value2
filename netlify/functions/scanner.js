const API="https://api.the-odds-api.com/v4";
const WANTED=[
  "h2h","h2h_3_way","btts","btts_h1",
  "totals","alternate_totals","team_totals","alternate_team_totals",
  "alternate_totals_corners","alternate_team_totals_corners",
  "alternate_spreads_corners","alternate_totals_cards","alternate_spreads_cards",
  "player_shots","player_shots_on_target","player_to_receive_card"
];

const sleep=ms=>new Promise(r=>setTimeout(r,ms));
async function getJson(url){
  const r=await fetch(url);
  const text=await r.text();
  let data; try{data=JSON.parse(text)}catch{data={error:text||"Invalid API response"}}
  if(!r.ok) throw Object.assign(new Error(data.message||data.error||`API ${r.status}`),{status:r.status,details:data});
  return {data,headers:r.headers};
}
function marketFair(outcomes){
  const valid=outcomes.filter(x=>Number.isFinite(Number(x.price)) && Number(x.price)>1);
  if(valid.length<2) return null;
  const inv=valid.map(x=>1/Number(x.price));
  const sum=inv.reduce((a,b)=>a+b,0);
  return valid.map((x,i)=>({...x,prob:inv[i]/sum,fair:sum?sum/inv[i]:null}));
}
function normaliseEvent(e){
  const rows=[];
  for(const b of (e.bookmakers||[])){
    for(const m of (b.markets||[])){
      const outs=marketFair(m.outcomes||[]);
      if(!outs) continue;
      for(const o of outs){
        const name=o.description ? `${o.description} ${o.name}` : o.name;
        rows.push({
          market:m.key, selection:name, rawName:o.name, description:o.description||"",
          point:o.point ?? null, book:b.title, bookKey:b.key, odds:Number(o.price),
          fair:Number(o.fair), prob:Number(o.prob)
        });
      }
    }
  }
  return rows;
}
function makeValues(e){
  const raw=normaliseEvent(e);
  const groups=new Map();
  for(const x of raw){
    const key=[x.market,x.description,x.point].join("|");
    if(!groups.has(key)) groups.set(key,[]);
    groups.get(key).push(x);
  }
  const results=[];
  for(const [key,items] of groups){
    const bySelection=new Map();
    for(const x of items){
      if(!bySelection.has(x.rawName)) bySelection.set(x.rawName,[]);
      bySelection.get(x.rawName).push(x);
    }
    for(const [sel,quotes] of bySelection){
      const best=quotes.reduce((a,b)=>b.odds>a.odds?b:a);
      const fairProb=quotes.reduce((s,x)=>s+x.prob,0)/quotes.length;
      const fairOdds=1/fairProb;
      const value=best.odds/fairOdds-1;
      if(value<=0) continue;
      const uniqueBooks=new Set(quotes.map(q=>q.bookKey)).size;
      let confidence="LOW";
      if(value>=0.15 && uniqueBooks>=3 && fairProb>=0.50) confidence="HIGH";
      else if(value>=0.07 && uniqueBooks>=2) confidence="MEDIUM";
      results.push({
        id:[e.id,key,sel].join("-"), sport:e.sport_key, league:e.sport_title,
        eventId:e.id, home:e.home_team, away:e.away_team, commence:e.commence_time,
        market:xMarketName(items[0].market), marketKey:items[0].market,
        selection:sel, point:items[0].point, bookmaker:best.book, odds:best.odds,
        fairOdds, probability:fairProb, value, books:uniqueBooks, confidence
      });
    }
  }
  return results;
}
function xMarketName(k){
  const names={
    h2h:"Match Result",h2h_3_way:"Match Result",btts:"BTTS",btts_h1:"BTTS 1st Half",
    totals:"Goals",alternate_totals:"Goals",team_totals:"Team Goals",alternate_team_totals:"Team Goals",
    alternate_totals_corners:"Corners",alternate_team_totals_corners:"Team Corners",
    alternate_spreads_corners:"Corner Handicap",alternate_totals_cards:"Cards",
    alternate_spreads_cards:"Card Handicap",player_shots:"Player Shots",
    player_shots_on_target:"Shots on Target",player_to_receive_card:"Player Card"
  };
  return names[k]||k;
}
exports.handler=async(event)=>{
  const key=process.env.ODDS_API_KEY;
  const region=process.env.ODDS_API_REGION||"uk";
  const maxEvents=Math.min(Math.max(Number(process.env.SCAN_MAX_EVENTS||12),1),40);
  if(!key) return json(500,{error:"Missing ODDS_API_KEY in Netlify environment variables."});
  try{
    const sports=(await getJson(`${API}/sports/?apiKey=${encodeURIComponent(key)}`)).data;
    const soccer=sports.filter(s=>s.active && (s.group||"").toLowerCase().includes("soccer"));
    const events=[];
    for(const s of soccer.slice(0,25)){
      const list=(await getJson(`${API}/sports/${encodeURIComponent(s.key)}/events/?apiKey=${encodeURIComponent(key)}&dateFormat=iso`)).data||[];
      for(const e of list) events.push({...e,sport_key:s.key,sport_title:s.title});
      if(events.length>=maxEvents*2) break;
    }
    events.sort((a,b)=>new Date(a.commence_time)-new Date(b.commence_time));
    const selected=events.filter(e=>new Date(e.commence_time)>=new Date()).slice(0,maxEvents);
    const all=[];
    let remaining=null, used=null;
    for(const e of selected){
      const url=`${API}/sports/${encodeURIComponent(e.sport_key)}/events/${encodeURIComponent(e.id)}/odds/?apiKey=${encodeURIComponent(key)}&regions=${encodeURIComponent(region)}&markets=${encodeURIComponent(WANTED.join(","))}&oddsFormat=decimal`;
      try{
        const r=await getJson(url);
        remaining=r.headers.get("x-requests-remaining");
        used=r.headers.get("x-requests-used");
        all.push(...makeValues(r.data));
      }catch(err){
        if(err.status===401 || err.status===403) throw err;
      }
      await sleep(40);
    }
    all.sort((a,b)=>b.value-a.value);
    return json(200,{eventsScanned:selected.length,results:all,quota:{remaining,used},region,markets:WANTED});
  }catch(err){
    return json(err.status||502,{error:err.message||"Scanner request failed",details:err.details||null});
  }
};
function json(status,body){return {statusCode:status,headers:{"content-type":"application/json","cache-control":"no-store"},body:JSON.stringify(body)}}
