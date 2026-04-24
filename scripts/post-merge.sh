#!/bin/bash
set -e
npm install
npm run db:push

# Backfill playlists.client_id from associated events for legacy rows.
# Idempotent: only updates rows where client_id is still NULL and event_id is set.
# Orphan playlists (event_id NULL) remain client_id NULL by design — they are
# admin-only and must be reassigned or deleted manually.
psql "$DATABASE_URL" -c "
  UPDATE playlists
  SET client_id = events.client_id
  FROM events
  WHERE playlists.event_id = events.id
    AND playlists.client_id IS NULL;
"
