# Roles & Row-Level Security

The whole reason for the rebuild's security model: **column- and row-level
access that Excel cannot provide.** Postgres RLS restricts *rows*; per-role
*column* restriction is done with role-scoped views. The front-end queries the
view appropriate to the user's role, so it never receives data the role may not
see — hiding is enforced by the database, not the UI.

## Roles are rows, permissions are the currency

Until `0016_roles_permissions.sql` a role was one of five values of the
`app_role` enum, and every policy asked *which role is this?* — `auth_role() in
('admin','finance')` and so on. Both halves broke as soon as the owner needed
to invent a role: an enum cannot grow from the UI, and a policy that names
roles by hand can never know about one created afterwards.

So the question every policy asks changed:

    which role does this user have?   →   what may this user do?

A **role** is now a row in `roles` (a key, a German label, and an
`all_locations` flag). A **permission** is a row in the fixed `permissions`
catalogue — fixed because a permission only means anything if some policy or
route checks for it, so adding one is a code change. What an administrator
edits at `/admin/roles` is the join between them, `role_permissions`.

`system.admin` is the one implication in the model: a role holding it holds
every permission, including ones added by a later migration. Nothing else
implies anything.

### Scope: two orthogonal questions

- **What** may you do → permissions.
- **Where** may you do it → `roles.all_locations`, else the caller's
  `user_locations` rows.

Per-permission location scoping ("may approve at WE but only read at WA") was
considered and rejected: nobody has asked for it, and it would double the size
of every policy for a case that does not exist.

### What a fresh database starts with

| Permission group | admin | location_manager | staff | finance | hausmeister |
|---|---|---|---|---|---|
| All locations | ✓ | scoped | scoped | ✓ | scoped |
| `bookings.read` | ✓ | ✓ | ✓ | ✓ | ✓ |
| `contact_data.read` | ✓ | ✓ | ✗ | ✓ | ✗ |
| `bookings.write` / `.approve` | ✓ | ✓ | ✗ | ✗ | ✗ |
| `customers.*` | ✓ | ✓ | ✗ | read | ✗ |
| `experiences.*` | ✓ | ✓ | ✗ | read | ✗ |
| `documents.access` | ✓ | ✓ | ✗ | ✗ | ✗ |
| `payments.manage` | ✓ | ✗ | ✗ | ✓ | ✗ |
| `tariffs.manage` | ✓ | ✗ | ✗ | ✗ | ✗ |
| `events.manage` | ✓ | ✓ | ✗ | ✗ | ✗ |
| `tasks.manage` | ✓ | ✓ | ✗ | ✗ | ✗ |
| `tasks.own` | ✓ | ✓ | ✓ | ✗ | ✓ |
| `tasks.caretaker` | ✓ | ✗ | ✗ | ✗ | ✓ |
| `users.manage` / `roles.manage` | ✓ | ✗ | ✗ | ✗ | ✗ |

These five are `is_system` roles: they may be renamed and re-permissioned, but
not deleted and not re-keyed, because `handle_new_user()` and the seed data
refer to their keys. Every other role is fully editable and deletable.

Public (unauthenticated) visitors are the `anon` Postgres role and hold no
permissions at all; they reach data only through the public views or
`create_booking_request()`.

Without `contact_data.read` a role has no SELECT policy on `bookings` and reads
the `bookings_staff` view instead — date, time, persons, status, nothing
personal or financial. That two-tier arrangement is unchanged; it is only
expressed as a permission now rather than as a list of role names.

## Guard rails

An editable permission system can lock everyone out of itself. Three triggers
(0016) stop the plausible accidents, and they are triggers rather than checks
in the application precisely because `/admin/roles` is the one screen that can
remove its own permission:

1. `system.admin` and `roles.manage` cannot be taken from the `admin` role.
2. A system role cannot be deleted, re-keyed, or demoted to an ordinary one;
   the `admin` role cannot lose `all_locations`.
3. The last active administrator cannot be demoted or deactivated — the fix for
   that would need database access, which is exactly what this console exists
   to avoid.

A role still assigned to somebody cannot be deleted either; that one is just
the foreign key from `profiles.role`.

## Helper functions (SECURITY DEFINER)

Defined in `supabase/migrations/0016_roles_permissions.sql`:

- `auth_role()` → the caller's role key from `profiles` (`text`, or `null` when
  the account is inactive).
- `role_has_permission(role, perm)` → does that role hold it (or `system.admin`)?
  Split out from the next one so a query can ask about a role other than the
  caller's own — the caretaker-assignment trigger does exactly that.
- `has_permission(perm)` → `role_has_permission(auth_role(), perm)`.
- `is_admin()` → `has_permission('system.admin')`.
- `has_all_locations()` → the caller's role covers every location.
- `has_location(loc)` → `has_all_locations()`, or a `user_locations` row for `loc`.
- `can_at(perm, loc)` → both — the pairing almost every policy uses.

Kept `STABLE` and schema-qualified to avoid recursive RLS evaluation.

`apps/web/lib/auth.ts` mirrors these for the UI (`can(auth, permission)` plus
named helpers). It resolves the permission set once per request in
`getSessionUser()`. It hides navigation and refuses actions with a readable
message — it is **not** the security boundary. Both sides read the same
`role_permissions` rows, so they cannot drift apart.

## Policy summary

- **roles / permissions / role_permissions**: read by any authenticated user
  (the console has to render a role's name, and knowing a permission exists
  grants nothing); written only with `roles.manage`. `permissions` has no write
  policy at all — the catalogue is code.
- **profiles**: a user reads/updates their own row; `users.manage` reads/writes all.
- **locations / tariffs / projects**: read by any authenticated user; written
  with `locations.manage` / `tariffs.manage` / `categories.manage`. A safe
  subset of `locations` is exposed to `anon` via the public views.
- **bookings**: `contact_data.read` + `has_location()` for the base table;
  everyone else reads the `bookings_staff` view. Writes need
  `can_at('bookings.write', location_id)`. Public form inserts go through
  `create_booking_request()` (SECURITY DEFINER, service-role only), which
  validates and inserts with `status='requested'` — there is no INSERT policy
  for `anon` on the table at all.
- **agreement_clauses**: read by any authenticated user (contract text is not
  personal or financial data, and a preview is harmless); written with
  `can_at('agreements.manage', location_id)`. Unlike most of the schema, this
  table's RLS is exercised by an actual role-switch test rather than only
  checked for shape — see `supabase/test/02_agreements.test.sql`.
- **customers / customer_experiences**: `customers.read`/`.write` and
  `experiences.read`/`.write`. Unscoped by location, as before — a customer
  belongs to no single venue.
- **payments**: `payments.manage`. **documents**: `documents.access`, scoped to
  the booking's location.
- **tasks**: `can_at('tasks.manage', …)` for the manager view; an assignee with
  `tasks.own` reads and updates their own, and sees them through
  `caretaker_tasks`.
- **booking_events**: inserted by the app (via triggers/RPC); read with
  `can_at('bookings.read', …)` on the booking's location.
- **waitlist / reminder rules / mail templates**: `bookings.read` and
  `waitlist.manage` for the waitlist (scoped); `mail_templates.manage` for both
  kinds of wording.

Caretaker assignment follows `tasks.caretaker`, not a role name: when a booking
is confirmed, `create_lifecycle_tasks()` picks an active user at that location
whose role holds that permission. Before 0016 it matched `role = 'hausmeister'`
literally, which no user-defined role could ever satisfy.

`supabase/test/08_roles.test.sql` covers all of this: that a role invented at
runtime is honoured by the policies, that a user without `roles.manage` can
neither grant themselves a permission nor invent a role, and that each guard
rail refuses.

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
