-- Task #362 — Agenda snapshot table for the SharePoint Excel connector.
--
-- Each successful Microsoft-backed sync writes all normalised items into a
-- snapshot row inside a single DB transaction. The config pointer swaps to
-- the new snapshot only after the transaction commits. A failed sync leaves
-- the previous snapshot untouched so displays keep serving last-known-good
-- data. Idempotent: safe to re-run on any existing database.
--
-- Order matters:
--   1. Create agenda_item_snapshots first (agenda_sync_configs will FK into it).
--   2. Add last_ctag to agenda_sync_configs.
--   3. Add last_good_snapshot_id FK column (requires the table to exist first).

CREATE TABLE IF NOT EXISTS agenda_item_snapshots (
  id               VARCHAR PRIMARY KEY DEFAULT gen_random_uuid(),
  sync_config_id   VARCHAR NOT NULL REFERENCES agenda_sync_configs(id) ON DELETE CASCADE,
  snapshot_version INTEGER NOT NULL,
  items            JSONB NOT NULL,
  item_count       INTEGER NOT NULL,
  created_at       TIMESTAMP DEFAULT NOW() NOT NULL
);

-- Used to efficiently find the latest snapshot for a config and to prune old ones.
CREATE INDEX IF NOT EXISTS idx_agenda_snapshots_config_version
  ON agenda_item_snapshots (sync_config_id, snapshot_version DESC);

-- last_ctag: the cTag string returned by Microsoft Graph at the time of the
-- last successful download. Compared on each tick; if unchanged the download
-- is skipped entirely (no bytes transferred, no parse, no DB write).
ALTER TABLE agenda_sync_configs
  ADD COLUMN IF NOT EXISTS last_ctag TEXT;

-- last_good_snapshot_id: FK to the last successfully promoted snapshot for
-- this config. SET NULL when the snapshot row is pruned so old configs don't
-- hold orphan references.
ALTER TABLE agenda_sync_configs
  ADD COLUMN IF NOT EXISTS last_good_snapshot_id VARCHAR
    REFERENCES agenda_item_snapshots(id) ON DELETE SET NULL;

-- Task #362 source-health contract — additional runtime state columns.
--
-- ms_file_name: display name of the Excel workbook selected in the file picker
--   (e.g. "Agenda 2026.xlsx"). Set by the client when the operator picks or
--   resolves a file; never a URL or token.
ALTER TABLE agenda_sync_configs
  ADD COLUMN IF NOT EXISTS ms_file_name TEXT;

-- last_published_at: when agenda items were last atomically committed from a
--   Microsoft-backed snapshot. Distinct from last_sync_at (which is set on
--   every outcome including cTag-skip and failure); this is only set when new
--   content was actually written to agenda_items.
ALTER TABLE agenda_sync_configs
  ADD COLUMN IF NOT EXISTS last_published_at TIMESTAMP;

-- last_ctag_changed_at: when the Microsoft Graph cTag last CHANGED relative to
--   the previously stored value. Used to compute "last source-content change"
--   in the health details panel. Set to NOW() whenever a new cTag is stored
--   (i.e. the file changed since the last successful download).
ALTER TABLE agenda_sync_configs
  ADD COLUMN IF NOT EXISTS last_ctag_changed_at TIMESTAMP;

-- last_snapshot_version: denormalised snapshot version number from the last
--   successfully promoted agenda_item_snapshots row. Avoids a JOIN when
--   rendering the health details panel.
ALTER TABLE agenda_sync_configs
  ADD COLUMN IF NOT EXISTS last_snapshot_version INTEGER;
