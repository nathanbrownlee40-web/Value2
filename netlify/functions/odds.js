exports.handler = async (event) => {
  const key = process.env.ODDS_API_KEY;
  const region = process.env.ODDS_API_REGION || "uk";
  const markets = process.env.ODDS_API_MARKETS || "h2h";
  if (!key) return {statusCode:500,headers:{"content-type":"application/json"},body:JSON.stringify({error:"Missing ODDS_API_KEY in Netlify environment variables. Add it under Site configuration → Environment variables, then redeploy."})};
  const url = `https://api.the-odds-api.com/v4/sports/upcoming/odds/?apiKey=${encodeURIComponent(key)}&regions=${encodeURIComponent(region)}&markets=${encodeURIComponent(markets)}&oddsFormat=decimal`;
  try{
    const r=await fetch(url);
    const text=await r.text();
    let body;
    try { body=JSON.parse(text); } catch { body={error:text || `Odds API returned HTTP ${r.status}`}; }
    if(!r.ok){
      return {statusCode:r.status,headers:{"content-type":"application/json","cache-control":"no-store"},body:JSON.stringify({error:body?.message || body?.error || `Odds API returned HTTP ${r.status}`,status:r.status})};
    }
    return {statusCode:200,headers:{"content-type":"application/json","cache-control":"no-store","x-requests-remaining":r.headers.get("x-requests-remaining")||""},body:JSON.stringify(body)};
  }catch(e){return {statusCode:502,headers:{"content-type":"application/json"},body:JSON.stringify({error:`Could not reach The Odds API: ${e.message}`})}}
};