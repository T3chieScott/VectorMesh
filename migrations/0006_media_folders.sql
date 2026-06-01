-- 0006_media_folders (Task #265): per-site flat folders for the media
-- library. `media_folders` is a simple per-client (site) bucket; assets
-- reference at most one folder via `media_assets.folder_id`. Deleting a
-- folder must NOT delete the assets inside it, so the FK is
-- ON DELETE SET NULL (the assets just fall back to the Uncategorised
-- view). Folders are clientId-scoped and cascade-deleted with their
-- client. Run after `npm run db:push` or apply directly. Idempotent.

CREATE TABLE IF NOT EXISTS media_folders (
  id varchar PRIMARY KEY DEFAULT gen_random_uuid(),
  client_id varchar NOT NULL REFERENCES clients(id) ON DELETE CASCADE,
  name text NOT NULL,
  created_at timestamp DEFAULT now()
);

ALTER TABLE IF EXISTS media_assets
  ADD COLUMN IF NOT EXISTS folder_id varchar
    REFERENCES media_folders(id) ON DELETE SET NULL;
