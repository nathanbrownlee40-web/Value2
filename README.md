# Value Bet Scanner 2.0

Netlify-ready football value scanner using The Odds API v4.

## Netlify environment variables
- `ODDS_API_KEY` — your secret API key
- `ODDS_API_REGION` — default `uk`
- `SCAN_MAX_EVENTS` — default `12`, maximum `40`

Do not put the API key in frontend code or commit it to GitHub.

## What it scans
- Match result
- BTTS / BTTS first half
- Goals totals / team goals
- Corners / team corners / corner handicap
- Cards / card handicap
- Player shots
- Player shots on target
- Player to receive a card

Coverage depends on bookmaker/sport/market availability. Some soccer player props are limited to selected bookmakers and regions.

## How the value calculation works
For each market line, the scanner removes the bookmaker margin from the available two-way/three-way quotes to estimate a fair probability. It then compares the best bookmaker price against the estimated fair odds.

`value = best_bookmaker_odds / fair_odds - 1`

Confidence is deliberately labelled as a heuristic ranking, not a predictive model.

## Free-plan protection
The API's event-odds endpoint charges by returned markets × regions. The scanner defaults to 12 events to avoid burning the 500-credit free allowance too quickly. You can lower `SCAN_MAX_EVENTS` to 5–10 for testing.
