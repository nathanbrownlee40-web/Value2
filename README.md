# Bet Scanner 3.4

Fixed the main v3.2/v3.3 scanner bug: event odds were accidentally using the same cache key as the quota-free events response. That returned event objects without bookmakers, so the scanner found games but generated zero value bets.

This version:
- Uses a separate cache key for event odds.
- Gets bookmaker odds from `/events/{eventId}/odds` for the selected markets.
- Selects the best available bookmaker price for each exact selection.
- Calculates fair probability from margin-adjusted bookmaker consensus.
- Shows fair odds, probability, value %, bookmaker, date/time, competition and confidence.
- Keeps leagues and cup competitions, date filters, market filters and confidence filters.
- Uses UK-local date/time display.
- Caches sports/events/odds responses and backs off on 429 responses.
- Reports remaining/used/last credits when the API returns those headers.

Keep `ODDS_API_KEY` in Netlify Environment Variables. Do not put the key in frontend source code.

The Odds API's event-odds endpoint is required for additional soccer markets such as corners, cards, BTTS and soccer player props. Player props have limited bookmaker coverage, so they may not appear for every match/region.
