---
name: Sportmonks results-only periodic sync
description: Why the sweepstake periodic auto-sync uses a date-window merge, not /fixtures/latest or a full season re-pull.
---

# Sportmonks periodic sync = date-window merge, not /fixtures/latest

The sweepstake auto-sync scheduler must NOT re-pull the entire season on
every tick (teams + up to ~20 paginated fixture pages + delete-all
reinsert). For a minute-cadence sync, pull only a small rolling date
window of fixtures and MERGE results by externalId.

**Why not Sportmonks `/fixtures/latest`:** it returns only fixtures
updated in the last ~10 seconds. It is built for ~10s continuous polling.
At our minute-cadence (default 30 min) interval it would miss almost
every score/state change. So the literal "updated results only" endpoint
is the wrong fit despite sounding ideal.

**Why a merge, not replace:** the periodic window pull contains only a
subset of the season's matches. A delete-all+reinsert (or removeMissing)
would wipe every out-of-window match. Merge upserts by
(configId, externalId): update mutable result fields in place keeping the
row id, insert genuinely new fixtures, never delete. Dedupe incoming rows
by externalId first so a repeated provider page can't double-insert.

**How to apply:** periodic path uses the results-only merge only when the
config already has synced matches (some externalId present); first-time /
non-seeded configs fall back to the full season sync to establish teams +
the draw. The manual sync route always does the full pull. Always call
recompute-progress after a merge so winner/elimination still resolves.
Real-time freshness is already handled separately by the live panel
(/livescores/inplay), so periodic sync only needs to persist results.
