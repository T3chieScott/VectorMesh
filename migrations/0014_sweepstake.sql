-- Task #286: World Football Sweepstake Wall widget.
-- Five additive tables. Configs + participants are tenant-scoped via
-- client_id; tournament data (teams/matches/standings) is cached external
-- data scoped to the owning config. All idempotent.

CREATE TABLE IF NOT EXISTS sweepstake_widget_configs (
  id varchar PRIMARY KEY DEFAULT gen_random_uuid(),
  client_id varchar NOT NULL REFERENCES clients(id) ON DELETE CASCADE,
  name text NOT NULL,
  tournament_name text NOT NULL DEFAULT 'World Football Sweepstake',
  provider text NOT NULL DEFAULT 'manual',
  competition_code text,
  season text,
  kickoff_at timestamp,
  layout_mode text NOT NULL DEFAULT 'auto',
  theme text NOT NULL DEFAULT 'bright',
  accent_color text NOT NULL DEFAULT '#16a34a',
  refresh_interval_seconds integer NOT NULL DEFAULT 30,
  rotation_interval_seconds integer NOT NULL DEFAULT 12,
  slide_types text[] NOT NULL DEFAULT '{}'::text[],
  last_synced_at timestamp,
  last_sync_error text,
  created_at timestamp DEFAULT now(),
  updated_at timestamp DEFAULT now()
);

CREATE TABLE IF NOT EXISTS tournament_teams (
  id varchar PRIMARY KEY DEFAULT gen_random_uuid(),
  config_id varchar NOT NULL REFERENCES sweepstake_widget_configs(id) ON DELETE CASCADE,
  external_id text,
  name text NOT NULL,
  short_name text,
  country_code text,
  group_name text,
  crest_url text,
  eliminated boolean NOT NULL DEFAULT false,
  eliminated_at timestamp,
  is_winner boolean NOT NULL DEFAULT false,
  created_at timestamp DEFAULT now(),
  updated_at timestamp DEFAULT now()
);

CREATE TABLE IF NOT EXISTS tournament_matches (
  id varchar PRIMARY KEY DEFAULT gen_random_uuid(),
  config_id varchar NOT NULL REFERENCES sweepstake_widget_configs(id) ON DELETE CASCADE,
  external_id text,
  stage text,
  group_name text,
  home_team_id varchar REFERENCES tournament_teams(id) ON DELETE SET NULL,
  away_team_id varchar REFERENCES tournament_teams(id) ON DELETE SET NULL,
  home_team_name text,
  away_team_name text,
  home_score integer,
  away_score integer,
  status text NOT NULL DEFAULT 'scheduled',
  kickoff_at timestamp,
  winner_team_id varchar,
  created_at timestamp DEFAULT now(),
  updated_at timestamp DEFAULT now()
);

CREATE TABLE IF NOT EXISTS tournament_standings (
  id varchar PRIMARY KEY DEFAULT gen_random_uuid(),
  config_id varchar NOT NULL REFERENCES sweepstake_widget_configs(id) ON DELETE CASCADE,
  team_id varchar REFERENCES tournament_teams(id) ON DELETE SET NULL,
  team_name text NOT NULL,
  group_name text,
  position integer,
  played integer NOT NULL DEFAULT 0,
  won integer NOT NULL DEFAULT 0,
  draw integer NOT NULL DEFAULT 0,
  lost integer NOT NULL DEFAULT 0,
  goals_for integer NOT NULL DEFAULT 0,
  goals_against integer NOT NULL DEFAULT 0,
  goal_difference integer NOT NULL DEFAULT 0,
  points integer NOT NULL DEFAULT 0,
  created_at timestamp DEFAULT now(),
  updated_at timestamp DEFAULT now()
);

CREATE TABLE IF NOT EXISTS sweepstake_participants (
  id varchar PRIMARY KEY DEFAULT gen_random_uuid(),
  config_id varchar NOT NULL REFERENCES sweepstake_widget_configs(id) ON DELETE CASCADE,
  client_id varchar NOT NULL REFERENCES clients(id) ON DELETE CASCADE,
  name text NOT NULL,
  email text,
  department text,
  team_id varchar REFERENCES tournament_teams(id) ON DELETE SET NULL,
  status text NOT NULL DEFAULT 'active',
  manual_override boolean NOT NULL DEFAULT false,
  created_at timestamp DEFAULT now(),
  updated_at timestamp DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_tournament_teams_config ON tournament_teams(config_id);
CREATE INDEX IF NOT EXISTS idx_tournament_matches_config ON tournament_matches(config_id);
CREATE INDEX IF NOT EXISTS idx_tournament_standings_config ON tournament_standings(config_id);
CREATE INDEX IF NOT EXISTS idx_sweepstake_participants_config ON sweepstake_participants(config_id);
CREATE INDEX IF NOT EXISTS idx_sweepstake_widget_configs_client ON sweepstake_widget_configs(client_id);
