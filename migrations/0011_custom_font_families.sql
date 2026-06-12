-- Task #281 follow-up: font families. Each uploaded file becomes a specific
-- weight + style within a family. Files that share family_id are one family;
-- the browser auto-switches between them as text is bolded / italicised.
--
-- Backward compatibility: existing single-file fonts each become their own
-- family with family_id = id, so any stored `custom:<id>` reference still
-- resolves to `vmfont-<id>` exactly as before.

ALTER TABLE custom_fonts ADD COLUMN IF NOT EXISTS family_id varchar;
ALTER TABLE custom_fonts ADD COLUMN IF NOT EXISTS weight integer NOT NULL DEFAULT 400;
ALTER TABLE custom_fonts ADD COLUMN IF NOT EXISTS style text NOT NULL DEFAULT 'normal';

-- Backfill: pre-existing rows become a one-file family keyed on their own id.
UPDATE custom_fonts SET family_id = id WHERE family_id IS NULL;

ALTER TABLE custom_fonts ALTER COLUMN family_id SET DEFAULT gen_random_uuid();
ALTER TABLE custom_fonts ALTER COLUMN family_id SET NOT NULL;

CREATE INDEX IF NOT EXISTS idx_custom_fonts_family_id ON custom_fonts(family_id);
