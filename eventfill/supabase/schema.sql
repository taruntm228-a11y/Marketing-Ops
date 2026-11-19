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

  -- Identity is the normalised name, not the raw one. Organisers re-case their
  -- own exhibitor names between updates ("CO., LTD" to "Co., Ltd"), and a
  -- case-sensitive key turns that into a second row reported as a new booking.
  -- `name` keeps the organiser's own spelling, since that is what gets shown
  -- and what the evidence string has to match.
  name_key text generated always as (lower(regexp_replace(btrim(name), '\s+', ' ', 'g'))) stored
);

create unique index if not exists companies_event_name_key_idx
  on companies (event_id, name_key);

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
-- icp: who the client wants to meet.
--
-- This lived in the browser's local storage, which was fine while a human was
-- always present to press the button. The Watcher runs at 6am with nobody
-- there, and it has to score the exhibitors that appeared overnight — so the
-- profile has to live somewhere the server can read. One row until there are
-- accounts to separate; `singleton` enforces that.
-- ---------------------------------------------------------------------------
create table if not exists icp (
  id                uuid primary key default gen_random_uuid(),
  singleton         boolean not null default true unique,
  company_name      text,
  what_you_sell     text,
  industries        text,
  size_band         text,
  geography         text,
  titles            text,
  disqualifiers     text,
  example_customers text,
  updated_at        timestamptz not null default now()
);

-- ---------------------------------------------------------------------------
-- Row Level Security on, with no policies: nothing reaches this data through
-- the public key. The server uses the secret key, which bypasses RLS by design.
-- Add policies later if the browser ever needs to read directly.
-- ---------------------------------------------------------------------------
alter table events    enable row level security;
alter table companies enable row level security;
alter table harvests  enable row level security;
alter table icp       enable row level security;

-- ---------------------------------------------------------------------------
-- Grants.
--
-- Newer Supabase projects do not automatically grant table privileges to
-- service_role, so without this every request returns
--   42501: permission denied for table events
-- even though the secret key authenticates correctly. RLS is a separate layer:
-- service_role bypasses RLS, but it still needs ordinary SQL privileges first.
--
-- The default-privileges lines cover tables added later, so this file does not
-- have to be re-run after the next migration.
-- ---------------------------------------------------------------------------
grant usage on schema public to service_role;
grant all privileges on all tables    in schema public to service_role;
grant all privileges on all sequences in schema public to service_role;
grant all privileges on all functions in schema public to service_role;

alter default privileges in schema public grant all on tables    to service_role;
alter default privileges in schema public grant all on sequences to service_role;
alter default privileges in schema public grant all on functions to service_role;
