exports.handler = async (event) => {
  const key = process.env.ODDS_API_KEY;
  const region = process.env.ODDS_API_REGION || "uk";
  const markets = process.env.ODDS_API_MARKETS || "h2h";
  const sport = event.queryStringParameters?.sport || "upcoming";
  if (!key) return {statusCode:500,headers:{"content-type":"application/json"},body:JSON.stringify({error:"Missing ODDS_API_KEY in Netlify environment variables."})};
  const url = `https://api.the-odds-api.com/v4/sports/${encodeURIComponent(sport)}/odds/?apiKey=${encodeURIComponent(key)}&regions=${encodeURIComponent(region)}&markets=${encodeURIComponent(markets)}&oddsFormat=decimal`;
  try{
    const r=await fetch(url);
    const text=await r.text();
    return {statusCode:r.status,headers:{"content-type":"application/json","cache-control":"no-store"},body:text};
  }catch(e){return {statusCode:502,headers:{"content-type":"application/json"},body:JSON.stringify({error:e.message})}}
};