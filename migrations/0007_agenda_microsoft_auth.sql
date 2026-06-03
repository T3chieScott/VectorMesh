-- Task #268 — Microsoft sign-in for the Agenda Spreadsheet Source Mapper.
-- Adds the Microsoft Graph-backed source fields to agenda_sync_configs so
-- private OneDrive/SharePoint Excel files can be fetched via the system
-- Microsoft connector. All additive + nullable (microsoft_auth defaults
-- false) so existing rows keep their public-link / upload behaviour.
-- Idempotent: safe to re-run.

ALTER TABLE agenda_sync_configs
  ADD COLUMN IF NOT EXISTS microsoft_auth boolean NOT NULL DEFAULT false;

ALTER TABLE agenda_sync_configs
  ADD COLUMN IF NOT EXISTS ms_drive_id text;

ALTER TABLE agenda_sync_configs
  ADD COLUMN IF NOT EXISTS ms_item_id text;

ALTER TABLE agenda_sync_configs
  ADD COLUMN IF NOT EXISTS ms_site_id text;
