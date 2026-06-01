---
name: schema-migrations
description: How DB schema changes are applied in this repo (db:push + hand-written idempotent SQL migration files)
---

# Schema changes need BOTH db:push and a migration file

When you change `shared/schema.ts`, do two things:

1. Run `npm run db:push` (drizzle-kit push) to apply the change to the dev DB.
2. Add a new numbered, **idempotent** SQL file under `migrations/`
   (e.g. `0006_media_folders.sql`), matching the style of the existing
   `0001`–`0005` files: a comment header explaining the change + `CREATE TABLE
   IF NOT EXISTS` / `ADD COLUMN IF NOT EXISTS` statements.

**Why:** `drizzle.config.ts` has `out: "./migrations"`, and the repo keeps
hand-written idempotent migration files that are applied manually to
production ("Run after `npm run db:push` or apply directly. Idempotent." is the
standard header). db:push alone updates dev but leaves prod without a
record/apply path. Code review flags a missing migration file as a blocking
gap even when db:push has run.

**How to apply:** any new table/column/FK in `shared/schema.ts` → bump to the
next `NNNN_*.sql` number in `migrations/` with IF [NOT] EXISTS guards so
re-running on an already-migrated DB is a safe no-op.
