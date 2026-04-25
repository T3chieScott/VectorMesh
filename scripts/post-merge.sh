#!/bin/bash
set -e
npm install
npm run db:push

# Backfill playlists.client_id from associated events for legacy rows.
# Idempotent: only updates rows where client_id is still NULL and event_id is set.
echo "[post-merge] Backfilling playlists.client_id from events..."
psql "$DATABASE_URL" -c "
  UPDATE playlists
  SET client_id = events.client_id
  FROM events
  WHERE playlists.event_id = events.id
    AND playlists.client_id IS NULL;
"

# Report any orphan playlists that still have no client_id (no event, or event missing).
# These rows are admin-only and need to be reassigned or deleted manually.
echo "[post-merge] Reporting orphan playlists with no site assignment..."
psql "$DATABASE_URL" -c "
  SELECT id, name, event_id, created_at
  FROM playlists
  WHERE client_id IS NULL
  ORDER BY created_at;
"

ORPHAN_COUNT=$(psql "$DATABASE_URL" -t -A -c "SELECT count(*) FROM playlists WHERE client_id IS NULL;")
echo "[post-merge] Orphan playlists remaining: ${ORPHAN_COUNT}"
if [ "${ORPHAN_COUNT}" != "0" ]; then
  echo "[post-merge] WARNING: ${ORPHAN_COUNT} playlist(s) have no client_id. They are admin-only until reassigned via the playlist admin UI."
fi

# Backfill clients.timezone for installs that need a default other than
# Europe/London (the schema-level default). Idempotent: only updates rows
# that still match the seed default — admin-edited rows are left alone.
# Override the default by setting DEFAULT_SCHEDULE_TIMEZONE in the env
# before the post-merge step runs.
DEFAULT_SCHEDULE_TZ="${DEFAULT_SCHEDULE_TIMEZONE:-Europe/London}"
# Validate the requested zone via Node's Intl. If it's bogus, fall back to
# the seed default rather than writing junk that would later trip up the
# tz-aware evaluators at runtime.
if ! node -e "try { new Intl.DateTimeFormat('en-US', { timeZone: process.argv[1] }).format(new Date(0)); } catch { process.exit(1); }" "$DEFAULT_SCHEDULE_TZ" >/dev/null 2>&1; then
  echo "[post-merge] WARNING: DEFAULT_SCHEDULE_TIMEZONE='${DEFAULT_SCHEDULE_TZ}' is not a recognised IANA zone; falling back to Europe/London for the backfill."
  DEFAULT_SCHEDULE_TZ="Europe/London"
fi
echo "[post-merge] Backfilling clients.timezone to '${DEFAULT_SCHEDULE_TZ}' (only rows still on the seed default)..."
psql "$DATABASE_URL" -v "tz=${DEFAULT_SCHEDULE_TZ}" -c "
  UPDATE clients SET timezone = :'tz'
  WHERE timezone = 'Europe/London' AND :'tz' <> 'Europe/London';
"
