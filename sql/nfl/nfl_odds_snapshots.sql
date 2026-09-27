-- D/ST streamer: every betting-line snapshot, append-only (PRD FR1.3). Written by
-- `streamer refresh` in nfl/dst-streamer; kept to show line movement and to feed a future model.
-- Run by hand in the Supabase SQL editor: this repo has no migration tool.

create table if not exists public.nfl_odds_snapshots (
  fetched_at_utc  timestamptz not null,
  season          integer not null,
  week            integer not null,
  espn_game_id    text not null,
  home_team       text not null,          -- nflverse code, e.g. 'KC'
  away_team       text not null,
  provider        text not null,          -- bookmaker, e.g. 'DraftKings'
  home_spread     double precision,
  total           double precision,
  home_moneyline  integer,
  away_moneyline  integer,
  primary key (fetched_at_utc, espn_game_id, provider)
);

create index if not exists nfl_odds_snapshots_week_idx on public.nfl_odds_snapshots (season, week);

-- Server-side writes only (service role bypasses RLS).
alter table public.nfl_odds_snapshots enable row level security;
