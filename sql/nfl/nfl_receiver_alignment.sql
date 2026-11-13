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

-- Usage + next-game matchup from nflverse (stats_player_week, snap_counts, nfldata games.csv).
-- Shares are percents of team targets / air yards; opp is nflverse's code, '@' prefix = away.
alter table public.nfl_receiver_alignment
  add column if not exists snap_pct   double precision,  -- avg offensive snap %, games played
  add column if not exists tgt_pg     double precision,
  add column if not exists tgt_pct    double precision,  -- avg weekly target share
  add column if not exists tgt_l3_pct double precision,  -- same, last 3 games played
  add column if not exists air_pct    double precision,  -- avg weekly air yards share
  add column if not exists opp        text,              -- next unplayed game, e.g. 'DEN' or '@DEN'; null on bye/season end
  add column if not exists team_total double precision,  -- Vegas implied points for the player's team in that game
  add column if not exists opp_wr_ppg double precision;  -- PPR points that defense allows to WRs per game

-- What the next opponent allows to WRs from the slot / out wide (Razzball defensive-slot-vs-wide-ppg-allowed).
alter table public.nfl_receiver_alignment
  add column if not exists opp_slot_ppg double precision,
  add column if not exists opp_wide_ppg double precision;
