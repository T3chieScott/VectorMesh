-- Task #311: per-site folders for scenes (layout templates), mirroring
-- media_folders. Deleting a folder must NOT delete scenes: folder_id on
-- layout_templates uses ON DELETE SET NULL. Idempotent.

CREATE TABLE IF NOT EXISTS layout_folders (
  id varchar PRIMARY KEY DEFAULT gen_random_uuid(),
  client_id varchar NOT NULL REFERENCES clients(id) ON DELETE CASCADE,
  name text NOT NULL,
  created_at timestamp DEFAULT now()
);

ALTER TABLE layout_templates
  ADD COLUMN IF NOT EXISTS folder_id varchar REFERENCES layout_folders(id) ON DELETE SET NULL;
