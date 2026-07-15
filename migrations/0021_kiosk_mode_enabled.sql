-- Task #303: opt-in reusable pairing code ("kiosk mode") per screen.
-- When ON, /api/player/pair re-accepts the screen's code while it is
-- already paired (fresh token replaces the old one) so kiosk PCs that
-- wipe browser storage on reboot can auto re-pair from a ?code= URL.
-- Idempotent: safe to run repeatedly.
ALTER TABLE screens
  ADD COLUMN IF NOT EXISTS kiosk_mode_enabled boolean DEFAULT false;
