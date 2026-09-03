-- 02_agreements.test.sql
-- Assertions for 0008_agreements.sql: the seeded clause counts, and — unlike
-- 01_functions.test.sql, which runs entirely as the postgres superuser and so
-- never actually exercises a policy — a real role-switch test proving the RLS
-- policy on agreement_clauses holds for anon, staff, a scoped location_manager,
-- and admin.
--
-- The persona blocks below resolve location ids as postgres into a temp table
-- rather than looking them up by code under the `authenticated` role — not
-- because `authenticated` lacks a grant on `locations` (0009_grants.sql now
-- covers that; see 03_grants.test.sql for the dedicated regression test), but
-- to keep this file focused on agreement_clauses's own policy rather than
-- depending on locations' RLS behaving a particular way too.

\set ON_ERROR_STOP on

create or replace function assert_eq(actual anyelement, expected anyelement, label text)
returns void language plpgsql as $$
begin
  if actual is distinct from expected then
    raise exception 'FAIL % — expected %, got %', label, expected, actual;
  end if;
  raise notice 'ok  %', label;
end $$;

-- ------------------------------------------------------------- seeded content
select assert_eq((select count(*)::int from agreement_clauses ac
                   join locations l on l.id = ac.location_id where l.code = 'WE'),
                  16, 'WE seeded with all 16 clauses');
select assert_eq((select count(*)::int from agreement_clauses ac
                   join locations l on l.id = ac.location_id where l.code = 'WA'),
                  11, 'WA seeded with all 11 clauses');
select assert_eq((select count(*)::int from agreement_clauses ac
                   join locations l on l.id = ac.location_id where l.code = 'WI'),
                  0, 'WI has no agreement yet — ready to add one later without a schema change');

select assert_eq(
  (select count(distinct ac.sort_order)::int from agreement_clauses ac
    join locations l on l.id = ac.location_id where l.code = 'WE'),
  16, 'WE clause sort_order has no gaps or duplicates');

-- Regression guard for docs/05-open-questions.md §18: the booking form charges
-- a Wassertorplatz deposit, so the Wassertorplatz contract must mention one.
-- Applied by seed/nv_clauses_overrides.sql; this fails if that file stops being
-- applied, or if a Word re-import quietly reinstates the deposit-free version.
select assert_eq(
  (select count(*)::int from agreement_clauses ac
    join locations l on l.id = ac.location_id
   where l.code = 'WA' and ac.body_de like '%Kaution%'),
  1, 'WA agreement mentions the deposit it actually charges (DE)');
select assert_eq(
  (select count(*)::int from agreement_clauses ac
    join locations l on l.id = ac.location_id
   where l.code = 'WA' and ac.body_en ilike '%deposit%'),
  1, 'WA agreement mentions the deposit it actually charges (EN)');

-- --------------------------------------------------------- test fixtures
-- Location ids (resolved once, as postgres) and three identities: staff (the
-- default role from handle_new_user()), a location_manager scoped to WE only,
-- and an admin.
do $$
declare
  staff_id   uuid := gen_random_uuid();
  manager_id uuid := gen_random_uuid();
  admin_id   uuid := gen_random_uuid();
  we_id      uuid;
begin
  select id into we_id from locations where code = 'WE';

  insert into auth.users (id, email) values (staff_id, 'staff@test.local');

  insert into auth.users (id, email) values (manager_id, 'manager-we@test.local');
  update profiles set role = 'location_manager' where id = manager_id;
  insert into user_locations (user_id, location_id) values (manager_id, we_id);

  insert into auth.users (id, email) values (admin_id, 'admin@test.local');
  update profiles set role = 'admin' where id = admin_id;

  create temporary table test_identities (name text primary key, id uuid);
  insert into test_identities values
    ('staff', staff_id), ('manager_we', manager_id), ('admin', admin_id);

  create temporary table test_locations (code text primary key, id uuid);
  insert into test_locations
    select code, id from locations where code in ('WE', 'WA');
end $$;

-- Created as the connecting (postgres) role; the persona tests below run as
-- `authenticated` via SET ROLE and need to read these back.
grant select on test_identities to authenticated;
grant select on test_locations to authenticated;

-- ------------------------------------------------------------------- anon
-- No grant at all on this table for anon — querying it must fail outright,
-- not just return zero rows (RLS silently filtering would be the wrong
-- failure mode to rely on for contract text with no public-read need).
set role anon;
do $$
begin
  begin
    perform count(*) from agreement_clauses;
    raise exception 'FAIL anon should not be able to query agreement_clauses at all';
  exception when insufficient_privilege then
    raise notice 'ok  anon has no privilege on agreement_clauses';
  end;
end $$;
reset role;

-- ------------------------------------------------------------------- staff
-- May read (to preview a document) but the write policy excludes staff
-- entirely, so an update matches zero rows rather than erroring.
set role authenticated;
select set_config('request.jwt.claim.sub', (select id::text from test_identities where name = 'staff'), false);

select assert_eq((select count(*)::int from agreement_clauses) > 0, true,
                  'staff can read agreement_clauses');

do $$
declare before_title text; after_title text; cid uuid; we_id uuid;
begin
  select id into we_id from test_locations where code = 'WE';
  select id, title_de into cid, before_title
  from agreement_clauses where location_id = we_id and clause_key = 'nutzungszeit';

  update agreement_clauses set title_de = 'HACKED BY STAFF' where id = cid;

  select title_de into after_title from agreement_clauses where id = cid;
  perform assert_eq(after_title, before_title, 'staff write is silently rejected by RLS (no rows matched)');
end $$;

reset role;
select set_config('request.jwt.claim.sub', '', false);

-- ---------------------------------------------------------- location_manager
-- Scoped to WE: may edit WE's clauses, may not touch WA's.
set role authenticated;
select set_config('request.jwt.claim.sub', (select id::text from test_identities where name = 'manager_we'), false);

do $$
declare cid uuid; manager_id uuid; we_id uuid; wa_id uuid;
begin
  select id into manager_id from test_identities where name = 'manager_we';
  select id into we_id from test_locations where code = 'WE';
  select id into wa_id from test_locations where code = 'WA';

  select id into cid from agreement_clauses
  where location_id = we_id and clause_key = 'nutzungszeit';
  update agreement_clauses set title_de = 'Nutzungszeit (bearbeitet)' where id = cid;
  perform assert_eq((select title_de from agreement_clauses where id = cid),
                    'Nutzungszeit (bearbeitet)', 'WE location_manager can edit a WE clause');
  perform assert_eq((select updated_by from agreement_clauses where id = cid),
                    manager_id, 'updated_by records the editing user');

  select id into cid from agreement_clauses
  where location_id = wa_id and clause_key = 'stornierung';
  update agreement_clauses set title_de = 'HACKED BY WE MANAGER' where id = cid;
  perform assert_eq((select title_de from agreement_clauses where id = cid),
                    'Stornierung', 'WE location_manager cannot edit a WA clause');
end $$;

reset role;
select set_config('request.jwt.claim.sub', '', false);

-- ------------------------------------------------------------------- admin
-- Unrestricted — may edit any location's clauses.
set role authenticated;
select set_config('request.jwt.claim.sub', (select id::text from test_identities where name = 'admin'), false);

do $$
declare cid uuid; admin_id uuid; wa_id uuid;
begin
  select id into admin_id from test_identities where name = 'admin';
  select id into wa_id from test_locations where code = 'WA';

  select id into cid from agreement_clauses
  where location_id = wa_id and clause_key = 'stornierung';
  update agreement_clauses set title_de = 'Stornierung (von Admin bearbeitet)' where id = cid;
  perform assert_eq((select title_de from agreement_clauses where id = cid),
                    'Stornierung (von Admin bearbeitet)', 'admin can edit any location''s clause');
  perform assert_eq((select updated_by from agreement_clauses where id = cid),
                    admin_id, 'updated_by records the admin');
end $$;

reset role;
select set_config('request.jwt.claim.sub', '', false);

\echo '--- all agreement RLS tests passed ---'
