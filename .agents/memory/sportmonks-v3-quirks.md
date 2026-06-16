---
name: Sportmonks Football API v3 quirks
description: Non-obvious Sportmonks v3 endpoint/id behaviors that broke the World Cup sweepstake sync and live panels.
---

# Sportmonks Football API v3 quirks

External API behavior that is not discoverable from our code — confirmed against the live API.

## League id vs Season id are different numbers
- A *league* id (e.g. World Cup = `732`) is NOT a season id. Season-scoped endpoints
  (`/teams/seasons/:id`, `/standings/seasons/:id`) require the **season** id (e.g. `26618`).
- Querying a season endpoint with a league id returns HTTP 200 with an **empty** `data` array
  (silent zero), not an error. That is exactly how "0 teams / 0 matches" happened.
- **How to apply:** when a sweepstake config stores both a competition/league code and a
  season field, season-scoped fetches must use the season field.

## `/fixtures/seasons/:id` does NOT exist in v3
- It 404s. To list a season's fixtures, use the filtered endpoint:
  `/fixtures?filters=fixtureSeasons:<seasonId>&include=participants;scores;stage;group;state&per_page=50&page=N`
  — it is **paginated** (`pagination.has_more`); walk pages.
- For a rolling "now/next" window use `/fixtures/between/<YYYY-MM-DD>/<YYYY-MM-DD>?filters=fixtureLeagues:<leagueId>`.
- **Why:** a 404 here made the live now/next panel silently degrade to "unavailable".

## Season team list includes bracket placeholders
- `/teams/seasons/<seasonId>` for the World Cup returns 112 entries: 48 real nations plus
  64 placeholders ("Winner Quarter-final 1", "1st Group L"). Real teams have `placeholder !== true`.
- Filter `placeholder === true` out for any draw/sweepstake team pool.

## Fixture shape for mapping
- Team names: `participants[]` with `meta.location` === `"home"` / `"away"`.
- Live score: `scores[]` entry where `description === "CURRENT"`, keyed by `score.participant`
  (`"home"`/`"away"`), value `score.goals`.
- Kickoff: prefer `starting_at_timestamp` (unix seconds → ×1000); `starting_at` is a space-separated
  UTC string needing `replace(" ","T")+"Z"`.

**General trap:** Sportmonks returns 200 + empty data for wrong-id queries, so a sync that
"succeeds" with zero rows is a strong signal of a wrong id or wrong endpoint, not an empty tournament.
