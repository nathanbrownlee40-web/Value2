# Bet Scanner 3.3 — Rate-limit safe

This version keeps the v3.2 functionality but fixes the `Requests are too frequent` problem.

Changes:
- Caches `/sports` for 1 hour.
- Caches quota-free `/events` results for 10 minutes.
- Spaces requests instead of firing them in a burst.
- Retries HTTP 429 rate-limit responses with backoff.
- Surfaces rate-limit errors instead of silently returning zero games.
- Keeps all leagues/cups, date filters, bookmaker region, market filters and value/confidence calculations.

The Odds API recommends caching sports/events responses and spacing requests when 429s occur.
