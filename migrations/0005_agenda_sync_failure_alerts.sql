-- 0005_agenda_sync_failure_alerts (Task #220): add the two columns the
-- agenda-sync engine uses to alert site admins when a feed has been
-- failing for a while. `consecutive_failure_count` is bumped on every
-- failed sync and reset to 0 on success; `failure_alert_sent` is the
-- one-shot guard that flips true when the failure streak first crosses
-- the alert threshold (so we notify once per outage) and resets false
-- on the next successful sync (which also sends a "recovered" email).
-- See server/agendaSync.ts. Run after `npm run db:push` or apply
-- directly. Idempotent.

ALTER TABLE IF EXISTS agenda_sync_configs
  ADD COLUMN IF NOT EXISTS consecutive_failure_count integer NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS failure_alert_sent boolean NOT NULL DEFAULT false;
