-- Keep the session sponsor/company separate from a presenter's affiliation.
ALTER TABLE agenda_items
  ADD COLUMN IF NOT EXISTS presenter_company TEXT,
  ADD COLUMN IF NOT EXISTS source_ordinal INTEGER;

DO $$
DECLARE
  had_show_company BOOLEAN;
BEGIN
  PERFORM pg_advisory_xact_lock(715129041);

  SELECT EXISTS (
    SELECT 1
    FROM information_schema.columns
    WHERE table_schema = current_schema()
      AND table_name = 'agenda_widget_configs'
      AND column_name = 'show_company'
  ) INTO had_show_company;

  ALTER TABLE agenda_widget_configs
    ADD COLUMN IF NOT EXISTS show_company BOOLEAN NOT NULL DEFAULT TRUE,
    ADD COLUMN IF NOT EXISTS show_presenter_company BOOLEAN NOT NULL DEFAULT FALSE,
    ADD COLUMN IF NOT EXISTS presenter_company_color TEXT;

  -- Before this migration, the company field followed presenter visibility.
  -- Preserve that behaviour for existing configurations while leaving the
  -- independent presenter-affiliation toggle opt-in. Do not repeat this on a
  -- later idempotent run, since an operator may have explicitly changed it.
  IF NOT had_show_company THEN
    UPDATE agenda_widget_configs
    SET show_company = COALESCE(show_presenter, TRUE);
  END IF;

  WITH ranked AS (
    SELECT id,
           ROW_NUMBER() OVER (
             PARTITION BY external_sync_config_id
             ORDER BY starts_at ASC, id ASC
           ) - 1 AS ordinal
    FROM agenda_items
    WHERE external_sync_config_id IS NOT NULL
      AND source_ordinal IS NULL
  )
  UPDATE agenda_items a
     SET source_ordinal = ranked.ordinal
    FROM ranked
   WHERE a.id = ranked.id;
END $$;