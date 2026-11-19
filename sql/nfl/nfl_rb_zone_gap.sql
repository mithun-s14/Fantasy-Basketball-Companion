-- RB zone vs gap rushing attempts (Razzball zonevsgap) plus what this week's opponent allows on
-- zone / gap runs (Razzball defensezonevsgap). Filled by npm run nfl:scrape-receivers; each scrape replaces the table.
-- Run by hand in the Supabase SQL editor: this repo has no migration tool.

create table if not exists public.nfl_rb_zone_gap (
  player       text primary key,          -- e.g. 'Derrick Henry'
  team         text not null,             -- Razzball code, e.g. 'BLT'
  games        double precision,
  zone_att     double precision,
  zone_pct     double precision,          -- percent of the player's rush attempts, e.g. 65
  gap_att      double precision,
  gap_pct      double precision,
  total_att    double precision,          -- includes "other" (non zone/gap) runs
  opp          text,                      -- this week's opponent, nflverse code ('@' = away), or 'BYE'
  opp_zone_ypg double precision,          -- zone rush yards per game that opponent allows
  opp_gap_ypg  double precision,          -- gap rush yards per game that opponent allows
  scraped_at   timestamptz not null default now()
);

-- Server-side writes only (service role bypasses RLS).
alter table public.nfl_rb_zone_gap enable row level security;
