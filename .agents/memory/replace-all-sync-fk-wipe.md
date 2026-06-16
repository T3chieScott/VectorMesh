---
name: Replace-all sync wipes ON DELETE SET NULL foreign keys
description: Why "delete all + re-insert with new ids" sync helpers silently null every referencing FK; reconcile in place instead.
---

A storage "replace-all" sync that does `DELETE all rows for configId` then
`INSERT` fresh rows with new `gen_random_uuid()` ids will **silently null
every foreign key that references those rows with `ON DELETE SET NULL`** —
even if the re-inserted data is identical. The delete fires the cascade
before the insert runs, and the new rows get new ids, so nothing re-links.

**Why:** In the sweepstake feature, `tournament_teams` was replaced this way
on every provider sync. `sweepstake_participants.teamId` references it
`ON DELETE SET NULL`, so each sync wiped the entire staff→team draw. The
manual "Sync from provider" button always had this bug; adding a periodic
auto-sync made it fire on a timer and destroy the draw repeatedly.

**How to apply:** Any "replace the snapshot" storage helper whose rows are
pointed at by another table's FK must **reconcile in place**, not delete-all:
- match incoming rows to existing rows by a stable external id first, then
  fall back to a natural key (e.g. case-insensitive name) so renames and
  id-add/drop don't drop the match;
- matched → `UPDATE` keeping the existing row id (FKs survive);
- unmatched incoming → `INSERT`;
- existing rows matched by nothing → `DELETE` (this correctly nulls FKs for
  rows that genuinely went away).
Do the whole thing in one transaction. Before writing such a helper, grep the
schema for `references(() => thatTable.id` to find who points at it.
