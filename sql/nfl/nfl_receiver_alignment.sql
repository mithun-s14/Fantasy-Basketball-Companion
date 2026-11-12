-- WR fantasy points per game from the slot vs out wide, scraped from Razzball (current season only).
-- slot_pct / wide_pct are the share of the player's fantasy POINTS from that alignment, not snap share.
-- Run by hand in the Supabase SQL editor: this repo has no migration tool.

create table if not exists public.nfl_receiver_alignment (
  player     text primary key,          -- e.g. 'CeeDee Lamb'
  team       text not null,             -- abbreviation as Razzball shows it, e.g. 'DAL'
  games      double precision,
  ppg        double precision,          -- total fantasy points per game
  slot_ppg   double precision,
  slot_pct   double precision,          -- percent, e.g. 33
  wide_ppg   double precision,
  wide_pct   double precision,
  scraped_at timestamptz not null default now()
);

-- Server-side writes only (service role bypasses RLS).
alter table public.nfl_receiver_alignment enable row level security;
