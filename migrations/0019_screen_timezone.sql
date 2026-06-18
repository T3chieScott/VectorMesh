-- Per-screen IANA timezone override. NULL means the screen inherits its
-- owning client/site timezone (clients.timezone). A non-null value (e.g.
-- "Europe/Paris") formats times such as sweepstake kick-offs in the
-- screen's own local time regardless of the site default or the player
-- device's OS clock. Idempotent so it is safe to re-run.
ALTER TABLE screens ADD COLUMN IF NOT EXISTS timezone text;
