# Supabase (database)

Apply migrations in numeric order, then the seed:

```bash
# with the Supabase CLI against a linked project (or local `supabase start`)
for f in migrations/0*.sql; do psql "$DATABASE_URL" -f "$f"; done
psql "$DATABASE_URL" -f seed/seed.sql
psql "$DATABASE_URL" -f seed/nv_clauses.sql   # after seed.sql — looks up locations by code
```

Order matters:

| File | Contents |
|---|---|
| `0001_extensions.sql` | `pgcrypto`, `btree_gist` |
| `0002_enums.sql` | domain enums |
| `0003_core_tables.sql` | tables + `updated_at` trigger |
| `0004_constraints_indexes.sql` | **overlap exclusion constraint** + indexes |
| `0005_rls.sql` | RLS helpers + policies |
| `0006_views.sql` | role-scoped views (`public_availability`, `bookings_staff`, `caretaker_tasks`) |
| `0007_functions.sql` | `create_booking_request()`, `expire_holds()`, profile provisioning, status audit |
| `0008_agreements.sql` | `agreement_clauses` — the editable Nutzungsvereinbarung text |
| `0009_grants.sql` | **base-table GRANTs** for `authenticated`/`service_role` — see below, this one matters |
| `seed/seed.sql` | locations, projects, standard tariffs (exact prices) |
| `seed/nv_clauses.sql` | initial Nutzungsvereinbarung clause text (WE, WA) |

Design rationale: `docs/02-data-model.md`. Security model: `docs/03-roles-and-rls.md`.

## Verifying without a Supabase project

```bash
./supabase/test/run-tests.sh
```

Spins up a throwaway PostgreSQL 16 cluster (unix socket only, no TCP, so it
cannot collide with anything), applies a small Supabase shim
(`test/00_supabase_shim.sql` — the `auth` schema, `auth.uid()`, and the
`anon`/`authenticated`/`service_role` roles), then every migration and both
seed files, then every `test/*.test.sql` file in order (52 assertions total).
Any failed assertion aborts the script non-zero.

- `01_functions.test.sql` (36) — business days, the closing rule,
  `create_booking_request()`'s guards, hold expiry, `public_availability`'s
  no-PII shape. Runs mostly as the `postgres` superuser.
- `02_agreements.test.sql` (12) — seeded clause counts, and a genuine
  `SET ROLE authenticated` + `auth.uid()` switch proving `agreement_clauses`'s
  RLS holds for anon/staff/a scoped location_manager/admin, not just checked
  for shape.
- `03_grants.test.sql` (4) — regression test for a real bug found on first
  production deploy (see `docs/03-roles-and-rls.md`): every base table must be
  reachable by `service_role`/`authenticated`, including a table created
  *after* `0009_grants.sql` runs, proving its `ALTER DEFAULT PRIVILEGES`
  actually takes effect.

The suite deliberately runs with `set timezone = 'UTC'` to prove the wall-clock
rules (22:00 closing, business-day hold expiry) are evaluated in `Europe/Berlin`
via `app_timezone()` and do not depend on the session's timezone.

## The one constraint to understand

`bookings_no_overlap` (in `0004`) makes it **physically impossible** for two
active bookings at the same location to overlap in time — the fix for the current
browser-only overlap check. A double-submit of the same slot fails at the
database with a `23P01` exclusion-violation error; `create_booking_request()`
catches it and returns a clean `slot_taken` error instead.

## The other one to understand: 0009's GRANTs

If you only remember one thing from this file: **`0009_grants.sql` is not
optional cleanup, it's load-bearing.** Without it, `service_role` — the key the
app's server-side code uses for everything, via `SUPABASE_SERVICE_ROLE_KEY` —
cannot even `SELECT` from `locations`, despite `BYPASSRLS` making it look like
it should be able to touch anything. GRANT and RLS are separate layers; skip
one migration and the whole app fails with a `permission denied for table ...`
that has nothing to do with RLS policies at all. See
`docs/03-roles-and-rls.md` for the full story of how this was found.

## Note on the role views

The three views deliberately run with the view owner's rights (default, not
`security_invoker`) and re-impose row scoping inside the view via
`has_location()` / `auth.uid()`. This is what gives **column-level** security
(e.g. staff never receive contact or price columns) that plain RLS cannot express.
Grant roles the view, never the base table.
