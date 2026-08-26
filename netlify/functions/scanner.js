const API = "https://api.the-odds-api.com/v4";

// Markets that are actually documented for soccer by The Odds API.
const MARKET_OPTIONS = [
  ["h2h", "Match Result"],
  ["totals", "Goals O/U"],
  ["btts", "BTTS"],
  ["alternate_totals", "Alternate Goals O/U"],
  ["alternate_totals_corners", "Corners O/U"],
  ["alternate_spreads_corners", "Corner Handicap"],
  ["alternate_team_totals_corners", "Team Corners"],
  ["alternate_totals_cards", "Cards O/U"],
  ["alternate_spreads_cards", "Card Handicap"],
  ["player_shots", "Player Shots"],
  ["player_shots_on_target", "Shots on Target"],
  ["player_to_receive_card", "Player Cards"]
];

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
const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));

async function api(url, options = {}) {
  const { retries = 2, delayMs = 700, cacheKey = null, cacheTtlMs = 0 } = options;
  if (cacheKey && cacheTtlMs > 0) {
    const hit = CACHE.get(cacheKey);
    if (hit && Date.now() - hit.at < cacheTtlMs) return hit.value;
  }

  let lastErr;
  for (let attempt = 0; attempt <= retries; attempt++) {
    try {
      const res = await fetch(url);
      const text = await res.text();
      let data;
      try { data = JSON.parse(text); } catch { data = { error: text }; }

      if (res.status === 429) {
        const retryAfter = Number(res.headers.get("retry-after"));
        const wait = Number.isFinite(retryAfter) && retryAfter > 0
          ? retryAfter * 1000
          : delayMs * Math.pow(2, attempt);
        if (attempt < retries) { await sleep(wait); continue; }
        throw new Error("The Odds API is rate-limiting requests (429). Wait a few seconds and scan again.");
      }
      if (!res.ok) throw new Error(data?.message || data?.error || `API ${res.status}`);

      const value = { data, headers: res.headers };
      if (cacheKey && cacheTtlMs > 0) CACHE.set(cacheKey, { at: Date.now(), value });
      return value;
    } catch (err) {
      lastErr = err;
      if (attempt < retries && /429|rate.?limit/i.test(String(err.message))) {
        await sleep(delayMs * Math.pow(2, attempt));
        continue;
      }
      throw err;
    }
  }
  throw lastErr || new Error("API request failed");
}

function dateBoundsUK(date) {
  // The UI date means a UK calendar date. Use UTC boundaries that cover the whole
  // UK day (including BST/GMT transitions) rather than blindly treating the input
  // as a UTC calendar date.
  const start = new Date(`${date}T00:00:00+01:00`);
  const end = new Date(`${date}T23:59:59+01:00`);
  return { from: start.toISOString(), to: end.toISOString() };
}

function decimal(price) { return Number(price); }

function normalizeOutcomes(outcomes) {
  const valid = outcomes.filter(o => Number.isFinite(decimal(o.price)) && decimal(o.price) > 1);
  if (valid.length < 2) return null;
  const inv = valid.map(o => 1 / decimal(o.price));
  const sum = inv.reduce((a, b) => a + b, 0);
  if (!(sum > 0)) return null;
  const probs = new Map();
  valid.forEach((o, i) => probs.set(outcomeKey(o), inv[i] / sum));
  return probs;
}

function outcomeKey(o) {
  return `${o.name || ""}|${o.description || ""}|${o.point ?? ""}`;
}

function marketGroupKey(market) {
  // For alternate totals/corners/cards and player O/U, point + description define
  // the exact line. For h2h/btts the description/point are empty.
  const first = market.outcomes?.[0] || {};
  return `${market.key}|${first.description || ""}|${first.point ?? ""}`;
}

function buildRows(eventData) {
  const event = eventData;
  const groups = new Map();

  for (const bookmaker of event.bookmakers || []) {
    for (const market of bookmaker.markets || []) {
      const outcomes = (market.outcomes || []).filter(o => Number.isFinite(decimal(o.price)) && decimal(o.price) > 1);
      if (outcomes.length < 2) continue; // prevents fake 100% fair odds for one-sided player-card markets
      const key = marketGroupKey(market);
      if (!groups.has(key)) groups.set(key, []);
      groups.get(key).push({ bookmaker, market, outcomes });
    }
  }

  const rows = [];
  for (const [groupKey, books] of groups) {
    // A market-consensus fair price needs at least two bookmakers.
    if (books.length < 2) continue;

    const samples = new Map();
    for (const entry of books) {
      const probs = normalizeOutcomes(entry.outcomes);
      if (!probs) continue;
      for (const outcome of entry.outcomes) {
        const key = outcomeKey(outcome);
        const p = probs.get(key);
        if (!(p > 0)) continue;
        if (!samples.has(key)) samples.set(key, []);
        samples.get(key).push({ probability: p, bookmaker: entry.bookmaker });
      }
    }

    for (const [selectionKey, sampleList] of samples) {
      if (sampleList.length < 2) continue;
      const fairProbability = sampleList.reduce((sum, x) => sum + x.probability, 0) / sampleList.length;
      if (!(fairProbability > 0 && fairProbability < 1)) continue;

      // Find the best currently available price for this exact selection.
      let best = null;
      for (const entry of books) {
        const outcome = entry.outcomes.find(o => outcomeKey(o) === selectionKey);
        if (!outcome) continue;
        const price = decimal(outcome.price);
        if (!best || price > best.price) best = { price, bookmaker: entry.bookmaker };
      }
      if (!best || !(best.price > 1)) continue;

      const fairOdds = 1 / fairProbability;
      const value = best.price / fairOdds - 1;
      const sample = books.find(entry => entry.outcomes.some(o => outcomeKey(o) === selectionKey));
      const outcome = sample?.outcomes.find(o => outcomeKey(o) === selectionKey);
      if (!outcome) continue;

      rows.push({
        id: `${event.id}-${groupKey}-${selectionKey}`,
        eventId: event.id,
        sportKey: event.sport_key,
        league: event.sport_title,
        home: event.home_team,
        away: event.away_team,
        commence_time: event.commence_time,
        market: sample.market.key,
        selection: outcome.description ? `${outcome.description} — ${outcome.name}` : outcome.name,
        outcome: outcome.name,
        description: outcome.description || "",
        point: outcome.point ?? null,
        bookmaker: best.bookmaker.title,
        bookmakerKey: best.bookmaker.key,
        odds: best.price,
        fairOdds,
        probability: fairProbability,
        value,
        books: sampleList.length
      });
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
  return value.split(",").filter(Boolean).filter(k => MARKET_OPTIONS.some(x => x[0] === k));
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
    const sportsResponse = await api(`${API}/sports/?apiKey=${encodeURIComponent(key)}`, {
      cacheKey: `sports:${key}`,
      cacheTtlMs: 60 * 60 * 1000,
      retries: 2,
      delayMs: 800
    });
    const allSoccer = (sportsResponse.data || []).filter(s => s.group === "Soccer" && s.active);

    let chosen;
    if (competition === "major") chosen = allSoccer.filter(s => MAJOR_KEYS.has(s.key));
    else if (competition === "all") chosen = allSoccer;
    else chosen = allSoccer.filter(s => s.key === competition);

    const events = [];
    const bounds = dateBoundsUK(from);
    const endBounds = dateBoundsUK(to);
    const commenceFrom = bounds.from;
    const commenceTo = endBounds.to;

    // Quota-free, but still rate-limited. Keep a small sequential gap.
    for (const sport of chosen) {
      const u = new URL(`${API}/sports/${sport.key}/events`);
      u.searchParams.set("apiKey", key);
      u.searchParams.set("dateFormat", "iso");
      u.searchParams.set("commenceTimeFrom", commenceFrom);
      u.searchParams.set("commenceTimeTo", commenceTo);
      try {
        const response = await api(u.toString(), {
          cacheKey: `events:${key}:${sport.key}:${from}:${to}`,
          cacheTtlMs: 10 * 60 * 1000,
          retries: 3,
          delayMs: 700
        });
        for (const e of response.data || []) events.push({ ...e, sport_title: sport.title });
      } catch (err) {
        // One unavailable competition should not kill an All competitions scan.
        if (/rate.?limit|429/i.test(String(err.message))) throw err;
      }
      await sleep(150);
    }

    // Deduplicate because the API can surface overlapping competition records.
    const uniqueEvents = [...new Map(events.map(e => [e.id, e])).values()]
      .sort((a, b) => new Date(a.commence_time) - new Date(b.commence_time));
    const limited = uniqueEvents.slice(0, maxGames);

    const rows = [];
    let creditsRemaining = null;
    let creditsUsed = null;
    let creditsLast = null;
    let oddsCalls = 0;

    for (const e of limited) {
      // IMPORTANT: this cache key is deliberately different from the events cache.
      // The previous build reused the events cache key here, so the odds endpoint
      // received cached event objects without bookmakers and produced zero value bets.
      const cacheKey = `odds:${key}:${e.sport_key}:${e.id}:${region}:${markets.join(",")}`;
      const u = new URL(`${API}/sports/${e.sport_key}/events/${e.id}/odds`);
      u.searchParams.set("apiKey", key);
      u.searchParams.set("regions", region);
      u.searchParams.set("markets", markets.join(","));
      u.searchParams.set("oddsFormat", "decimal");
      u.searchParams.set("dateFormat", "iso");

      try {
        const response = await api(u.toString(), {
          cacheKey,
          cacheTtlMs: 60 * 1000,
          retries: 3,
          delayMs: 900
        });
        oddsCalls++;
        creditsRemaining = response.headers.get("x-requests-remaining") || creditsRemaining;
        creditsUsed = response.headers.get("x-requests-used") || creditsUsed;
        creditsLast = response.headers.get("x-requests-last") || creditsLast;
        rows.push(...buildRows(response.data));
      } catch (err) {
        if (/rate.?limit|429/i.test(String(err.message))) throw err;
        // Some events simply have no odds or no specialist market. Continue scanning.
      }
      await sleep(200);
    }

    const filtered = rows
      .map(row => ({ ...row, marketLabel: marketLabel(row.market), confidence: confidence(row) }))
      .filter(row => row.value >= minValue)
      .sort((a, b) => b.value - a.value || b.probability - a.probability);

    return json(200, {
      generatedAt: new Date().toISOString(),
      from, to, competition, region,
      eventsScanned: limited.length,
      gamesFound: uniqueEvents.length,
      competitions: allSoccer.map(s => ({ key: s.key, title: s.title, description: s.description })),
      selectedCompetitions: chosen.map(s => ({ key: s.key, title: s.title })),
      rows: filtered,
      requestedMarkets: markets.map(marketLabel),
      usage: { remaining: creditsRemaining, used: creditsUsed, last: creditsLast, oddsCalls },
      warning: "Fair odds are market-consensus estimates after removing bookmaker margin. Best odds are selected across the returned bookmakers. Specialist soccer markets and player props only appear where bookmakers supply them for the selected event and region."
    });
  } catch (err) {
    return json(400, { error: err.message });
  }
};

function json(statusCode, body) {
  return {
    statusCode,
    headers: { "content-type": "application/json", "cache-control": "no-store" },
    body: JSON.stringify(body)
  };
}
