-- NFL defensive coverage rates scraped from Sharp Football Analysis, one row per team (current season only).
-- Run by hand in the Supabase SQL editor: this repo has no migration tool.

create table if not exists public.nfl_coverage_schemes (
  team               text primary key,          -- full name, e.g. 'New York Giants'
  man_rate           double precision,          -- percent of snaps, e.g. 10.6
  zone_rate          double precision,
  middle_closed_rate double precision,
  middle_open_rate   double precision,
  scraped_at         timestamptz not null default now()
);

-- Defensive tendencies (nfl-defensive-tendencies page), same row per team.
alter table public.nfl_coverage_schemes
  add column if not exists blitz_rate       double precision,
  add column if not exists light_box_rate   double precision,
  add column if not exists heavy_box_rate   double precision,
  add column if not exists sub_package_rate double precision;

-- Server-side writes only (service role bypasses RLS).
alter table public.nfl_coverage_schemes enable row level security;
