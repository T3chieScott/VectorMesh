-- Task #287 — automatic periodic provider sync for sweepstake widgets.
-- Additive, idempotent.
ALTER TABLE sweepstake_widget_configs
  ADD COLUMN IF NOT EXISTS auto_sync_enabled boolean NOT NULL DEFAULT false;
ALTER TABLE sweepstake_widget_configs
  ADD COLUMN IF NOT EXISTS sync_interval_minutes integer NOT NULL DEFAULT 30;
