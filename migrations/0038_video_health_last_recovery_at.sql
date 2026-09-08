-- Track genuine watchdog recovery events separately from ordinary
-- heartbeat receipt. Repeatable for already-upgraded deployments.
ALTER TABLE screens
  ADD COLUMN IF NOT EXISTS video_stats_last_recovery_at TIMESTAMP;