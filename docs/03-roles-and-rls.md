# Roles & Row-Level Security

The whole reason for the rebuild's security model: **column- and row-level
access that Excel cannot provide.** Postgres RLS restricts *rows*; per-role
*column* restriction is done with role-scoped views. The front-end queries the
view appropriate to the user's role, so it never receives data the role may not
see — hiding is enforced by the database, not the UI.

## Roles

`app_role` enum: `admin`, `location_manager`, `staff`, `finance`, `hausmeister`.
Public (unauthenticated) visitors are the `anon` Postgres role.

| Capability | admin | location_manager | staff | finance | hausmeister | anon |
|---|---|---|---|---|---|---|
| All locations | ✓ | scoped | scoped | ✓ | scoped | — |
| See booking contact data | ✓ | ✓ | ✗ | ✓ | minimal¹ | ✗ |
| See financial data | ✓ | ✓ | ✗ | ✓ | ✗ | ✗ |
| Approve / edit / cancel | ✓ | ✓ | ✗ | ✗ | ✗ | ✗ |
| Add notes / tick tasks | ✓ | ✓ | ✓ | ✗ | own tasks | ✗ |
| Match payments / deposit | ✓ | ✗ | ✗ | ✓ | ✗ | ✗ |
| See `customer_experiences` | ✓ | ✓ | ✗ | ✓ | ✗ | ✗ |
| Manage tariffs / users | ✓ | ✗ | ✗ | ✗ | ✗ | ✗ |
| Submit a request | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ (via RPC) |
| Read occupancy (no PII) | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ (via view) |

¹ Caretaker sees only date, time, open/close task, name, phone — through
`caretaker_tasks`, never the `bookings` table directly.

## Helper functions (SECURITY DEFINER)

Defined in `supabase/migrations/0005_rls.sql`:

- `auth_role()` → the caller's `app_role` from `profiles` (or `null`).
- `is_admin()` → `auth_role() = 'admin'`.
- `has_location(loc uuid)` → true if admin/finance, or the caller has a
  `user_locations` row for `loc`.

Kept `STABLE` and schema-qualified to avoid recursive RLS evaluation.

## Policy summary

- **profiles**: a user reads/updates their own row; admin reads/writes all.
- **locations / tariffs / projects**: read by any authenticated user; write by
  admin only. A safe subset of `locations` is exposed to `anon` via the public
  views (no internal columns).
- **bookings**: admin & finance → all rows. location_manager → rows where
  `has_location(location_id)`, full access. staff → **read only** and **only via
  the `bookings_staff` view** (no direct table select granted). Public form
  inserts go through `create_booking_request()` (SECURITY DEFINER, service-role
  only), which validates and inserts with `status='requested'` — there is no
  INSERT policy for `anon` on the table at all.
- **agreement_clauses**: read by any authenticated user (contract text is not
  personal or financial data, and a preview is harmless); write by admin
  everywhere, location_manager only where `has_location(location_id)` — the
  same scoping as bookings. Unlike most of the schema, this table's RLS is
  exercised by an actual role-switch test rather than only checked for shape —
  see `supabase/test/02_agreements.test.sql`.
- **customer_experiences**: admin, location_manager, finance only.
- **payments / documents**: admin + finance (payments), admin + location_manager
  (documents, scoped to location).
- **tasks**: admin/location_manager manage tasks in their locations; assignee
  reads & updates their own; caretaker sees only their tasks (via `caretaker_tasks`).
- **booking_events**: insert by the app (via triggers/RPC); read by admin +
  location_manager (their locations).

## Why a function for public submission

*Implemented in `supabase/migrations/0007_functions.sql` as
`create_booking_request()`; covered by `supabase/test/01_functions.test.sql`.*

Giving `anon` a direct `INSERT` on `bookings` is hard to constrain safely — they
could set any status, any price. Instead the public form posts to a **trusted
Next.js server route**, which:

1. computes the price with `@vs/pricing` (the client's number is never trusted), then
2. calls `create_booking_request()` using the **service role**.

The function itself is `SECURITY DEFINER` with `EXECUTE` **revoked from `anon`
and `authenticated`** and granted only to `service_role`. It:

1. resolves the location and refuses a non-`online` one for public requests,
2. re-validates times server-side (range, 30-min minimum, 7-day lead, closing
   rule) — so the rules hold for internal entry too, not just in the browser,
3. upserts the customer (deduplicating on email),
4. inserts the booking as `requested` with a business-day `hold_expires_at`,
5. writes a `booking_events` row and returns the booking.

It raises machine-readable messages the app maps to user-facing text:
`location_not_found`, `not_online_bookable`, `invalid_range`, `too_short`,
`too_soon`, `closing_violation`, `slot_taken`.

**Pricing is deliberately not computed in SQL.** The algorithm has exactly one
implementation (`packages/pricing`), shared by the public form and the internal
console. Re-deriving prices in PL/pgSQL would recreate the JS-vs-Excel drift this
rebuild exists to eliminate.

Concurrency: two simultaneous requests for one slot cannot both succeed — the
second hits the `bookings_no_overlap` exclusion constraint, which the function
catches and re-raises as `slot_taken`.

Wall-clock rules (closing hour, business days) are evaluated in `Europe/Berlin`
via `app_timezone()`, so they do not depend on the database session's timezone.

## Column security: views vs. GRANTs

Two mechanisms, used together:
- **Views** for shaping (e.g. `bookings_staff` omits `customer_id`, `message`,
  price, deposit). Staff are granted SELECT on the view, not the base table.
- **RLS policies** for row scoping on the base tables.

Where a role needs the base table but not every column (rare), Postgres
column-level `GRANT` can supplement — but prefer views for clarity.

## Base-table GRANTs: a real bug, not a precaution

An earlier version of this document claimed that creating a table on a real
Supabase project auto-grants base privileges
(`SELECT`/`INSERT`/`UPDATE`/`DELETE`) to `anon`/`authenticated`/`service_role`
project-wide, with RLS left as the only real restriction. **That claim was
wrong.** The first real deploy hit `permission denied for table locations` —
using a genuine, correctly-configured `service_role` key — because GRANT and
Row Level Security are independent Postgres layers: `BYPASSRLS` (what makes
`service_role` special) skips only the RLS layer, not the ordinary privilege
check. A table created by running plain SQL (as every migration here does, via
the SQL Editor or the CLI) does not automatically become selectable by any
role, `service_role` included, without an explicit `GRANT`.

`supabase/migrations/0009_grants.sql` fixes this: explicit `GRANT` for
`authenticated` on every RLS-protected table, unrestricted `GRANT` for
`service_role`, and `ALTER DEFAULT PRIVILEGES` so a table added by a *future*
migration inherits both automatically — the bug this fixes is exactly
"someone adds a table and forgets it needs a grant," so the fix has to prevent
its own recurrence, not just patch the tables that existed when it was found.
`anon` gets nothing here by design: it only ever reaches data through the
public views (0006) or `create_booking_request()` running as `service_role`
(0007), never a base table directly.

Why the local test harness didn't catch this before `0009` existed:
`01_functions.test.sql` and most of `02_agreements.test.sql` run largely as the
`postgres` superuser, which bypasses ordinary GRANT checks by table ownership —
the exact same way `service_role`'s `BYPASSRLS` bypasses RLS. A missing GRANT
was invisible to a test suite that never stopped being the table owner.
`supabase/test/03_grants.test.sql` is the fix for *that*: it switches to
`service_role`/`authenticated` via `SET ROLE` and asserts every base table is
reachable — including a table created after `0009` runs, to prove the default
privileges actually take effect rather than merely reading correctly. Combined
with `02_agreements.test.sql`'s role-switch tests (anon refused outright,
staff's write silently matches zero rows, a location_manager scoped to one
location can't touch another's), base-table access is now proven against a
non-superuser identity, not just checked for shape.
