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
   supabase/migrations/0009_grants.sql
   supabase/migrations/0010_reference_and_tasks.sql
   supabase/migrations/0011_storage_buckets.sql
   supabase/migrations/0012_events.sql
   supabase/migrations/0013_mail_templates.sql
   supabase/migrations/0014_enhancements.sql
   supabase/migrations/0015_reminders_ical_ratelimit.sql
   supabase/migrations/0016_roles_permissions.sql
   supabase/migrations/0017_waitlist_offers.sql
   supabase/migrations/0018_occupancy.sql
   supabase/migrations/0019_experience_review.sql
   ```

   **`0016` is the only one that is destructive-looking, and it is safe.** It
   converts `profiles.role` from an enum to a foreign key into the new `roles`
   table and re-creates every RLS policy in permission terms. It prints
   `NOTICE: drop cascades to N other objects` twice — that is expected and is
   the policies being rebuilt three sections further down, not data being
   lost. Existing profiles keep their role: the five old enum values are
   seeded as protected system roles with the same keys. It is also safe to run
   twice.

   **`0009` matters even though it looks like boilerplate.** Without it, the
   app's `service_role` key — which is what the server-side code uses for
   almost everything — can't actually read any table, and every page fails
   with `permission denied for table locations` (or whichever table it tried
   first) despite the key being completely correct. This bit a real deploy of
   this exact app; if you're fixing that error on a project that's missing
   `0009`, running it now (and redeploying) is the fix.

   **Shortcut when several are missing at once.**
   `./supabase/post-deploy/bundle-migrations.sh 0012 0018 --seed > catch-up.sql`
   concatenates a range into ONE file wrapped in `begin`/`commit`, so it is a
   single paste and applies all-or-nothing — a failure rolls the whole thing
   back rather than leaving a half-migrated database that no file describes.
   That half-state is not hypothetical: 0014 once aborted partway and left the
   waitlist table uncreated with nothing to show for it.

   **Check afterwards which ones actually landed.** Paste
   `supabase/post-deploy/check-schema.sql` into the SQL editor and run it: it
   prints one row per migration saying `ok` or `>> FEHLT`, plus the number to
   carry on from. It changes nothing, works on a database at any stage, and is
   the fastest way to answer "did that whole list really run?" — which is worth
   asking, because a migration that fails halfway leaves no trace of itself
   anywhere else.

   The order matters — each one builds on the last (e.g. the overlap
   constraint in `0004` and `0014` needs the `bookings` table `0003` creates). Do **not**
   run `supabase/test/00_supabase_shim.sql` — that file exists only to fake the
   parts of Supabase (the `auth` schema, `anon`/`authenticated` roles) that a
   local Postgres doesn't have; a real Supabase project already has all of it.

3. Then run the seed data, again in order:

   ```
   supabase/seed/seed.sql
   supabase/seed/nv_clauses.sql
   supabase/seed/nv_clauses_overrides.sql
   supabase/seed/mail_templates.sql
   ```

   (`nv_clauses.sql` looks up locations by code, so `seed.sql` — which creates
   them — must run first.)

4. Sanity check, in a new query:
   ```sql
   select code, name, online_bookability from locations order by sort_order;
   select l.code, count(*) from agreement_clauses ac
     join locations l on l.id = ac.location_id group by l.code;
   select count(*) from mail_templates;
   ```
   Expect 3 locations (WE, WA, WI), clause counts WE=16, WA=11 (WI has none
   yet — that's correct, see §6), and 7 standard mail templates.

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
supabase db execute --file supabase/seed/nv_clauses_overrides.sql
supabase db execute --file supabase/seed/mail_templates.sql
```

Either option leaves the database in the identical state — this repo's local
test harness (`./supabase/test/run-tests.sh`) applies these same files in this
same order against a throwaway Postgres and passes 52 assertions, so you're not
the first one to run this sequence.

## 3. Set up magic-link login (for now)

Entra ID needs admin rights on KidBike's Azure tenant that may not be available
yet — that's fine, it's **purely additive** and can be turned on later with no
schema or code change (see the appendix at the end of this doc). Supabase Auth
treats every sign-in method identically underneath: the `handle_new_user()`
trigger creates the same `profiles` row regardless of *how* someone
authenticated, and the app's `getSessionUser()` never looks at which provider
was used. Magic link (an emailed one-click login, no password) works today with
almost no setup:

1. In Supabase: **Authentication → Providers** — **Email** is already enabled
   by default on every new project (this is what handles magic links; no
   toggle needed here).
2. **Authentication → URL Configuration** — do this step **after** step 5 below
   if you're deploying straight to Netlify rather than running locally first,
   since you need the real Netlify URL to fill it in:
   - **Site URL**: your app's real URL — `https://<your-site>.netlify.app`
     (or `http://localhost:3000` if you are running locally).
   - **Redirect URLs**: add `https://<your-site>.netlify.app/auth/callback`
     (and `http://localhost:3000/auth/callback` too, if you ever also run
     locally). Supabase refuses to redirect anywhere not on this list — a
     magic link will look like it silently fails if this step is skipped.
3. **Set `NEXT_PUBLIC_SITE_URL`** to that same real URL, alongside your other
   environment variables (Netlify, or `apps/web/.env.local` for local dev — see
   `.env.example`). Not strictly required for local dev (the app falls back to
   the request's own origin), but worth setting from the start once deployed so
   you don't hit a surprise later behind Netlify's proxy.
4. **Watch the email rate limit.** Supabase's default project uses its own
   shared test mail sender for auth emails, capped very low (a handful per
   hour) — fine for you alone testing, but ~5–30 staff logging in around the
   same time could hit it and get silently stuck waiting for an email that
   never arrives. Before rolling this out to real staff, configure a custom
   SMTP provider: **Authentication → Emails → SMTP Settings**. This repo's plan
   already calls for a transactional mail provider in Phase 2 (Resend or
   Postmark, for booking confirmations) — setting that provider up now and
   pointing Supabase's SMTP at it kills two birds at once.

Try it: go to `/login` in the app, enter your email, check your inbox
(including spam), click the link. You should land on `/admin`.

The first person to sign in becomes a `profiles` row with `role = 'staff'`
automatically. **You'll need to manually promote yourself to `admin`** the
first time — there's no admin yet to do it through the UI:

```sql
update profiles set role = 'admin' where email = 'your-email@kidbike.de';
```

Run that in the SQL Editor after your first successful login (log in once via
the app so the `profiles` row exists, then run this, then reload `/admin`).

## 4. Get your API keys

**Project Settings → API**:
- **Project URL** → `NEXT_PUBLIC_SUPABASE_URL`
- **anon / public key** → `NEXT_PUBLIC_SUPABASE_ANON_KEY`
- **service_role key** (click to reveal) → `SUPABASE_SERVICE_ROLE_KEY`

Newer projects show a different-looking **"Publishable and secret API keys"**
tab instead of (or alongside) the classic anon/service_role one — Supabase
renamed these, but they're the same two roles under a new name, and every
Supabase client library accepts either format identically:
- **Publishable key** (`sb_publishable_...`) is the anon key → `NEXT_PUBLIC_SUPABASE_ANON_KEY`
- **Secret key** (`sb_secret_...`, click the eye icon to reveal it) is the
  service_role key → `SUPABASE_SERVICE_ROLE_KEY`

If your project shows both tabs, use whichever is present — don't mix a
publishable key from one tab with a secret key from the other; they're
generated together as a pair.

Whichever naming your project shows, the **secret/service_role key bypasses
every RLS policy** — treat it like a root password. It belongs only in
server-side environment variables, never in anything that reaches the browser,
and never committed to git. Pasting the anon/publishable key into
`SUPABASE_SERVICE_ROLE_KEY` by mistake is a common way to hit a confusing
`permission denied for table ...` error later — the app can talk to Supabase
fine, it just doesn't have the privilege it thinks it has.

## 5. Deploy it

You don't need a local setup at all — a Git-connected Netlify deploy needs no
terminal on your machine beyond what's already been done for you. Local dev
(further below) is there if you ever want it, but skip it if you'd rather not.

### Option A — Netlify, connected to GitHub (recommended, zero terminal)

A `netlify.toml` is already committed at the repo root, so Netlify needs no
manual build configuration — connecting the repo is enough.

1. [app.netlify.com](https://app.netlify.com) → **Add new site → Import an
   existing project** → **GitHub** → authorise Netlify if asked → pick
   `erikkidbike-cloud/reservierungssystemVS`.
2. Branch to deploy: `claude/booking-system-architecture-neo3jo` (or `main`,
   once this is merged). Netlify should auto-detect the build settings from
   `netlify.toml` — if it shows a build command/publish directory field
   pre-filled with something different, leave the `netlify.toml` values as the
   source of truth rather than typing your own.
3. Before clicking deploy (or right after, then redeploy) — **Site
   configuration → Environment variables** → add:
   - `NEXT_PUBLIC_SUPABASE_URL`
   - `NEXT_PUBLIC_SUPABASE_ANON_KEY`
   - `SUPABASE_SERVICE_ROLE_KEY`
   - `TZ` = `Europe/Berlin` — matters more than it looks: the closing-hour and
     hold-expiry rules are wall-clock rules evaluated with local date
     arithmetic, ported from the original browser code — the server has to
     actually run in Berlin time or those rules silently shift.
   - `NEXT_PUBLIC_SITE_URL` — leave this one for after the first deploy, once
     you know the real URL (step below).
4. **Deploy site.** Netlify gives you a URL like
   `https://<random-name>.netlify.app` (you can rename it, or attach a custom
   domain, later — neither changes anything below except which URL you use).
5. Go back and set `NEXT_PUBLIC_SITE_URL` to that URL, then **trigger a
   redeploy** (Deploys → Trigger deploy) so it picks up the new variable.
6. Now go do the Supabase **Authentication → URL Configuration** step from §3
   above, using this same real URL — magic links won't work until that's set.

From here, every future push to the connected branch redeploys automatically —
you don't come back to Netlify's UI again unless you're changing environment
variables.

### Option B — local development (optional, for later)

Only if you want to run the app on your own machine — e.g. to try a change
yourself before asking me to make it:
```bash
cd apps/web
cp .env.example .env.local
# fill in the same variables as Option A, with http://localhost:3000 for
# NEXT_PUBLIC_SITE_URL (or leave it unset — see .env.example)
npm install
npm run dev
```
Then add `http://localhost:3000/auth/callback` to Supabase's Redirect URLs
alongside the production one.

## 6. Verify it end to end

1. Visit the deployed (or `localhost:3000`) site — the home page should show
   the three locations and (once bookings exist) upcoming occupancy, reading
   from `public_availability` with **no personal data** in the response (check
   this in the browser's network tab if you want to see it for yourself).
2. Log in at `/login` with your email (magic link). After promoting yourself to
   `admin` (step 3), you should see **Übersicht**, **Buchungen**, **Preise**,
   **Verträge**, and **Benutzer** in the nav, and an **Abmelden** (sign out)
   control on the right.
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

## 6b. Set up the roles

After promoting yourself to `admin` (step 3), open **Rollen** in the nav. The
five roles you had before are there, each already carrying the permissions its
old enum value implied — nothing needs changing for the system to work as it
did.

What is new is that you can add your own, and that every permission is a
checkbox. See `docs/03-roles-and-rls.md` for the table of what each built-in
role starts with, and for the three guard rails (the admin role keeps its own
access, a system role cannot be deleted, and the last active administrator
cannot be demoted).

## 7. The one thing that needs scheduling: expired holds

`expire_holds()` exists (`0007`) but nothing calls it on a schedule yet. Run
`supabase/post-deploy/schedule-expire-holds.sql` in the SQL Editor — that file
is the canonical version of this step and explains the options in its own
comments.

**"ERROR: 3F000: schema "cron" does not exist"** means the extension itself
was never turned on — the `cron` schema is created BY enabling it, not by
running SQL against it. Fix: **Database → Extensions** (in the Supabase
dashboard, not the SQL Editor) → search for `pg_cron` → toggle it on. THEN run
the SQL file. To confirm it's actually enabled before retrying:
```sql
select * from pg_extension where extname = 'pg_cron';
```
An empty result means it's still off.

If you'd rather trigger expiry from outside the database (e.g. to also send a
notification when a hold expires), a scheduled Edge Function is the
alternative — more setup, more flexibility, only worth it once expiry needs a
side effect beyond the status flip.

## What's still genuinely blocked after this

Nothing about Supabase itself, and by now (see `docs/10-system-assessment.md`)
very little about the application either — the public booking flow, signing,
tasks, payments and mail are all wired end to end. What's left is the
Sammel-Nutzungsvereinbarung (blocked on a source document this project
doesn't have — `docs/06-handoff-backlog.md` item 3.2) and the historical Excel
import (backlog 1.7, blocked on the WA/WI column layouts) — neither is a
Supabase setup step.

## Appendix — adding Microsoft/Entra ID later

Whenever Entra admin rights become available. This is additive, not a
migration: magic link keeps working for anyone who doesn't switch, and no
database change is needed — `handle_new_user()` and `getSessionUser()` don't
care which provider a login came through.

1. In Supabase: **Authentication → Providers → Azure**.
2. You'll need an Azure AD (Entra ID) App Registration. In the
   [Azure Portal](https://portal.azure.com) → **Entra ID** →
   **App registrations** → **New registration**:
   - Name: `KidBike VS Booking System` (or similar).
   - Redirect URI: **Web** →
     `https://<your-project-ref>.supabase.co/auth/v1/callback` (Supabase's
     Azure provider settings page shows you this exact URL — copy it from
     there rather than retyping).
   - **Certificates & secrets** → new client secret → copy its **value**
     immediately (it's hidden after you navigate away).
   - Note the **Application (client) ID** and **Directory (tenant) ID** from
     the app's Overview page.
3. Back in Supabase's Azure provider settings, paste in the Client ID, Client
   Secret, and Tenant ID (or a custom Azure Tenant URL for single-tenant
   registrations). Save.
4. Optional but recommended: restrict sign-ups to the KidBike domain — scope
   the App Registration to "Accounts in this organizational directory only" so
   only `@kidbike.de` accounts can authenticate at all.
5. Add a "Mit Microsoft anmelden" button to `apps/web/app/login/page.tsx`
   alongside the existing email form, calling (from a small Server Action,
   mirroring `requestMagicLink` in the same folder):
   ```ts
   const supabase = serverClient(await cookies());
   const { data } = await supabase.auth.signInWithOAuth({
     provider: 'azure',
     options: { redirectTo: `${origin}/auth/callback` },
   });
   redirect(data.url);
   ```
   The existing `/auth/callback` route already handles the resulting `code`
   exchange unchanged — it doesn't know or care which provider produced it.

**One thing to watch:** if someone already has an account from signing in with
magic link, and later uses Entra ID with the *same* email, Supabase's default
settings don't reliably guarantee the two get merged into one identity — it can
depend on project settings and has changed across Supabase versions, so don't
assume it "just works" without checking. The safe operational habit: the first
time each person tries Entra ID, check `profiles` for a duplicate email:
```sql
select id, email, role, created_at from profiles where email = 'person@kidbike.de';
```
If there are two rows, copy the role and any `user_locations` rows from the old
one to the new one, then set the old row's `is_active = false` (don't delete
it — `created_by`/`updated_by`/`assignee_id` foreign keys elsewhere may still
point at it).

## Scheduled jobs (cron)

Four endpoints do the recurring work. All are authorised by `CRON_SECRET`
(see `apps/web/.env.example`), which may be sent any of three ways —
`Authorization: Bearer <secret>`, an `x-cron-secret` header, or
`?secret=<secret>` — and all fail closed if that variable is unset. (Each
endpoint used to accept only some of those; they share one implementation
now, so one scheduler configuration drives all four.)

| Endpoint | What it does | Suggested schedule |
|---|---|---|
| `/api/cron/expire-holds` | Lapsed `requested` holds → `expired`, freeing the slot | hourly |
| `/api/cron/auto-complete` | `confirmed` bookings whose event has ended → `completed`, which schedules the deposit return | hourly |
| `/api/cron/send-reminders` | Sends the reminder rules configured at `/admin/reminders` | hourly |
| `/api/cron/sync-payments` | SevDesk payment matching (no-op until `SEVDESK_API_TOKEN` is set) | hourly |

Any scheduler works. The simplest with what is already set up is pg_cron plus
`pg_net` from the Supabase SQL editor, e.g.:

```sql
select cron.schedule('reminders-hourly', '15 * * * *', $$
  select net.http_get(
    url := 'https://<your-site>/api/cron/send-reminders?secret=<CRON_SECRET>'
  );
$$);
```

Stagger the minutes (`5`, `15`, `25`, …) so the four jobs don't all wake the
same cold function at once.

**Reminders never send twice.** Each send is claimed by inserting into
`reminder_sends` (booking + rule is the primary key) *before* the mail goes
out, so two overlapping runs cannot both send the same reminder. Turning a
rule on also does not retro-fire it at old bookings: `due_reminders` only looks
back 48 hours.
