-- 0002_schedule_block_agenda_config (Task #209): add agenda_config_id to
-- schedule_blocks so a programme block can target a saved agenda widget
-- config directly (fullscreen) instead of (or alongside) a layout. Run
-- after `npm run db:push`. Idempotent.
--
-- LayoutZone.type is stored as JSONB in `layouts.zones`, not as a
-- PostgreSQL enum, so the new "agenda" zone type needs no DDL — only
-- this column-add for direct-target programme blocks. ZoneSource.type
-- is likewise stored inside the `schedule_blocks.zone_sources` JSONB
-- column, so the new "agenda" value needs no enum alteration either.

ALTER TABLE IF EXISTS schedule_blocks
  ADD COLUMN IF NOT EXISTS agenda_config_id varchar;

DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.tables
    WHERE table_name = 'agenda_widget_configs'
  ) AND NOT EXISTS (
    SELECT 1 FROM information_schema.table_constraints
    WHERE constraint_name = 'schedule_blocks_agenda_config_id_fkey'
      AND table_name = 'schedule_blocks'
  ) THEN
    ALTER TABLE schedule_blocks
      ADD CONSTRAINT schedule_blocks_agenda_config_id_fkey
      FOREIGN KEY (agenda_config_id)
      REFERENCES agenda_widget_configs(id)
      ON DELETE SET NULL;
  END IF;
END $$;
