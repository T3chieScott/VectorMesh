---
name: Sweepstake display payload shape
description: Non-obvious runtime data shape of the public sweepstake display endpoint — how to derive groups and join staff to teams.
---

# Sweepstake display payload (`GET /api/sweepstake/display/:configId`)

The scrubbed public payload has provider-data quirks that are NOT obvious from
the TS types — they only show up at runtime with real provider data:

- **Teams carry `crestUrl` but `countryCode` and `groupName` are often null.**
  Do not rely on `team.groupName` for grouping. Derive a team's group from
  `matches[].groupName` (each match has `homeTeamName`/`awayTeamName` +
  `groupName`) and/or `live.standings[].groupName`. Fold all sources into a
  `lower(teamName) -> group` map.
- **Matches expose `homeTeamName`/`awayTeamName` only — no team IDs.** Join
  matches to teams/staff **by lowercased team name**, not by id.
- **Participants** link to teams via `teamId`/`teamName`; staff are joined to a
  team by lowercased `teamName`. `department` is frequently null.
- **`standings` (static) can be empty while `live.standings` is populated** when
  the config uses a live provider. Prefer live standings for group/crest data.

**Why:** the World Cup demo config (many participants/teams/matches) has these
nulls, so any slide that groups teams or shows the staff<->team link must use
the match/live-standings-derived maps, keyed case-insensitively, or it silently
renders ungrouped / staff-less cards.

**How to apply:** when adding any sweepstake display slide, build the join maps
once (see `buildContext` in `SweepstakeDisplayWidget.tsx`) rather than reading
`team.groupName` directly.
