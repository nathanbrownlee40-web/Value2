# Bet Scanner 3.2 — leagues AND cup games

Deploy to Netlify. Keep `ODDS_API_KEY` in Netlify environment variables.

## What changed
- Competition list is loaded dynamically from The Odds API `/sports` endpoint.
- Default is **All competitions**, so cup competitions are not excluded.
- **Major leagues + cups** is a shortcut that includes major domestic and European cups.
- Date range uses proper ISO timestamps server-side.
- Displays kickoff date/time and the bookmaker with the best price.
- Market selector covers match result, goals, BTTS, corners, cards, player shots, shots on target and player cards.
- Fair probability is calculated from complete outcome sets at each bookmaker, then averaged across books.
- Specialist markets are only shown when the API actually returns them.
- API credit headers are surfaced when available.

## Environment
- `ODDS_API_KEY` required.
- `ODDS_API_REGION=uk` optional.

## Free-plan caution
The `/sports` and `/events` endpoints do not consume odds quota. Event odds calls do. Requesting many markets at once costs more credits, so use a sensible Max Games value.
