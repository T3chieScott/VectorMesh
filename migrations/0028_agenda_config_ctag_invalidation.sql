-- Persist the parsing/merge settings fingerprint used for each successful
-- Microsoft-backed agenda sync. A matching workbook cTag may skip only when
-- this fingerprint also matches the current configuration.
--
-- Existing rows remain NULL so they safely reprocess once.
ALTER TABLE agenda_sync_configs
  ADD COLUMN IF NOT EXISTS last_processed_config_fingerprint TEXT;