-- Task #398: flat, site-owned folders for agenda display configurations.
-- All operations are additive and idempotent for deployed databases.
CREATE TABLE IF NOT EXISTS agenda_folders (
  id varchar PRIMARY KEY DEFAULT gen_random_uuid(),
  client_id varchar NOT NULL REFERENCES clients(id) ON DELETE CASCADE,
  name text NOT NULL,
  created_at timestamp DEFAULT now()
);

ALTER TABLE agenda_widget_configs
  ADD COLUMN IF NOT EXISTS folder_id varchar
  REFERENCES agenda_folders(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS agenda_folders_client_name_idx
  ON agenda_folders (client_id, name);
CREATE INDEX IF NOT EXISTS agenda_widget_configs_folder_id_idx
  ON agenda_widget_configs (folder_id);