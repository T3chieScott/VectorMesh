-- Penalty shoot-out scores for knockout matches decided on penalties.
-- Lets the losing side be eliminated even though the 90/120-minute score was
-- level (the higher shoot-out score names the winner during recompute).
ALTER TABLE tournament_matches ADD COLUMN IF NOT EXISTS penalty_home_score integer;
ALTER TABLE tournament_matches ADD COLUMN IF NOT EXISTS penalty_away_score integer;
