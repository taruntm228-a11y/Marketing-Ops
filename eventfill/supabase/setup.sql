-- ===========================================================================
-- Lanyard — database setup.
--
-- ONE file. Paste the whole thing into Supabase: SQL Editor -> New query ->
-- Run. It works on an empty database and on one that already has data, and
-- running it twice does nothing the second time.
--
-- It replaces schema.sql and migration-name-key.sql, which had to be run in a
-- particular order. They didn't say so clearly enough, and the first one
-- failed on a database that already had a companies table.
-- ===========================================================================


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
-- storing a full copy of the list every day and diffing two big snapshots,
-- each harvest stamps the rows it saw. "New since last Tuesday" is then just a
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
  scored_at      timestamptz
);


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
-- A company's identity is its normalised name, not the raw one.
--
-- Seen live on BICSI: "Longtek Technology (Thailand) CO., LTD" became
-- "Longtek Technology (Thailand) Co., Ltd" between two harvests — same booth,
-- same company — and landed as a second row, reported as a new exhibitor.
--
-- The diff already compared names case-insensitively, but the old unique
-- constraint on (event_id, name) was case-sensitive, so the upsert inserted
-- instead of updating. Two layers disagreeing about identity.
--
-- `name` keeps the organiser's own spelling, because that is what gets shown
-- and what the evidence string has to match. The key is only for matching.
--
-- What the key ignores: case, spacing, and punctuation. The same organiser
-- wrote all three of these across three harvests of one show —
--
--   Longtek Technology (Thailand) CO., LTD
--   Longtek Technology (Thailand) Co., Ltd
--   LONGTEK TECHNOLOGY (THAILAND) CO., LTD.
--
-- — and a key that respects a trailing full stop treats the third as a company
-- that booked a booth this week.
--
-- What the key keeps: every word. Stripping "Inc" or "Ltd" would merge
-- Riverbend Controls Inc at booth 418 with Riverbend Controls Ltd at 419,
-- which are two different companies with two different booths. Punctuation is
-- noise; words are signal.
--
-- Accented and non-Latin letters survive, because [:punct:] does not touch
-- them — mangling them into spaces would risk merging two foreign names that
-- differ only in their accents.
--
-- Dropped and re-added rather than "add if not exists", so that a change to
-- the rule above actually reaches a database set up by an earlier version of
-- this file. A generated column holds no data of its own, so there is nothing
-- to lose by rebuilding it. Cascade takes the unique index with it; it is
-- recreated below, after the merge.
-- ---------------------------------------------------------------------------
alter table companies drop column if exists name_key cascade;

alter table companies
  add column name_key text
  generated always as (
    lower(btrim(regexp_replace(name, '[[:punct:][:space:]]+', ' ', 'g')))
  ) stored;


-- ---------------------------------------------------------------------------
-- Merge any rows that were already split by the old constraint.
--
-- Merging is not "delete the extra row". Each copy may hold something the
-- other does not: one was scored last week, the other has the booth number
-- from this morning's harvest. Deleting either loses real information, and a
-- company whose score is wiped gets re-scored tomorrow for nothing.
--
-- So the group is rolled up first and the surviving row is given the best of
-- everything, then the copies go:
--
--   first_seen_at  earliest  — the later date would mark an old exhibitor as
--                              this week's news, the one thing the Watcher
--                              must never get wrong
--   last_seen_at   latest    — it was on the floor as recently as any copy
--   score          whichever copy has one, most recently scored first
--   booth, etc.    whichever copy has one, most recently seen first
--
-- The survivor is the most recently seen copy, so `name` keeps the
-- organiser's current spelling.
-- ---------------------------------------------------------------------------
with survivor as (
  select id, event_id, name_key
  from (
    select id, event_id, name_key,
           row_number() over (
             partition by event_id, name_key
             order by last_seen_at desc, id asc
           ) as rn
    from companies
  ) ranked
  where rn = 1
),
rollup as (
  select
    event_id,
    name_key,
    min(first_seen_at) as first_seen_at,
    max(last_seen_at)  as last_seen_at,
    max(scored_at)     as scored_at,
    (array_agg(icp_score  order by scored_at desc nulls last)
       filter (where icp_score is not null))[1] as icp_score,
    (array_agg(icp_reason order by scored_at desc nulls last)
       filter (where icp_score is not null))[1] as icp_reason,
    (array_agg(booth    order by last_seen_at desc) filter (where booth    is not null))[1] as booth,
    (array_agg(website  order by last_seen_at desc) filter (where website  is not null))[1] as website,
    (array_agg(category order by last_seen_at desc) filter (where category is not null))[1] as category,
    (array_agg(evidence order by last_seen_at desc) filter (where evidence is not null))[1] as evidence
  from companies
  group by event_id, name_key
)
update companies c
set first_seen_at = r.first_seen_at,
    last_seen_at  = r.last_seen_at,
    icp_score     = r.icp_score,
    icp_reason    = r.icp_reason,
    scored_at     = r.scored_at,
    booth         = r.booth,
    website       = r.website,
    category      = r.category,
    evidence      = r.evidence
from survivor s
join rollup r on r.event_id = s.event_id and r.name_key = s.name_key
where c.id = s.id;

-- Now the copies. The survivor still sorts first: the update only ever raised
-- its last_seen_at to the group maximum, which it already held.
delete from companies c
using (
  select id
  from (
    select id,
           row_number() over (
             partition by event_id, name_key
             order by last_seen_at desc, id asc
           ) as rn
    from companies
  ) t
  where t.rn > 1
) dupes
where c.id = dupes.id;


-- ---------------------------------------------------------------------------
-- Swap uniqueness over to the normalised key, and index for the queries the
-- app actually makes.
-- ---------------------------------------------------------------------------
alter table companies drop constraint if exists companies_event_id_name_key;

create unique index if not exists companies_event_name_key_idx
  on companies (event_id, name_key);

create index if not exists companies_event_idx      on companies (event_id);
create index if not exists companies_first_seen_idx on companies (event_id, first_seen_at desc);
create index if not exists companies_score_idx      on companies (event_id, icp_score desc nulls last);
create index if not exists harvests_event_idx       on harvests  (event_id, ran_at desc);


-- ---------------------------------------------------------------------------
-- Row Level Security on, with no policies: nothing reaches this data through
-- the public key. The server uses the secret key, which bypasses RLS by
-- design. Add policies later if the browser ever needs to read directly.
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
-- even though the secret key authenticates correctly. RLS is a separate
-- layer: service_role bypasses RLS, but it still needs ordinary SQL
-- privileges first.
--
-- The default-privileges lines cover tables added later, so this does not have
-- to be re-run after the next migration.
-- ---------------------------------------------------------------------------
grant usage on schema public to service_role;
grant all privileges on all tables    in schema public to service_role;
grant all privileges on all sequences in schema public to service_role;
grant all privileges on all functions in schema public to service_role;

alter default privileges in schema public grant all on tables    to service_role;
alter default privileges in schema public grant all on sequences to service_role;
alter default privileges in schema public grant all on functions to service_role;
