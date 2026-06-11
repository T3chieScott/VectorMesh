-- Task #281: per-client custom uploaded fonts.
-- Idempotent: safe to re-run on a DB that already has the table.

CREATE TABLE IF NOT EXISTS custom_fonts (
  id varchar PRIMARY KEY DEFAULT gen_random_uuid(),
  client_id varchar NOT NULL REFERENCES clients(id) ON DELETE CASCADE,
  name text NOT NULL,
  original_name text NOT NULL,
  storage_path text NOT NULL,
  format text NOT NULL,
  file_size integer NOT NULL DEFAULT 0,
  created_at timestamp DEFAULT now()
);

CREATE INDEX IF NOT EXISTS custom_fonts_client_id_idx ON custom_fonts(client_id);
