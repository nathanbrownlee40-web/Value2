# Bet Scanner 3.0 — Netlify

## Fixes in this version
- Real date FROM/TO filters using The Odds API event endpoint.
- Major-league selector plus individual leagues.
- Match date and kickoff time on every result.
- Best bookmaker shown on every result.
- Proper market selector: Match Result, Goals O/U, BTTS, Corners, Cards, Player Shots, Shots on Target, Player Cards.
- Event-specific odds requests for specialist soccer markets.
- Value, fair odds, probability and confidence.
- Max-games control to protect the 500-credit free quota.

## Netlify environment
`ODDS_API_KEY` = your key
`ODDS_API_REGION` = `uk` by default.

## Important API limitation
The Odds API documentation says additional soccer markets have limited coverage and are available only from selected bookmakers/sports; soccer player props are currently listed as limited to US bookmakers. Therefore, UK region may return goals/BTTS/corners/cards but may not return player shots/SOT for every event. The app will not invent missing markets.

## Quota
The events endpoint is quota-free. Event-odds requests cost according to markets x regions. With 1 region, requesting 11 specialist markets for 8 games can consume up to 88 credits, so use the market filter and max-games setting carefully on a 500-credit plan.
