-- 0009_grants.sql
-- Base table GRANTs for authenticated and service_role.
--
-- Why this migration exists (a real bug found in production, not a
-- precaution): docs/03-roles-and-rls.md previously assumed a fresh Supabase
-- project auto-grants base-table privileges to anon/authenticated/service_role
-- project-wide, the way it's commonly described. Deploying against a real
-- project showed that assumption is not something to rely on for tables
-- created by running plain SQL (as every migration in this repo does, via the
-- SQL Editor or the CLI) — GRANT and Row Level Security are two independent
-- Postgres layers, and BYPASSRLS (what makes service_role special) skips only
-- the RLS layer, not the ordinary privilege check. Without an explicit GRANT,
-- even service_role gets a flat `permission denied for table ...`, which is
-- exactly what surfaced on first real deploy. Reproduced locally: running
-- `SET ROLE service_role; select * from locations;` against a database with
-- migrations 0001-0008 applied (no 0009) fails with that exact error;
-- immediately after this migration, it succeeds. See
-- supabase/test/02_agreements.test.sql for the permanent regression test.
--
-- The fix is to stop depending on that assumption and grant explicitly, which
-- is more correct anyway for a schema meant to be provisioned by arbitrary SQL
-- execution rather than only by clicking through a GUI. RLS remains the actual
-- access-control layer — these grants just make the tables reachable at all;
-- the policies from 0005 and 0008 still decide which rows/operations each
-- role may actually use.
--
-- anon is deliberately NOT granted anything here: by design it only ever
-- reaches data through the public views (0006, already granted there) or
-- through create_booking_request() as service_role (0007) — never through a
-- base table directly.

grant usage on schema public to authenticated, service_role;

-- authenticated: every table with an RLS policy scoping it to signed-in users.
-- The grant only makes the operation category attemptable; the policies from
-- 0005/0008 still decide which rows each role may see or touch.
grant select, insert, update, delete on
  profiles,
  locations,
  user_locations,
  tariffs,
  customers,
  customer_experiences,
  projects,
  bookings,
  booking_events,
  blocks,
  documents,
  payments,
  tasks,
  agreement_clauses
to authenticated;

-- service_role: unrestricted, matching its "trusted server, bypasses
-- everything" role.
grant all on all tables in schema public to service_role;
grant all on all sequences in schema public to service_role;

-- ALTER DEFAULT PRIVILEGES: any table a FUTURE migration adds gets these same
-- grants automatically, without anyone needing to remember to extend the list
-- above — that "someone forgot to add the new table here" is exactly the
-- shape of bug this migration exists to fix, so the fix should prevent its own
-- recurrence, not just patch the tables that exist today.
alter default privileges in schema public grant all on tables to service_role;
alter default privileges in schema public grant all on sequences to service_role;
alter default privileges in schema public
  grant select, insert, update, delete on tables to authenticated;
