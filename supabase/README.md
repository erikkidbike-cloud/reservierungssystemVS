# Supabase (database)

Apply migrations in numeric order, then the seed:

```bash
# with the Supabase CLI against a linked project (or local `supabase start`)
for f in migrations/000*.sql; do psql "$DATABASE_URL" -f "$f"; done
psql "$DATABASE_URL" -f seed/seed.sql
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
| `seed/seed.sql` | locations, projects, standard tariffs (exact prices) |

Design rationale: `docs/02-data-model.md`. Security model: `docs/03-roles-and-rls.md`.

## The one constraint to understand

`bookings_no_overlap` (in `0004`) makes it **physically impossible** for two
active bookings at the same location to overlap in time — the fix for the current
browser-only overlap check. A double-submit of the same slot fails at the
database with a `23P01` exclusion-violation error; the `request_booking()` RPC
(handoff task 1.3) should catch it and return a clean "slot just taken" message.

## Note on the role views

The three views deliberately run with the view owner's rights (default, not
`security_invoker`) and re-impose row scoping inside the view via
`has_location()` / `auth.uid()`. This is what gives **column-level** security
(e.g. staff never receive contact or price columns) that plain RLS cannot express.
Grant roles the view, never the base table.
