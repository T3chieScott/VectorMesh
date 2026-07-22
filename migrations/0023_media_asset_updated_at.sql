ALTER TABLE media_assets ADD COLUMN IF NOT EXISTS updated_at TIMESTAMP DEFAULT NOW();
UPDATE media_assets SET updated_at = created_at WHERE updated_at IS NULL;
