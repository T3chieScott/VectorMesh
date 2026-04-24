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
