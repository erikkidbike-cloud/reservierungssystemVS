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

## A gap in the local test harness, for honesty's sake

On a real Supabase project, creating a table auto-grants base privileges
(`SELECT`/`INSERT`/`UPDATE`/`DELETE`) to `anon`/`authenticated`/`service_role`
project-wide; RLS is then the *only* thing restricting rows. `supabase/test/`'s
throwaway Postgres cluster does not replicate that project-wide default — tables
here start with no privileges for those roles until a migration grants them.

In practice this hasn't been a problem: `01_functions.test.sql` runs entirely as
the `postgres` superuser (which bypasses RLS by table ownership, same as
`service_role` in production) and exercises security through the
`SECURITY DEFINER` functions and the column-restricted views instead, which
*are* real grants (0006) — so those guarantees are genuinely tested. But it does
mean an RLS *policy* on a base table, by itself, was never proven to actually
hold against a non-superuser role until `agreement_clauses` — which the
`0008` migration grants explicitly and `02_agreements.test.sql` exercises with a
real `SET ROLE authenticated` + `auth.uid()` switch (anon refused outright,
staff's write silently matches zero rows, a location_manager scoped to one
location can't touch another's). Extending that same explicit-grant-plus-
role-switch treatment to the older tables (`bookings`, `customers`, …) is a
worthwhile follow-up, not done here to keep this change scoped to what
Nutzungsvereinbarung-editing needed.
