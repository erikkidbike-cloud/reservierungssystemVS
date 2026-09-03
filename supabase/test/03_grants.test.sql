-- 03_grants.test.sql
-- Regression test for a real bug found on first production deploy, not a
-- precaution: docs/03-roles-and-rls.md previously assumed a fresh Supabase
-- project auto-grants base-table privileges to anon/authenticated/service_role
-- project-wide. It doesn't reliably — GRANT and Row Level Security are
-- independent layers, and BYPASSRLS (what makes service_role special) skips
-- only the RLS layer. Without an explicit GRANT, service_role got a flat
-- `permission denied for table locations` in production, which this suite's
-- earlier tests never caught because 01_functions.test.sql and
-- 02_agreements.test.sql both run largely as the postgres superuser, which
-- bypasses grants the same way service_role's BYPASSRLS bypasses RLS — so a
-- missing GRANT was invisible to them. This file exists so that blind spot
-- can't hide this specific bug again.
--
-- Iterates every base table so a future migration that adds a table but
-- forgets it needs a grant fails a test instead of a live deploy — this is
-- exactly the scenario 0009_grants.sql's ALTER DEFAULT PRIVILEGES exists to
-- prevent, and this test is what proves that mechanism actually works rather
-- than just looking correct.

\set ON_ERROR_STOP on

create or replace function assert_eq(actual anyelement, expected anyelement, label text)
returns void language plpgsql as $$
begin
  if actual is distinct from expected then
    raise exception 'FAIL % — expected %, got %', label, expected, actual;
  end if;
  raise notice 'ok  %', label;
end $$;

-- Every base table in the public schema must be selectable by service_role
-- without a permission error. A table with zero rows is a pass (that's RLS's
-- business, service_role bypasses it); a permission-denied error is the bug.
do $$
declare
  tbl text;
  n int;
begin
  set role service_role;
  for tbl in
    select tablename from pg_tables where schemaname = 'public'
  loop
    begin
      execute format('select count(*) from public.%I', tbl) into n;
    exception when insufficient_privilege then
      raise exception 'FAIL service_role lacks a grant on table "%" — add it to 0009_grants.sql', tbl;
    end;
  end loop;
  reset role;
  raise notice 'ok  service_role can query every base table (no missing grants)';
end $$;

-- A table added after this migration must inherit the grant automatically —
-- this is what actually distinguishes "we patched today's tables" from "we
-- fixed the bug", and it's exactly the ALTER DEFAULT PRIVILEGES statements in
-- 0009_grants.sql being put to the test, not just read.
do $$
begin
  create table _grants_test_future_table (id int);
  set role service_role;
  perform count(*) from _grants_test_future_table;
  reset role;
  drop table _grants_test_future_table;
  raise notice 'ok  a table created after 0009_grants.sql still gets service_role access (default privileges work)';
exception when insufficient_privilege then
  reset role;
  drop table if exists _grants_test_future_table;
  raise exception 'FAIL a newly created table did NOT inherit service_role access — ALTER DEFAULT PRIVILEGES is not working';
end $$;

-- authenticated needs the same "reachable at all" grant on the tables its RLS
-- policies scope to signed-in users — reproduces the exact failure mode
-- (permission denied, not an empty result) against the table that actually
-- broke in production.
do $$
declare admin_id uuid := gen_random_uuid();
begin
  insert into auth.users (id, email) values (admin_id, 'grants-admin@test.local');
  update profiles set role = 'admin' where id = admin_id;

  set role authenticated;
  perform set_config('request.jwt.claim.sub', admin_id::text, true);
  perform assert_eq((select count(*)::int from locations) > 0, true,
                    'authenticated (as admin) can read locations — the table that failed in production');
  reset role;
end $$;

-- And a table added later must give authenticated the same reachability too.
do $$
begin
  create table _grants_test_future_table2 (id int);
  set role authenticated;
  perform count(*) from _grants_test_future_table2;
  reset role;
  drop table _grants_test_future_table2;
  raise notice 'ok  a table created after 0009_grants.sql still gets authenticated access (default privileges work)';
exception when insufficient_privilege then
  reset role;
  drop table if exists _grants_test_future_table2;
  raise exception 'FAIL a newly created table did NOT inherit authenticated access — ALTER DEFAULT PRIVILEGES is not working';
end $$;

\echo '--- all grants regression tests passed ---'
