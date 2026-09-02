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
  inserts go through the `request_booking()` RPC (SECURITY DEFINER), which
  validates and inserts with `status='requested'` — there is no open INSERT
  policy for `anon` on the table itself.
- **customer_experiences**: admin, location_manager, finance only.
- **payments / documents**: admin + finance (payments), admin + location_manager
  (documents, scoped to location).
- **tasks**: admin/location_manager manage tasks in their locations; assignee
  reads & updates their own; caretaker sees only their tasks (via `caretaker_tasks`).
- **booking_events**: insert by the app (via triggers/RPC); read by admin +
  location_manager (their locations).

## Why RPC for public submission

Giving `anon` a direct `INSERT` on `bookings` is hard to constrain safely (they
could set any status, any price). Instead `request_booking()`:
1. runs server-side validation (lead time, duration, closing rule, overlap),
2. computes price server-side (never trusts the client's number),
3. creates/links the customer,
4. inserts the booking as `requested` with a computed `hold_expires_at`,
5. writes a `booking_events` row and returns a minimal confirmation.

This is also where the server-side overlap check + exclusion constraint make a
double-submit impossible.

## Column security: views vs. GRANTs

Two mechanisms, used together:
- **Views** for shaping (e.g. `bookings_staff` omits `customer_id`, `message`,
  price, deposit). Staff are granted SELECT on the view, not the base table.
- **RLS policies** for row scoping on the base tables.

Where a role needs the base table but not every column (rare), Postgres
column-level `GRANT` can supplement — but prefer views for clarity.
