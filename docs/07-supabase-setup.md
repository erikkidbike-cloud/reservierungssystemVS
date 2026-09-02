# Supabase setup — step by step

This is the one piece of Phase 1 that needs your Supabase account — everything
it applies has already been verified against a real local Postgres (see
`supabase/README.md`), so this should be mechanical. Budget about 30–45 minutes.

## 1. Create the project

1. Go to [supabase.com](https://supabase.com) and sign in (or create an
   account) — an organisation you personally own is fine to start with; it can
   be moved to a KidBike org later without breaking anything here.
2. **New project** → pick the organisation → name it (e.g. `kidbike-vs`) →
   **Region: Frankfurt (eu-central-1)** — the data model assumes EU hosting;
   this is the only region choice that matters.
3. Set a strong database password and **save it somewhere** (a password
   manager) — it's the Postgres superuser password, separate from every API
   key below.
4. Wait for provisioning (a couple of minutes).

## 2. Apply the schema

You have two ways to do this. Pick whichever you're more comfortable with — the
SQL is identical either way, and it's the exact SQL already verified locally.

### Option A — Supabase Dashboard SQL Editor (no CLI install needed)

1. In the project, open **SQL Editor** (left sidebar).
2. Run each file below in **this exact order**, one at a time — paste its
   contents into a new query and click **Run**:

   ```
   supabase/migrations/0001_extensions.sql
   supabase/migrations/0002_enums.sql
   supabase/migrations/0003_core_tables.sql
   supabase/migrations/0004_constraints_indexes.sql
   supabase/migrations/0005_rls.sql
   supabase/migrations/0006_views.sql
   supabase/migrations/0007_functions.sql
   supabase/migrations/0008_agreements.sql
   ```

   The order matters — each one builds on the last (e.g. the overlap
   constraint in `0004` needs the `bookings` table `0003` creates). Do **not**
   run `supabase/test/00_supabase_shim.sql` — that file exists only to fake the
   parts of Supabase (the `auth` schema, `anon`/`authenticated` roles) that a
   local Postgres doesn't have; a real Supabase project already has all of it.

3. Then run the seed data, again in order:

   ```
   supabase/seed/seed.sql
   supabase/seed/nv_clauses.sql
   ```

   (`nv_clauses.sql` looks up locations by code, so `seed.sql` — which creates
   them — must run first.)

4. Sanity check, in a new query:
   ```sql
   select code, name, online_bookability from locations order by sort_order;
   select l.code, count(*) from agreement_clauses ac
     join locations l on l.id = ac.location_id group by l.code;
   ```
   Expect 3 locations (WE, WA, WI) and clause counts WE=16, WA=11 (WI has none
   yet — that's correct, see §6).

### Option B — Supabase CLI (if you'd rather script it)

```bash
npm install -g supabase
supabase login
supabase link --project-ref <your-project-ref>   # find this in Project Settings → General

# Apply migrations then seeds, in order (same files as Option A):
for f in supabase/migrations/0*.sql; do
  supabase db execute --file "$f"
done
supabase db execute --file supabase/seed/seed.sql
supabase db execute --file supabase/seed/nv_clauses.sql
```

Either option leaves the database in the identical state — this repo's local
test harness (`./supabase/test/run-tests.sh`) applies these same files in this
same order against a throwaway Postgres and passes 48 assertions, so you're not
the first one to run this sequence.

## 3. Set up Microsoft / Entra ID login

1. In Supabase: **Authentication → Providers → Azure**.
2. You'll need an Azure AD (Entra ID) App Registration. If KidBike already has
   an Entra ID tenant (likely, if staff have `@kidbike.de` Microsoft accounts):
   - In the [Azure Portal](https://portal.azure.com) → **Entra ID** →
     **App registrations** → **New registration**.
   - Name: `KidBike VS Booking System` (or similar).
   - Redirect URI: **Web** →
     `https://<your-project-ref>.supabase.co/auth/v1/callback`
     (Supabase's Auth provider page shows you this exact URL — copy it from
     there rather than retyping).
   - After creating it: **Certificates & secrets** → new client secret → copy
     its **value** immediately (it's hidden after you navigate away).
   - Note the **Application (client) ID** and **Directory (tenant) ID** from
     the app's Overview page.
3. Back in Supabase's Azure provider settings, paste in the Client ID, Client
   Secret, and (if using a single-tenant registration) the Tenant ID or a
   custom "Azure Tenant URL". Save.
4. Optional but recommended: restrict sign-ups to the KidBike domain — Azure
   App Registrations can be scoped to "Accounts in this organizational
   directory only" so only `@kidbike.de` accounts can authenticate at all.

The first person to sign in becomes a `profiles` row with `role = 'staff'`
automatically (that's `handle_new_user()`, already applied in `0007`). **You'll
need to manually promote yourself to `admin`** the first time — there's no
admin yet to do it through the UI:

```sql
update profiles set role = 'admin' where email = 'your-email@kidbike.de';
```

Run that in the SQL Editor after your first successful login (log in once via
the app so the `profiles` row exists, then run this).

## 4. Get your API keys

**Project Settings → API**:
- **Project URL** → `NEXT_PUBLIC_SUPABASE_URL`
- **anon / public key** → `NEXT_PUBLIC_SUPABASE_ANON_KEY`
- **service_role key** (click to reveal) → `SUPABASE_SERVICE_ROLE_KEY`

The service role key **bypasses every RLS policy** — treat it like a root
password. It belongs only in server-side environment variables, never in
anything that reaches the browser, and never committed to git.

## 5. Configure the app

Local development:
```bash
cd apps/web
cp .env.example .env.local
# fill in the three keys above, and keep TZ=Europe/Berlin
npm install
npm run dev
```

Netlify (once you're ready to deploy `apps/web` there): **Site settings →
Environment variables**, add the same four variables
(`NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`,
`SUPABASE_SERVICE_ROLE_KEY`, `TZ=Europe/Berlin`). The `TZ` one matters more than
it looks: the closing-hour and hold-expiry rules are wall-clock rules evaluated
with local date arithmetic, ported from the original browser code — the server
process has to actually run in Berlin time or those rules silently shift.

## 6. Verify it end to end

1. Visit the deployed (or `localhost:3000`) site — the home page should show
   the three locations and (once bookings exist) upcoming occupancy, reading
   from `public_availability` with **no personal data** in the response (check
   this in the browser's network tab if you want to see it for yourself).
2. Log in at `/admin` with your Microsoft account. After promoting yourself to
   `admin` (step 3), you should see **Übersicht**, **Buchungen**, **Preise**,
   **Verträge**, and **Benutzer** in the nav.
3. Open **Verträge** → **Weinstraße** — you should see all 16 real clauses,
   editable. Change something small, save, reload: it persists. This is the
   actual point of storing the contract text in the database rather than in
   code — you (or a location manager) can fix a typo or adjust a policy without
   waiting for a deploy.
4. Open **Verträge** → **Wiener Straße** — zero clauses, with a prompt to add
   one. This is the "not available yet, but ready to turn on later" state you
   asked about: nothing needs to change in the code or database schema to give
   WI a contract — either type the clauses in directly, or hand me a WI Word
   template later and I'll run the same importer used for WE/WA.
5. Test a booking request against the API route directly (until the public
   booking form itself is built — that's backlog task 2.1/2.2):
   ```bash
   curl -X POST https://your-app.example/api/booking-request \
     -H 'content-type: application/json' \
     -d '{
       "school": "WE", "persons": 20,
       "from": "2026-06-15T10:00", "to": "2026-06-15T14:00",
       "email": "test@example.com", "first_name": "Test", "last_name": "Person"
     }'
   ```
   A success response includes a computed `price_total` and `status:
   "requested"`. Submitting the exact same request twice should make the
   second one fail with `slot_taken` (409) — that's the overlap exclusion
   constraint working through the real API, not just in the local test.

## 7. The one thing that needs scheduling: expired holds

`expire_holds()` exists (`0007`) but nothing calls it on a schedule yet. Two
ways to fix that in Supabase, either is fine:

- **pg_cron** (simplest): **Database → Extensions** → enable `pg_cron`, then in
  the SQL Editor:
  ```sql
  select cron.schedule('expire-holds-hourly', '0 * * * *', $$select expire_holds();$$);
  ```
- **A scheduled Edge Function** if you'd rather trigger it from outside the
  database (e.g. to also send a notification when a hold expires) — more setup,
  more flexibility. Only worth it once expiry needs a side effect beyond the
  status flip.

## What's still genuinely blocked after this

Nothing about Supabase itself — once the six steps above are done, Phase 1's
database and the admin console's read/write paths are live. What remains is
application work already scoped in `docs/06-handoff-backlog.md`: the public
booking calendar and wizard (2.1/2.2), wiring `renderAgreements()` into an
actual "send the Nutzungsvereinbarung" action once a booking is approved (3.1
is the rendering pipeline; nothing calls it from the booking flow yet), and the
WA deposit-clause question in `docs/05-open-questions.md` (§18) before any WA
agreement goes out for real.
