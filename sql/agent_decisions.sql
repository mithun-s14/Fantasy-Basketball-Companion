-- Coach agent decision log. Run by hand in the Supabase SQL editor:
-- this repo has no migration tool.

create table if not exists public.agent_decisions (
  id             uuid primary key default gen_random_uuid(),
  request_id     uuid not null,
  user_id        uuid references auth.users on delete set null,
  step           integer not null,
  decision_point text not null check (decision_point in ('route', 'verify')),
  engine         text not null,
  is_shadow      boolean not null default false,
  action         text,
  probabilities  jsonb,
  confidence     double precision,
  latency_ms     integer,
  fell_back      boolean not null default false,
  fallback_reason text,
  message_hash   text not null,
  message_text   text,
  created_at     timestamptz not null default now()
);

create index if not exists agent_decisions_request_id_idx
  on public.agent_decisions (request_id);
create index if not exists agent_decisions_created_at_idx
  on public.agent_decisions (created_at desc);

-- Server-side inserts only. No policies are defined, so with RLS enabled the
-- anon and authenticated roles can neither read nor write; the service role
-- bypasses RLS and is what the server uses.
alter table public.agent_decisions enable row level security;
