-- Run this ONCE in the Supabase SQL editor, against the live project — not
-- part of supabase/migrations/ and not run by supabase/test/run-tests.sh.
--
-- Why it lives here instead of a migration: pg_cron is a Supabase-managed
-- extension (toggled under Database → Extensions in the dashboard), not a
-- plain contrib extension available on a bare local Postgres — the migrations
-- directory has to apply cleanly against the throwaway Postgres the test
-- harness spins up, so anything that only exists on Supabase itself is kept
-- out of it. See docs/07-supabase-setup.md, "Scheduling expire_holds".
--
-- Before running this:
--   1. Dashboard → Database → Extensions → enable "pg_cron".
--   2. Then run the statement below (once — cron.schedule is idempotent on the
--      job name, so re-running it just updates the schedule rather than
--      duplicating the job).
--
-- expire_holds() is SECURITY DEFINER and EXECUTE is granted only to
-- service_role (see 0007_functions.sql) — that's fine here because pg_cron
-- jobs run as the role that scheduled them, which in the SQL editor is the
-- project's postgres superuser, and a superuser bypasses the EXECUTE grant
-- check entirely.

select cron.schedule(
  'expire-holds-hourly',
  '5 * * * *',  -- five minutes past every hour — Berlin business days only
                -- matter for *what* it does, not when it runs; hourly is
                -- frequent enough that a lapsed hold never sits stale for long.
  $$select expire_holds();$$
);

-- To check it's registered:      select * from cron.job;
-- To see recent runs:            select * from cron.job_run_details order by start_time desc limit 20;
-- To remove it:                  select cron.unschedule('expire-holds-hourly');
