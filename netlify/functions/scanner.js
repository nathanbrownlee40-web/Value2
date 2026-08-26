const API = "https://api.the-odds-api.com/v4";

const MARKET_OPTIONS = [
  ["h2h", "Match Result"],
  ["totals", "Goals O/U"],
  ["btts", "BTTS"],
  ["alternate_totals_corners", "Corners O/U"],
  ["alternate_spreads_corners", "Corner Handicap"],
  ["alternate_team_totals_corners", "Team Corners"],
  ["alternate_totals_cards", "Cards O/U"],
  ["alternate_spreads_cards", "Card Handicap"],
  ["player_shots", "Player Shots"],
  ["player_shots_on_target", "Shots on Target"],
  ["player_to_receive_card", "Player Cards"]
];

// Used only for the convenient "Major + Cups" filter. The actual competition list
// is loaded from /sports so newly available competitions can still be selected.
const MAJOR_KEYS = new Set([
  "soccer_epl", "soccer_spain_la_liga", "soccer_germany_bundesliga", "soccer_italy_serie_a",
  "soccer_france_ligue_one", "soccer_uefa_champs_league", "soccer_uefa_europa_league",
  "soccer_uefa_europa_conference_league", "soccer_netherlands_eredivisie", "soccer_portugal_primeira_liga",
  "soccer_spl", "soccer_efl_champ", "soccer_usa_mls", "soccer_brazil_campeonato",
  "soccer_argentina_primera_division", "soccer_belgium_first_div", "soccer_turkey_super_league",
  "soccer_saudi_arabia_pro_league", "soccer_england_efl_cup", "soccer_fa_cup",
  "soccer_spain_copa_del_rey", "soccer_germany_dfb_pokal", "soccer_italy_coppa_italia",
  "soccer_france_coupe_de_france", "soccer_portugal_taca_de_portugal", "soccer_netherlands_knvb_beker",
  "soccer_uefa_champs_league_qualification", "soccer_uefa_europa_league_qualification",
  "soccer_uefa_europa_conference_league_qualification", "soccer_fifa_world_cup",
  "soccer_fifa_world_cup_qualifiers_europe", "soccer_fifa_world_cup_qualifiers_south_america",
  "soccer_club_world_cup"
]);

const CACHE = globalThis.__BET_SCANNER_CACHE || (globalThis.__BET_SCANNER_CACHE = new Map());
const sleep = ms => new Promise(r => setTimeout(r, ms));

async function api(url, options = {}) {
  const { retries = 2, delayMs = 450, cacheKey = null, cacheTtlMs = 0 } = options;
  if (cacheKey && cacheTtlMs > 0) {
    const hit = CACHE.get(cacheKey);
    if (hit && Date.now() - hit.at < cacheTtlMs) return hit.value;
  }
  let lastErr = null;
  for (let attempt = 0; attempt <= retries; attempt++) {
    try {
      const res = await fetch(url);
      const text = await res.text();
      let data;
      try { data = JSON.parse(text); } catch { data = { error: text }; }
      if (res.status === 429) {
        const retryAfter = Number(res.headers.get('retry-after'));
        const wait = Number.isFinite(retryAfter) && retryAfter > 0 ? retryAfter * 1000 : delayMs * (attempt + 1);
        if (attempt < retries) { await sleep(wait); continue; }
        throw new Error('The Odds API is rate-limiting requests (429). Wait a few seconds and scan again. The scanner now spaces and retries requests automatically.');
      }
      if (!res.ok) throw new Error(data?.message || data?.error || `API ${res.status}`);
      const value = { data, headers: res.headers };
      if (cacheKey && cacheTtlMs > 0) CACHE.set(cacheKey, { at: Date.now(), value });
      return value;
    } catch (err) {
      lastErr = err;
      if (attempt < retries && /429|rate.?limit/i.test(String(err.message))) { await sleep(delayMs * (attempt + 1)); continue; }
      throw err;
    }
  }
  throw lastErr || new Error('API request failed');
}

function startISO(date) { return `${date}T00:00:00Z`; }
function endISO(date) { return `${date}T23:59:59Z`; }

function decimal(p) { return Number(p); }
function probabilityForBook(outcomes) {
  const inv = outcomes.map(o => 1 / decimal(o.price)).filter(Number.isFinite);
  const sum = inv.reduce((a, b) => a + b, 0);
  if (!sum) return [];
  return inv.map(x => x / sum);
}

// Build a fair probability from complete outcome sets at each bookmaker.
// This is materially better than treating several quotes for the same outcome
// as if they were one market.
function buildRows(event) {
  const groups = new Map();
  for (const bookmaker of event.bookmakers || []) {
    for (const market of bookmaker.markets || []) {
      const outcomes = (market.outcomes || []).filter(o => Number.isFinite(Number(o.price)));
      if (!outcomes.length) continue;
      const point = outcomes[0]?.point ?? "";
      const desc = outcomes[0]?.description || "";
      const groupKey = `${market.key}|${desc}|${point}`;
      if (!groups.has(groupKey)) groups.set(groupKey, []);
      groups.get(groupKey).push({ bookmaker, market, outcomes });
    }
  }

  const rows = [];
  for (const [groupKey, books] of groups.entries()) {
    if (books.length < 2) continue;

    const fairBySelection = new Map();
    for (const entry of books) {
      const probs = probabilityForBook(entry.outcomes);
      entry.outcomes.forEach((outcome, i) => {
        const key = `${outcome.name}|${outcome.description || ""}|${outcome.point ?? ""}`;
        if (!fairBySelection.has(key)) fairBySelection.set(key, []);
        if (probs[i] > 0) fairBySelection.get(key).push(probs[i]);
      });
    }

    for (const entry of books) {
      for (const outcome of entry.outcomes) {
        const key = `${outcome.name}|${outcome.description || ""}|${outcome.point ?? ""}`;
        const fairSamples = fairBySelection.get(key) || [];
        if (fairSamples.length < 2) continue;
        const fairProbability = fairSamples.reduce((a, b) => a + b, 0) / fairSamples.length;
        const bestPrice = Number(outcome.price);
        if (!(fairProbability > 0) || !(bestPrice > 1)) continue;
        const fairOdds = 1 / fairProbability;
        const value = bestPrice / fairOdds - 1;
        rows.push({
          id: `${event.id}-${groupKey}-${entry.bookmaker.key}-${outcome.name}-${outcome.point ?? ""}`,
          eventId: event.id,
          sportKey: event.sport_key,
          league: event.sport_title,
          home: event.home_team,
          away: event.away_team,
          commence_time: event.commence_time,
          market: entry.market.key,
          selection: outcome.description ? `${outcome.description} — ${outcome.name}` : outcome.name,
          outcome: outcome.name,
          description: outcome.description || "",
          point: outcome.point ?? null,
          bookmaker: entry.bookmaker.title,
          bookmakerKey: entry.bookmaker.key,
          odds: bestPrice,
          fairOdds,
          probability: fairProbability,
          value,
          books: fairSamples.length
        });
      }
    }
  }
  return rows;
}

function confidence(row) {
  const value = row.value * 100;
  const probability = row.probability * 100;
  const books = row.books;
  if (value >= 15 && probability >= 60 && books >= 4) return "VERY HIGH";
  if (value >= 10 && probability >= 55 && books >= 3) return "HIGH";
  if (value >= 6 && probability >= 45 && books >= 2) return "MEDIUM";
  return "LOW";
}

function marketLabel(key) {
  return MARKET_OPTIONS.find(x => x[0] === key)?.[1] || key;
}

function requestedMarkets(value) {
  if (!value || value === "all") return MARKET_OPTIONS.map(x => x[0]);
  const wanted = value.split(",").filter(Boolean);
  return wanted.filter(k => MARKET_OPTIONS.some(x => x[0] === k));
}

exports.handler = async (event) => {
  const key = process.env.ODDS_API_KEY;
  if (!key) return json(500, { error: "Missing ODDS_API_KEY in Netlify environment variables." });

  const q = event.queryStringParameters || {};
  const from = q.from || new Date().toISOString().slice(0, 10);
  const to = q.to || from;
  const competition = q.league || "all";
  const region = q.region || process.env.ODDS_API_REGION || "uk";
  const maxGames = Math.min(Math.max(parseInt(q.maxGames || "8", 10), 1), 25);
  const minValue = Number(q.minValue || 3) / 100;
  const markets = requestedMarkets(q.markets);

  if (!/^\d{4}-\d{2}-\d{2}$/.test(from) || !/^\d{4}-\d{2}-\d{2}$/.test(to)) {
    return json(400, { error: "Dates must be YYYY-MM-DD." });
  }
  if (from > to) return json(400, { error: "FROM date cannot be after TO date." });
  if (!markets.length) return json(400, { error: "Choose at least one market." });

  try {
    // Free endpoint: load currently available competitions dynamically.
    const sportsResponse = await api(`${API}/sports/?apiKey=${encodeURIComponent(key)}`, { cacheKey: `sports:${key}`, cacheTtlMs: 60 * 60 * 1000, retries: 2, delayMs: 800 });
    const allSoccer = (sportsResponse.data || []).filter(s => s.group === "Soccer" && s.active);

    let chosen;
    if (competition === "major") {
      chosen = allSoccer.filter(s => MAJOR_KEYS.has(s.key));
    } else if (competition === "all") {
      chosen = allSoccer;
    } else {
      chosen = allSoccer.filter(s => s.key === competition);
    }

    const events = [];
    // Events endpoint is quota-free and supports date filtering.
    for (const sport of chosen) {
      const u = new URL(`${API}/sports/${sport.key}/events`);
      u.searchParams.set("apiKey", key);
      u.searchParams.set("dateFormat", "iso");
      u.searchParams.set("commenceTimeFrom", startISO(from));
      u.searchParams.set("commenceTimeTo", endISO(to));
      const response = await api(u.toString(), { cacheKey: `events:${key}:${sport.key}:${from}:${to}`, cacheTtlMs: 10 * 60 * 1000, retries: 3, delayMs: 800 });
      // The events endpoint is quota-free, but it is still rate-limited. Keep requests spaced out.
      await sleep(250);
      for (const e of response.data || []) events.push({ ...e, sport_title: sport.title });
    }

    events.sort((a, b) => new Date(a.commence_time) - new Date(b.commence_time));
    const limited = events.slice(0, maxGames);
    const rows = [];
    let creditsRemaining = null;
    let creditsUsed = null;

    for (const e of limited) {
      const u = new URL(`${API}/sports/${e.sport_key}/events/${e.id}/odds`);
      u.searchParams.set("apiKey", key);
      u.searchParams.set("regions", region);
      u.searchParams.set("markets", markets.join(","));
      u.searchParams.set("oddsFormat", "decimal");
      u.searchParams.set("dateFormat", "iso");
      try {
        const response = await api(u.toString(), { cacheKey: `events:${key}:${sport.key}:${from}:${to}`, cacheTtlMs: 10 * 60 * 1000, retries: 3, delayMs: 800 });
      // The events endpoint is quota-free, but it is still rate-limited. Keep requests spaced out.
      await sleep(250);
        creditsRemaining = response.headers.get("x-requests-remaining") || creditsRemaining;
        creditsUsed = response.headers.get("x-requests-used") || creditsUsed;
        const eventRows = buildRows(response.data);
        for (const row of eventRows) {
          row.marketLabel = marketLabel(row.market);
          row.confidence = confidence(row);
          rows.push(row);
        }
      } catch (err) {
        // Missing specialist markets are normal. Rate limits are not: surface them so the user knows what happened.
        if (/rate.?limit|429/i.test(String(err.message))) throw err;
      }
    }

    const filtered = rows
      .filter(r => r.value >= minValue)
      .sort((a, b) => b.value - a.value || b.probability - a.probability);

    return json(200, {
      generatedAt: new Date().toISOString(),
      from, to, competition, region,
      eventsScanned: limited.length,
      gamesFound: events.length,
      competitions: allSoccer.map(s => ({ key: s.key, title: s.title, description: s.description })),
      selectedCompetitions: chosen.map(s => ({ key: s.key, title: s.title })),
      rows: filtered,
      requestedMarkets: markets.map(marketLabel),
      usage: { remaining: creditsRemaining, used: creditsUsed },
      warning: "Fair odds are market-consensus estimates after removing bookmaker margin. Specialist markets are only shown when the API returns them for the selected event/region. Sports/events responses are cached and requests are deliberately spaced to avoid API rate limits."
    });
  } catch (err) {
    return json(400, { error: err.message });
  }
};

function json(statusCode, body) {
  return { statusCode, headers: { "content-type": "application/json", "cache-control": "no-store" }, body: JSON.stringify(body) };
}
