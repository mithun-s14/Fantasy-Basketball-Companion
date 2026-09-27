-- NFL team stats scraped from TeamRankings, one row per (team, season, stat).
-- Run by hand in the Supabase SQL editor: this repo has no migration tool.

create table if not exists public.nfl_team_stats (
  team            text not null,          -- full name, e.g. 'New York Giants'
  season          integer not null,
  stat            text not null,          -- TeamRankings slug, e.g. 'field-goal-attempts-per-game'
  season_avg      double precision,
  last3           double precision,
  last1           double precision,
  home            double precision,
  away            double precision,
  prev_season_avg double precision,
  scraped_at      timestamptz not null default now(),
  primary key (team, season, stat)
);

-- Server-side writes only (service role bypasses RLS).
alter table public.nfl_team_stats enable row level security;
