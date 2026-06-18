-- Sweepstake wall loop: ordered list of built-in + custom media slides.
-- Adds a JSONB column holding the reorderable loop. Empty array = fall back to
-- the legacy `slide_types` behaviour (built-in slides only, no media).
ALTER TABLE sweepstake_widget_configs
  ADD COLUMN IF NOT EXISTS slide_order jsonb NOT NULL DEFAULT '[]'::jsonb;
