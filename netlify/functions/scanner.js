const API="https://api.the-odds-api.com/v4";
const MAJOR_PATTERNS=[
  ["Premier League","soccer_epl"],["Champions League","soccer_uefa_champs_league"],
  ["Europa League","soccer_uefa_europa_league"],["La Liga","soccer_spain_la_liga"],
  ["Bundesliga","soccer_germany_bundesliga"],["Serie A","soccer_italy_serie_a"],
  ["Ligue 1","soccer_france_ligue_one"],["Eredivisie","soccer_netherlands_eredivisie"],
  ["Primeira Liga","soccer_portugal_primeira_liga"],["Scottish Premiership","soccer_spl"],
  ["Championship","soccer_efl_champ"],["MLS","soccer_usa_mls"],["Brazil Serie A","soccer_brazil_campeonato"],
  ["Argentina Liga Profesional","soccer_argentina_primera_division"],["Belgian Pro League","soccer_belgium_first_div"],
  ["Turkish Super Lig","soccer_turkey_super_league"],["Saudi Pro League","soccer_saudi_arabia_pro_league"]
];
const MARKETS={
  result:["h2h","Match Result"],
  goals:["totals","Goals O/U"],
  btts:["btts","BTTS"],
  corners:["alternate_totals_corners","Corners O/U","alternate_spreads_corners","Corner Handicap","alternate_team_totals_corners","Team Corners"],
  cards:["alternate_totals_cards","Cards O/U","alternate_spreads_cards","Card Handicap"],
  shots:["player_shots","Player Shots"],
  sot:["player_shots_on_target","Player Shots on Target"],
  player_cards:["player_to_receive_card","Player to Receive Card"]
};
const marketKeys=Object.values(MARKETS).filter((_,i)=>i%2===0).map(x=>x[0]);
const wantedAll=["h2h","totals","btts","alternate_totals_corners","alternate_spreads_corners","alternate_team_totals_corners","alternate_totals_cards","alternate_spreads_cards","player_shots","player_shots_on_target","player_to_receive_card"];

async function get(url,key){
  const r=await fetch(url); const t=await r.text(); let data; try{data=JSON.parse(t)}catch{data={error:t}};
  if(!r.ok) throw new Error(data?.message||data?.error||`API ${r.status}`);
  return {data,headers:r.headers};
}
function isoStart(d){return new Date(d+"T00:00:00").toISOString()}
function isoEnd(d){return new Date(d+"T23:59:59").toISOString()}
function noVig(quotes){
  const nums=quotes.map(q=>1/Number(q.price)).filter(Number.isFinite);
  const sum=nums.reduce((a,b)=>a+b,0); return nums.map(x=>x/sum);
}
function marketRows(event){
  const rows=[];
  const groups={};
  for(const b of event.bookmakers||[]) for(const m of b.markets||[]){
    for(const o of m.outcomes||[]){
      const point=o.point ?? "";
      const desc=o.description || "";
      const id=`${m.key}|${desc}|${point}|${o.name}`;
      (groups[id] ||= []).push({book:b.title,bookKey:b.key,price:Number(o.price),point,description:desc,market:m.key});
    }
  }
  for(const [id,quotes] of Object.entries(groups)){
    if(quotes.length<2) continue;
    const best=quotes.reduce((a,b)=>b.price>a.price?b:a);
    const probs=noVig(quotes);
    const p=probs[quotes.indexOf(best)];
    if(!p||!best.price) continue;
    const fair=1/p, value=best.price/fair-1;
    rows.push({id,eventId:event.id,league:event.sport_title,home:event.home_team,away:event.away_team,
      commence_time:event.commence_time,market:best.market,description:best.description,point:best.point,
      selection:id.split("|").pop(),bookmaker:best.book,odds:best.price,fairOdds:fair,probability:p,value,
      books:quotes.length});
  }
  return rows;
}
function labelMarket(k){return MARKETS[k]?.[1]||k}
function confidence(r){
  const v=r.value*100,p=r.probability*100,b=r.books;
  if(v>=15&&p>=60&&b>=4)return "VERY HIGH";
  if(v>=10&&p>=55&&b>=3)return "HIGH";
  if(v>=6&&p>=45&&b>=2)return "MEDIUM";
  return "LOW";
}
exports.handler=async(event)=>{
  const key=process.env.ODDS_API_KEY;
  if(!key)return {statusCode:500,headers:{"content-type":"application/json"},body:JSON.stringify({error:"Missing ODDS_API_KEY"})};
  const q=event.queryStringParameters||{};
  const from=q.from||new Date().toISOString().slice(0,10), to=q.to||from;
  const league=q.league||"major", region=q.region||process.env.ODDS_API_REGION||"uk";
  const selected=(q.markets||"result,goals,btts,corners,cards,shots,sot,player_cards").split(",").filter(Boolean);
  const wanted=selected.flatMap(k=>MARKETS[k]? [MARKETS[k][0]]:[]).filter((v,i,a)=>a.indexOf(v)===i);
  const maxGames=Math.min(Math.max(Number(q.maxGames||8),1),30);
  try{
    const sportsR=await get(`${API}/sports/?apiKey=${key}`,key);
    const sports=(sportsR.data||[]).filter(s=>s.group==="Soccer"&&s.active);
    let chosen;
    if(league==="major") {
      const set=new Set(MAJOR_PATTERNS.map(x=>x[1]));
      chosen=sports.filter(s=>set.has(s.key));
    } else if(league==="all") chosen=sports;
    else chosen=sports.filter(s=>s.key===league);
    const events=[];
    for(const s of chosen){
      const u=new URL(`${API}/sports/${s.key}/events`);
      u.searchParams.set("apiKey",key); u.searchParams.set("dateFormat","iso");
      if(league!=="major"&&league!=="all"){u.searchParams.set("commenceTimeFrom",isoStart(from));u.searchParams.set("commenceTimeTo",isoEnd(to))}
      else {u.searchParams.set("commenceTimeFrom",isoStart(from));u.searchParams.set("commenceTimeTo",isoEnd(to))}
      const er=await get(u.toString(),key);
      for(const e of (er.data||[])) events.push({...e,sport_title:s.title});
    }
    events.sort((a,b)=>new Date(a.commence_time)-new Date(b.commence_time));
    const limited=events.slice(0,maxGames);
    const allRows=[];
    for(const e of limited){
      const u=new URL(`${API}/sports/${e.sport_key}/events/${e.id}/odds`);
      u.searchParams.set("apiKey",key);u.searchParams.set("regions",region);u.searchParams.set("markets",wanted.join(","));u.searchParams.set("oddsFormat","decimal");u.searchParams.set("dateFormat","iso");
      try{
        const or=await get(u.toString(),key);
        const ev=or.data;
        for(const r of marketRows(ev)) {
          r.marketLabel=labelMarket(Object.keys(MARKETS).find(k=>MARKETS[k][0]===r.market)||r.market);
          r.confidence=confidence(r);
          allRows.push(r);
        }
      }catch(err){ /* specialist market may be unavailable for this event/bookmaker */ }
    }
    const min=Number(q.minValue||3)/100, filtered=allRows.filter(r=>r.value>=min).sort((a,b)=>b.value-a.value);
    const h=limited.length?{}:{};
    return {statusCode:200,headers:{"content-type":"application/json","cache-control":"no-store","x-scanner-events":String(limited.length)},body:JSON.stringify({
      generatedAt:new Date().toISOString(),from,to,leagues:chosen.map(s=>({key:s.key,title:s.title})),eventsScanned:limited.length,
      gamesFound:events.length,rows:filtered,availableMarkets:selected,warning:"Additional soccer markets such as player shots/SOT/cards are not guaranteed for every league, bookmaker or event. The API documents specialist coverage as limited and expanding.",
      usage:{remaining:orRemainingPlaceholder(),note:"Credits are returned in API response headers; this serverless aggregation reports them only when available from the last successful event request."}
    })};
  }catch(err){return {statusCode:400,headers:{"content-type":"application/json"},body:JSON.stringify({error:err.message})}}
};
function orRemainingPlaceholder(){return null}