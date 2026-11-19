-- ---------------------------------------------------------------------------
-- Fix: the same company counted twice when an organiser changes capitalisation.
--
-- Seen live on BICSI Winter 2027. "Longtek Technology (Thailand) CO., LTD"
-- became "Longtek Technology (Thailand) Co., Ltd" between two harvests, same
-- booth, and landed as a second row — reported as a new exhibitor.
--
-- The diff logic already compared names case-insensitively, but the unique
-- constraint on (event_id, name) is case-sensitive, so the upsert inserted
-- rather than updated. Two layers disagreeing about identity.
--
-- Fix is a normalised key column that both layers use. `name` stays exactly as
-- the organiser wrote it, because that is what gets shown and what the evidence
-- string has to match.
--
-- Safe to run more than once.
-- ---------------------------------------------------------------------------

-- 1. The key: lowercase, collapsed whitespace, trimmed. Deliberately gentle —
--    stripping "Inc" or "Ltd" would merge companies that really are different.
alter table companies
  add column if not exists name_key text
  generated always as (lower(regexp_replace(btrim(name), '\s+', ' ', 'g'))) stored;

-- 2. Merge rows that were already split. Keep the earliest sighting, because
--    that is the honest first_seen_at — the later row is the same company, not
--    a new arrival, and its date would wrongly mark it as this week's news.
with ranked as (
  select
    id,
    event_id,
    name_key,
    row_number() over (
      partition by event_id, name_key
      order by first_seen_at asc, id asc
    ) as rn
  from companies
),
survivors as (
  select event_id, name_key, min(first_seen_at) as earliest
  from companies
  group by event_id, name_key
)
update companies c
set first_seen_at = s.earliest
from survivors s
where c.event_id = s.event_id
  and c.name_key = s.name_key
  and c.first_seen_at <> s.earliest;

delete from companies c
using (
  select id
  from (
    select id,
           row_number() over (
             partition by event_id, name_key
             order by first_seen_at asc, id asc
           ) as rn
    from companies
  ) t
  where t.rn > 1
) dupes
where c.id = dupes.id;

-- 3. Swap the constraint over to the normalised key.
alter table companies drop constraint if exists companies_event_id_name_key;
drop index if exists companies_event_name_key_idx;
create unique index if not exists companies_event_name_key_idx
  on companies (event_id, name_key);
