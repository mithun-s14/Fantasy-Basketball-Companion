-- Draft Assistant data foundation (docs/nba/draft-assistant-prd.md, Milestone 1).
-- Run by hand in the Supabase SQL editor: this repo has no migration tool.
-- Run it BEFORE deploying the updated scrape-stats / seed-players scripts.

-- ---------------------------------------------------------------------------
-- player_stats: games played + season, keyed per season
-- ---------------------------------------------------------------------------
alter table public.player_stats add column if not exists gp integer;
alter table public.player_stats add column if not exists season text;

-- Every row scraped so far is 2025-26 (the season was hardcoded in the script).
update public.player_stats set season = '2025-26' where season is null;
alter table public.player_stats alter column season set not null;

-- Old key was (player_name, stat_type). If this name doesn't match yours, find it
-- with: select conname from pg_constraint where conrelid = 'public.player_stats'::regclass;
alter table public.player_stats drop constraint if exists player_stats_player_name_stat_type_key;
alter table public.player_stats
  add constraint player_stats_player_name_stat_type_season_key
  unique (player_name, stat_type, season);

-- ---------------------------------------------------------------------------
-- nba_players: positions, e.g. {PG,SG}
-- ---------------------------------------------------------------------------
alter table public.nba_players
  add column if not exists positions text[] not null default '{}';

-- ---------------------------------------------------------------------------
-- league_profiles
-- ---------------------------------------------------------------------------
create table if not exists public.league_profiles (
  id           uuid primary key default gen_random_uuid(),
  user_id      uuid not null references auth.users on delete cascade,
  name         text not null,
  team_count   integer not null check (team_count between 8 and 20),
  format       text not null check (format in ('h2h_cat', 'roto')),
  categories   text[] not null check (cardinality(categories) > 0),
  roster_slots jsonb not null,           -- e.g. {"PG":1,"SG":1,"G":1,...,"BENCH":3}
  created_at   timestamptz not null default now()
);

create index if not exists league_profiles_user_id_idx on public.league_profiles (user_id);

alter table public.league_profiles enable row level security;
create policy "league_profiles owner" on public.league_profiles
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);

-- ---------------------------------------------------------------------------
-- drafts
-- ---------------------------------------------------------------------------
create table if not exists public.drafts (
  id                uuid primary key default gen_random_uuid(),
  user_id           uuid not null references auth.users on delete cascade,
  league_profile_id uuid not null references public.league_profiles on delete cascade,
  draft_slot        integer not null check (draft_slot >= 1), -- <= team_count checked in the API
  punts             text[] not null default '{}',
  status            text not null default 'active' check (status in ('active', 'complete')),
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now()
);

-- One active draft per profile.
create unique index if not exists drafts_one_active_per_profile
  on public.drafts (league_profile_id) where status = 'active';
create index if not exists drafts_user_id_idx on public.drafts (user_id);

alter table public.drafts enable row level security;
create policy "drafts owner" on public.drafts
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);

-- ---------------------------------------------------------------------------
-- draft_picks (undo = delete the highest overall_pick)
-- ---------------------------------------------------------------------------
create table if not exists public.draft_picks (
  id           uuid primary key default gen_random_uuid(),
  draft_id     uuid not null references public.drafts on delete cascade,
  overall_pick integer not null check (overall_pick >= 1),
  team_slot    integer not null check (team_slot >= 1),
  player_name  text not null,
  created_at   timestamptz not null default now(),
  unique (draft_id, overall_pick),
  unique (draft_id, player_name)
);

alter table public.draft_picks enable row level security;
create policy "draft_picks owner" on public.draft_picks
  for all
  using (exists (select 1 from public.drafts d where d.id = draft_id and d.user_id = auth.uid()))
  with check (exists (select 1 from public.drafts d where d.id = draft_id and d.user_id = auth.uid()));

-- ---------------------------------------------------------------------------
-- player_adp (filled by src/scripts/load-adp.ts)
-- ---------------------------------------------------------------------------
create table if not exists public.player_adp (
  player_name text not null,
  season      text not null,
  source      text not null,
  adp         double precision not null,
  adp_std     double precision,              -- null: draft.ts uses max(2, 0.2 * adp)
  updated_at  timestamptz not null default now(),
  primary key (player_name, season, source)
);

-- Public read; writes come from the service role, which bypasses RLS.
alter table public.player_adp enable row level security;
create policy "player_adp read" on public.player_adp for select using (true);

-- ---------------------------------------------------------------------------
-- Milestone 2: the settings form saves the user's draft slot with the league
-- (LS-4); a draft copies it into drafts.draft_slot when it starts.
-- ---------------------------------------------------------------------------
alter table public.league_profiles
  add column if not exists draft_slot integer not null default 1
  check (draft_slot between 1 and team_count);

-- ---------------------------------------------------------------------------
-- Milestone 4: when the user saved this draft's picks as their roster (RH-1).
-- ---------------------------------------------------------------------------
alter table public.drafts add column if not exists roster_saved_at timestamptz;

-- Success metrics (PRD "Success metrics"), run by hand:
--
-- Drafts completed / started (target >= 60%):
--   select count(*) filter (where status = 'complete')::float / nullif(count(*), 0) from public.drafts;
--
-- Completed drafts saved as a roster (target >= 70%):
--   select count(*) filter (where roster_saved_at is not null)::float / nullif(count(*), 0)
--   from public.drafts where status = 'complete';
--
-- Median seconds between recorded picks (target <= 5 s of entry time; this
-- includes the real draft clock, so read it as an upper bound):
--   select percentile_cont(0.5) within group (order by gap) from (
--     select extract(epoch from created_at - lag(created_at) over (partition by draft_id order by overall_pick)) as gap
--     from public.draft_picks) g where gap is not null;
