-- Lanyard schema. Paste into Supabase: SQL Editor -> New query -> Run.
-- Safe to run more than once.

-- ---------------------------------------------------------------------------
-- events: one row per show we track. source_url is the directory page.
-- ---------------------------------------------------------------------------
create table if not exists events (
  id          uuid primary key default gen_random_uuid(),
  name        text not null,
  source_url  text not null unique,
  city        text,
  starts_on   date,
  created_at  timestamptz not null default now()
);

-- ---------------------------------------------------------------------------
-- companies: one row per organisation per event.
--
-- first_seen_at / last_seen_at are what make the Watcher possible. Rather than
-- storing a full copy of the list every day and diffing two big snapshots, each
-- harvest stamps the rows it saw. "New since last Tuesday" is then just a
-- query on first_seen_at — cheap, and it stays cheap as the table grows.
-- ---------------------------------------------------------------------------
create table if not exists companies (
  id             uuid primary key default gen_random_uuid(),
  event_id       uuid not null references events(id) on delete cascade,
  name           text not null,
  website        text,
  booth          text,
  category       text,
  role           text not null default 'unknown',

  -- provenance; see architecture.md
  source_url     text not null,
  evidence       text,
  first_seen_at  timestamptz not null default now(),
  last_seen_at   timestamptz not null default now(),

  -- filled in at the scoring step
  icp_score      int,
  icp_reason     text,
  scored_at      timestamptz,

  unique (event_id, name)
);

create index if not exists companies_event_idx      on companies (event_id);
create index if not exists companies_first_seen_idx on companies (event_id, first_seen_at desc);
create index if not exists companies_score_idx      on companies (event_id, icp_score desc nulls last);

-- ---------------------------------------------------------------------------
-- harvests: a log line per run. Lets the Watcher say "checked at 6am, nothing
-- changed" instead of going silent, and shows whether a list is still growing.
-- ---------------------------------------------------------------------------
create table if not exists harvests (
  id           uuid primary key default gen_random_uuid(),
  event_id     uuid not null references events(id) on delete cascade,
  ran_at       timestamptz not null default now(),
  method       text not null,
  total_found  int  not null default 0,
  new_count    int  not null default 0,
  rejected     int  not null default 0,
  notes        text[]
);

create index if not exists harvests_event_idx on harvests (event_id, ran_at desc);

-- ---------------------------------------------------------------------------
-- Row Level Security on, with no policies: nothing reaches this data through
-- the public key. The server uses the secret key, which bypasses RLS by design.
-- Add policies later if the browser ever needs to read directly.
-- ---------------------------------------------------------------------------
alter table events    enable row level security;
alter table companies enable row level security;
alter table harvests  enable row level security;
