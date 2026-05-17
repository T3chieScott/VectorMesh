-- 0003_agenda_sync_configs (Task #210): add the agenda_sync_configs
-- table and the per-item linkage columns (external_sync_config_id,
-- external_id, manual_override) used by the agenda-sync engine to pull
-- session schedules from ICS feeds and published Google Sheets CSVs.
-- Run after `npm run db:push` or apply directly. Idempotent.

CREATE TABLE IF NOT EXISTS agenda_sync_configs (
  id varchar PRIMARY KEY DEFAULT gen_random_uuid(),
  client_id varchar NOT NULL REFERENCES clients(id) ON DELETE CASCADE,
  name text NOT NULL,
  source_type text NOT NULL,
  source_url text NOT NULL,
  enabled boolean NOT NULL DEFAULT true,
  sync_interval_minutes integer NOT NULL DEFAULT 60,
  last_sync_at timestamp,
  last_sync_ok boolean,
  last_error text,
  last_error_at timestamp,
  last_item_count integer,
  created_at timestamp NOT NULL DEFAULT now(),
  updated_at timestamp NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS agenda_sync_configs_client_id_idx
  ON agenda_sync_configs(client_id);

ALTER TABLE IF EXISTS agenda_items
  ADD COLUMN IF NOT EXISTS external_sync_config_id varchar,
  ADD COLUMN IF NOT EXISTS external_id text,
  ADD COLUMN IF NOT EXISTS manual_override boolean NOT NULL DEFAULT false;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.table_constraints
    WHERE constraint_name = 'agenda_items_external_sync_config_id_fkey'
      AND table_name = 'agenda_items'
  ) THEN
    ALTER TABLE agenda_items
      ADD CONSTRAINT agenda_items_external_sync_config_id_fkey
      FOREIGN KEY (external_sync_config_id)
      REFERENCES agenda_sync_configs(id)
      ON DELETE SET NULL;
  END IF;
END $$;

-- Unique (sync_config, external_id) so the upsert merge logic in
-- server/agendaSync.ts can locate the matching row deterministically.
CREATE UNIQUE INDEX IF NOT EXISTS agenda_items_sync_external_id_unique
  ON agenda_items(external_sync_config_id, external_id)
  WHERE external_sync_config_id IS NOT NULL AND external_id IS NOT NULL;
