-- D/ST streamer output: one PRD section 11 JSON document per (season, week, scoring preset),
-- written by `streamer build --publish` in nfl/dst-streamer and read by /nfl/dst.
-- Run by hand in the Supabase SQL editor: this repo has no migration tool.

create table if not exists public.nfl_dst_rankings (
  season          integer not null,
  week            integer not null,
  scoring_preset  text not null,          -- config/scoring/<name>.yaml
  schema_version  integer not null,
  stage           text not null,          -- early | daily | final | manual
  generated_at    timestamptz not null,
  doc             jsonb not null,
  primary key (season, week, scoring_preset)
);

-- Server-side reads and writes only (service role bypasses RLS).
alter table public.nfl_dst_rankings enable row level security;
