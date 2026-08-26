const API = "https://api.the-odds-api.com/v4";

const MARKET_OPTIONS = [
  ["h2h", "Match Result"], ["totals", "Goals O/U"], ["btts", "BTTS"],
  ["alternate_totals", "Alternate Goals O/U"], ["alternate_totals_corners", "Corners O/U"],
  ["alternate_spreads_corners", "Corner Handicap"], ["alternate_team_totals_corners", "Team Corners"],
  ["alternate_totals_cards", "Cards O/U"], ["alternate_spreads_cards", "Card Handicap"],
  ["player_shots", "Player Shots"], ["player_shots_on_target", "Shots on Target"],
  ["player_to_receive_card", "Player Cards"]
];

// Major MEN'S competitions. The scanner defaults to this list so it does not
// waste requests looking through obscure youth, women's, reserve or regional leagues.
const MAJOR_KEYS = new Set([
  "soccer_epl", "soccer_england_efl_champ", "soccer_england_efl_cup", "soccer_fa_cup",
  "soccer_spain_la_liga", "soccer_spain_copa_del_rey", "soccer_germany_bundesliga", "soccer_germany_dfb_pokal",
  "soccer_italy_serie_a", "soccer_italy_coppa_italia", "soccer_france_ligue_one", "soccer_france_coupe_de_france",
  "soccer_netherlands_eredivisie", "soccer_netherlands_knvb_beker", "soccer_portugal_primeira_liga", "soccer_portugal_taca_de_portugal",
  "soccer_belgium_first_div", "soccer_spl", "soccer_turkey_super_league", "soccer_usa_mls",
  "soccer_brazil_campeonato", "soccer_argentina_primera_division", "soccer_saudi_arabia_pro_league",
  "soccer_uefa_champs_league", "soccer_uefa_europa_league", "soccer_uefa_europa_conference_league",
  "soccer_uefa_champs_league_qualification", "soccer_uefa_europa_league_qualification",
  "soccer_uefa_europa_conference_league_qualification", "soccer_fifa_world_cup", "soccer_fifa_world_cup_qualifiers_europe",
  "soccer_fifa_world_cup_qualifiers_south_america", "soccer_club_world_cup"
]);

const CACHE = globalThis.__VASCALI_CACHE || (globalThis.__VASCALI_CACHE = new Map());
const sleep = ms => new Promise(r => setTimeout(r, ms));

async function api(url, {cacheKey=null, cacheTtlMs=0, retries=2}={}) {
  if(cacheKey && cacheTtlMs){ const h=CACHE.get(cacheKey); if(h && Date.now()-h.at<cacheTtlMs) return h.value; }
  let last;
  for(let i=0;i<=retries;i++){
    try{
      const res=await fetch(url); const text=await res.text(); let data;
      try{data=JSON.parse(text)}catch{data={error:text}};
      if(res.status===429){
        if(i<retries){await sleep(1200*Math.pow(2,i));continue;}
        throw new Error("The Odds API is rate-limiting requests. Wait a moment and scan again.");
      }
      if(!res.ok) throw new Error(data?.message||data?.error||`Odds API HTTP ${res.status}`);
      const value={data,headers:res.headers};
      if(cacheKey&&cacheTtlMs) CACHE.set(cacheKey,{at:Date.now(),value});
      return value;
    }catch(e){last=e;if(i<retries&&/429|rate.?limit/i.test(String(e.message))){await sleep(1200*Math.pow(2,i));continue;}throw e;}
  }
  throw last||new Error("API request failed");
}

function ukBounds(date){
  // Europe/London changes between GMT and BST. These broad UTC bounds safely cover
  // the complete UK calendar date without accidentally dropping late-night games.
  const start=new Date(`${date}T00:00:00Z`);
  const end=new Date(`${date}T23:59:59Z`);
  return {from:start.toISOString(),to:end.toISOString()};
}
function price(x){return Number(x)}
function outcomeKey(o){return `${o.name||""}|${o.description||""}|${o.point??""}`}
function normalizeOutcomes(outcomes){
  const valid=outcomes.filter(o=>Number.isFinite(price(o.price))&&price(o.price)>1); if(valid.length<2)return null;
  const inv=valid.map(o=>1/price(o.price)); const sum=inv.reduce((a,b)=>a+b,0); if(!(sum>0))return null;
  const p=new Map(); valid.forEach((o,i)=>p.set(outcomeKey(o),inv[i]/sum)); return p;
}
function groupKey(m){const o=m.outcomes?.[0]||{};return `${m.key}|${o.description||""}|${o.point??""}`}

function buildRows(event){
  const groups=new Map();
  for(const bookmaker of event.bookmakers||[]) for(const market of bookmaker.markets||[]){
    const outcomes=(market.outcomes||[]).filter(o=>Number.isFinite(price(o.price))&&price(o.price)>1);
    if(outcomes.length<2) continue;
    const k=groupKey(market); if(!groups.has(k))groups.set(k,[]); groups.get(k).push({bookmaker,market,outcomes});
  }
  const rows=[];
  for(const [gk,books] of groups){
    if(books.length<2) continue;
    const samples=new Map();
    for(const entry of books){
      const probs=normalizeOutcomes(entry.outcomes); if(!probs)continue;
      for(const o of entry.outcomes){const p=probs.get(outcomeKey(o));if(!(p>0))continue;if(!samples.has(outcomeKey(o)))samples.set(outcomeKey(o),[]);samples.get(outcomeKey(o)).push({probability:p,bookmaker:entry.bookmaker});}
    }
    for(const [selectionKey,list] of samples){
      if(list.length<2)continue;
      const probability=list.reduce((s,x)=>s+x.probability,0)/list.length; if(!(probability>0&&probability<1))continue;
      let best=null;
      for(const entry of books){const o=entry.outcomes.find(x=>outcomeKey(x)===selectionKey);if(!o)continue;const p=price(o.price);if(!best||p>best.price)best={price:p,bookmaker:entry.bookmaker};}
      if(!best)continue;
      const sample=books.find(e=>e.outcomes.some(o=>outcomeKey(o)===selectionKey)); const o=sample?.outcomes.find(x=>outcomeKey(x)===selectionKey);if(!o)continue;
      const fairOdds=1/probability; const value=best.price/fairOdds-1;
      rows.push({
        id:`${event.id}-${gk}-${selectionKey}`,eventId:event.id,sportKey:event.sport_key,league:event.sport_title,
        home:event.home_team,away:event.away_team,commence_time:event.commence_time,market:sample.market.key,
        selection:o.description?`${o.description} — ${o.name}`:o.name,outcome:o.name,description:o.description||"",point:o.point??null,
        bookmaker:best.bookmaker.title,bookmakerKey:best.bookmaker.key,odds:best.price,fairOdds,probability,value,books:list.length
      });
    }
  }
  return rows;
}
function confidence(r){const v=r.value*100,p=r.probability*100,b=r.books;if(v>=15&&p>=60&&b>=4)return"VERY HIGH";if(v>=10&&p>=55&&b>=3)return"HIGH";if(v>=6&&p>=45&&b>=2)return"MEDIUM";return"LOW"}
function marketLabel(k){return MARKET_OPTIONS.find(x=>x[0]===k)?.[1]||k}
function requestedMarkets(v){if(!v||v==="all")return MARKET_OPTIONS.map(x=>x[0]);return v.split(",").filter(k=>MARKET_OPTIONS.some(x=>x[0]===k))}
function json(statusCode,body){return{statusCode,headers:{"content-type":"application/json","cache-control":"no-store"},body:JSON.stringify(body)}}

exports.handler=async(event)=>{
  const key=process.env.ODDS_API_KEY;if(!key)return json(500,{error:"Missing ODDS_API_KEY in Netlify environment variables."});
  const q=event.queryStringParameters||{}; const from=q.from||new Date().toISOString().slice(0,10); const to=q.to||from;
  const competition=q.league||"major", region=q.region||process.env.ODDS_API_REGION||"uk";
  const maxGames=Math.min(Math.max(parseInt(q.maxGames||"12",10),1),25); const minValue=Number(q.minValue||3)/100; const markets=requestedMarkets(q.markets);
  if(!/^\d{4}-\d{2}-\d{2}$/.test(from)||!/\d{4}-\d{2}-\d{2}$/.test(to))return json(400,{error:"Dates must be YYYY-MM-DD."});
  if(from>to)return json(400,{error:"FROM date cannot be after TO date."});
  if(!markets.length)return json(400,{error:"Choose at least one market."});
  try{
    const sr=await api(`${API}/sports/?apiKey=${encodeURIComponent(key)}`,{cacheKey:`sports:${key}`,cacheTtlMs:3600000,retries:2});
    const soccer=(sr.data||[]).filter(s=>s.group==="Soccer"&&s.active);
    let chosen=competition==="major"?soccer.filter(s=>MAJOR_KEYS.has(s.key)):competition==="all"?soccer:soccer.filter(s=>s.key===competition);
    const bounds=ukBounds(from),end=ukBounds(to),events=[];
    for(const sport of chosen){
      const u=new URL(`${API}/sports/${sport.key}/events`);u.searchParams.set("apiKey",key);u.searchParams.set("dateFormat","iso");u.searchParams.set("commenceTimeFrom",bounds.from);u.searchParams.set("commenceTimeTo",end.to);
      try{const r=await api(u.toString(),{cacheKey:`events:${key}:${sport.key}:${from}:${to}`,cacheTtlMs:600000,retries:2});for(const e of r.data||[])events.push({...e,sport_title:sport.title})}catch(e){if(/429|rate.?limit/i.test(String(e.message)))throw e}
      await sleep(100);
    }
    const unique=[...new Map(events.map(e=>[e.id,e])).values()].sort((a,b)=>new Date(a.commence_time)-new Date(b.commence_time));
    const limited=unique.slice(0,maxGames); const rows=[]; let remaining=null,used=null,last=null,oddsCalls=0;
    for(const e of limited){
      const u=new URL(`${API}/sports/${e.sport_key}/events/${e.id}/odds`);u.searchParams.set("apiKey",key);u.searchParams.set("regions",region);u.searchParams.set("markets",markets.join(","));u.searchParams.set("oddsFormat","decimal");u.searchParams.set("dateFormat","iso");
      try{
        const r=await api(u.toString(),{cacheKey:`odds:${key}:${e.id}:${region}:${markets.join(",")}`,cacheTtlMs:60000,retries:2});oddsCalls++;remaining=r.headers.get("x-requests-remaining")||remaining;used=r.headers.get("x-requests-used")||used;last=r.headers.get("x-requests-last")||last;rows.push(...buildRows(r.data));
      }catch(e){if(/429|rate.?limit/i.test(String(e.message)))throw e}
      await sleep(120);
    }
    const filtered=rows.map(r=>({...r,marketLabel:marketLabel(r.market),confidence:confidence(r)})).filter(r=>r.value>=minValue).sort((a,b)=>b.value-a.value||b.probability-a.probability);
    return json(200,{generatedAt:new Date().toISOString(),from,to,competition,region,eventsScanned:limited.length,gamesFound:unique.length,competitions:soccer.filter(s=>MAJOR_KEYS.has(s.key)).map(s=>({key:s.key,title:s.title})),selectedCompetitions:chosen.map(s=>({key:s.key,title:s.title})),rows:filtered,requestedMarkets:markets.map(marketLabel),usage:{remaining,used,last,oddsCalls},warning:"Vascali first finds the fixtures in the selected men's competitions for the date, then requests bookmaker odds only for the games it will scan. Probability is the average no-vig implied probability across bookmakers supplying that market. Fair odds are 1/probability. Value is best odds/fair odds − 1."});
  }catch(e){return json(400,{error:e.message||"Scanner failed"})}
};
