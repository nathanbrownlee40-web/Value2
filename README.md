# Value Bet Scanner — Netlify

This is a ready-to-deploy Netlify app.

## What it does
- Pulls live odds through a Netlify serverless function so the API key is not exposed in the browser.
- Compares bookmaker prices across the available market.
- Calculates margin-adjusted market probability and estimated fair odds.
- Shows the best available price and estimated value percentage.
- Filters by minimum value and sport.

## Netlify setup
1. Upload this project to a GitHub repository.
2. Import the repository into Netlify.
3. Add an environment variable:
   - `ODDS_API_KEY` = your API key
   - `ODDS_API_REGION` = `uk` (optional)
   - `ODDS_API_MARKETS` = `h2h` (optional)
4. Deploy.

The included adapter is for The Odds API v4. If your free API is a different provider, replace the URL/normalisation in `netlify/functions/odds.js` with that provider's endpoint and return the same event structure.

## Important
"Value" here is market-derived value: it compares a bookmaker's best price to a fair price estimated from the available market. It is not a guaranteed predictive edge. A stronger version can add a separate prediction/model probability, then calculate true model EV.
