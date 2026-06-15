-- Task #287: World Cup Live + Sweepstake Hype Wall.
-- Additive columns on the sweepstake widget config so operators can turn live
-- World Cup panels on/off, pick which panels to show and set the live refresh
-- cadence. All idempotent — safe to re-run.

ALTER TABLE sweepstake_widget_configs
  ADD COLUMN IF NOT EXISTS live_enabled boolean NOT NULL DEFAULT false;

ALTER TABLE sweepstake_widget_configs
  ADD COLUMN IF NOT EXISTS live_panels text[] NOT NULL DEFAULT '{}'::text[];

ALTER TABLE sweepstake_widget_configs
  ADD COLUMN IF NOT EXISTS live_refresh_seconds integer NOT NULL DEFAULT 15;
