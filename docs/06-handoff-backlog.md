# Handoff backlog

Scoped tasks for follow-up work (Opus / Sonnet / Haiku). The hard reasoning —
rules, schema, RLS, pricing algorithm, state machine — is done and lives in this
repo. These tasks are mostly wiring, copying verbatim text, and UI. Each task
lists **acceptance criteria** and the **source** to copy from. Do them roughly in
order; phases are independently shippable.

Convention: `reference/legacy-kidbike-json/` holds the verbatim current front-end
— it is the ground truth for any constant or text.

---

## Phase 0 — stabilise the current system (optional, ~1 day)

These touch the *old* repo (`erikkidbike-cloud/kidbike-json`) and Power Automate,
not this one. Listed for completeness.

- **0.1** Fix WE data-contract: make the WE flow write `frauenprojekt` (or make
  `normalizeEvents` read `fg`). AC: WE project events show green marking + link
  on the main calendar. Source: `docs/01-business-rules.md` §6.
- **0.2** Verify the Apps Script "Für Excel kopieren" TSV column mapping against
  the live `1-Termine` columns; fix offsets. AC: pasting a request lands in the
  right columns.
- **0.3** Remove the "(kostenlos)" bike label in the Apps Script email (bikes are
  1 €). 
- **0.4** Add a filename filter to the WA and WI Power Automate flows (as WE has).

---

## Phase 1 — database + internal console (core)

> **Done so far:** 1.2, 1.3 and the SQL half of 1.4 are implemented and verified.
> The whole schema, the RPC and the triggers are exercised by a local Postgres
> harness — run `./supabase/test/run-tests.sh` (52 assertions, no Supabase
> project needed). What remains in Phase 1 is provisioning (1.1), the Entra ID
> provider config (1.4), and the Next.js console (1.5–1.8).

- **1.1 Provision Supabase** (EU/Frankfurt). Apply `supabase/migrations/*` in
  order, then `supabase/seed/seed.sql`. AC: `select * from public_availability`
  works. *(Blocked on account access — everything it applies is already verified
  locally by `supabase/test/run-tests.sh`.)*
- ~~**1.2 Wire the pricing engine to the DB config.**~~ ✅ **Done** —
  `packages/pricing/src/tariff-loader.ts` (`parseTariffConfig`) validates an
  untrusted `tariffs.config` value and normalises tier ordering. Tests assert a
  DB-loaded config prices identically to the in-code config.
- ~~**1.3 `create_booking_request()`**~~ ✅ **Done** —
  `supabase/migrations/0007_functions.sql`. Validates location/bookability,
  range, 30-min minimum, 7-day lead (public only), and the closing rule in
  `Europe/Berlin`; upserts the customer; inserts the hold with a business-day
  expiry; logs a `booking_event`. A concurrent duplicate hits the exclusion
  constraint and is re-raised as `slot_taken`. Note the deliberate design
  change from the original sketch: it is **service-role only** and takes an
  already-computed price, because pricing must have exactly one implementation
  (`packages/pricing`) — see `docs/03-roles-and-rls.md`.
- ◑ **1.4 Login.** **Shipped with magic link, Entra ID deferred** — Entra admin
  access wasn't available yet, and since every sign-in method produces the same
  `profiles` row (`handle_new_user()` doesn't know or care which provider was
  used), that was never a blocker for the rest of Phase 1. Built: `/login`
  (magic-link form), `/auth/callback` (code exchange), sign-out, and session-
  refresh middleware (`apps/web/middleware.ts` — without it a session can drop
  when its access token expires even though the refresh token is still good,
  since only middleware/Actions/Route Handlers can write the renewed cookie).
  See `docs/07-supabase-setup.md` §3 for the Supabase dashboard steps (Site URL
  + Redirect URLs + the shared-SMTP rate-limit warning) and its appendix for
  adding Entra ID later — a UI + dashboard addition, no schema change.
  **Remaining:** enable the Azure provider once admin rights are available
  (appendix has the exact steps + the one gotcha to watch for: a duplicate
  `profiles` row if the same person's email signs in through both methods), and
  build the admin UI for assigning roles and `user_locations` (currently done by
  hand via SQL). AC: staff log in; admin can set roles.
- ◑ **1.5 Internal console shell** — **scaffolded** in `apps/web` (Next.js 15 App
  Router, builds clean). `/admin` has the auth guard, the not-yet-activated-account
  state, and role-aware nav; `lib/auth.ts` centralises the role predicates.
  **Remaining:** the `/admin/login` page wired to the Entra ID provider (needs 1.1
  + 1.4), and the `/admin/tariffs` and `/admin/users` pages the nav links to.
- ◑ **1.6 Booking list** — **done**; calendar remaining. `/admin/bookings` and
  `/admin` read via `bookingsRelationFor(role)`, so staff/caretaker hit the
  column-restricted `bookings_staff` view and the personal + financial columns are
  never sent to the browser. **Remaining:** the internal calendar view, and
  verifying the column restriction against a live project (the SQL suite already
  asserts the view's shape).
- **1.5b Public booking route** — ✅ **Done (ahead of Phase 2).**
  `apps/web/app/api/booking-request/route.ts` validates, prices server-side with
  `@vs/pricing`, then calls `create_booking_request` with the service role, and
  maps every DB error code to an HTTP status. The client's price is discarded.
- **1.7 Import existing data.** WE from the known 58-column workbook; WA/WI once
  columns are supplied (OQ 4). Map to `customers` + `bookings` (+ `blocks` for
  projects). AC: historical WE events appear in the internal calendar.
- **1.8 Temporary JSON export** so the *current* public form keeps working during
  the transition: a scheduled function writes `events-*.json` from
  `public_availability`. Remove in Phase 2.

## Phase 2 — public booking form

- ✅ **2.1 Public calendar**, reading `public_availability` — **Done, with a
  scope cut.** `/book` shows one calendar day at a time (a click-to-set-start
  bar plus precise time inputs) rather than a FullCalendar multi-week
  drag-select grid — occupancy is fully visible and every rule still applies,
  see `apps/web/app/book/BookingWizard.tsx`'s header comment for the reasoning.
  AC met: occupancy matches the DB (queries `public_availability` directly),
  no PII in the payload (that view never carried any).
- ✅ **2.2 Booking wizard** (2 steps: time/price, then contact + terms) —
  **Done.** DE/EN copy and the 10 terms per language are ported verbatim from
  `index.html` into `apps/web/lib/public-i18n.ts` (`I18N`, `getTermsForSchool`).
  Time validation runs the actual `validateRequest()` from `@vs/pricing` in the
  browser — not a re-implementation — so the AC holds by construction.
- ✅ **2.3 Live price preview** — **Done.** `BookingWizard` calls `computePrice()`
  from `@vs/pricing` directly, the same module `lib/booking-pricing.ts` uses
  server-side, so the previewed and charged price cannot diverge.
- ✅ **2.4 Submit → `create_booking_request()`** — **Done** (this RPC's actual
  name; `request_booking()` above was this doc's working title). Server
  recomputes and stores the price; the client's number is never trusted, and
  the exclusion constraint rejects overlap even under a race.
- ⬜ **2.5 Re-point the website iframe.** The `embed-size` `postMessage`
  protocol is implemented (`BookingWizard`'s effect posts `document.
  documentElement.scrollHeight` to `window.parent`), but pointing the actual
  kidbike.de iframe at `/book` and decommissioning Apps Script/the Sheet/the
  flows/the GitHub dispatch is a cutover on the *website's* side, outside this
  repository — see `docs/09-cutover.md` for the steps and their order.

## Phase 3 — documents & signing

- ✅ **3.1 Nutzungsvereinbarung PDF** — **Done for WE and WA.**
  `packages/documents` renders the agreement to A4 PDF via headless Chromium with
  the **real** clause wording, extracted mechanically from the owner's Word
  templates by `scripts/import-nv-docx.py` (never retyped — re-run the importer
  after a Word edit and review the diff). 16 clauses for WE, 11 for WA, DE + EN,
  plus both cover emails. Merge fields are filled from the booking; a test asserts
  no placeholder survives into a rendered document.
  **Language:** `renderAgreements()` produces one PDF in the language the customer
  chose when booking; pass `{ languages: ['de','en'] }` for the old always-both
  behaviour.
  **Remaining:** WI has no template (phone-only). And see the two source-document
  issues in `packages/documents/README.md` — the WA Word file's heading styles are
  broken (worked around, but worth tidying), and **WA charges a 50/70 € deposit
  online that its agreement never mentions**, which needs a decision.
- ✅ **3.1b Nutzungsvereinbarung editing UI** — **Done.** The clause text isn't a
  fixed constant: it lives in the `agreement_clauses` table
  (`supabase/migrations/0008_agreements.sql`), seeded once from the Word import
  (`supabase/seed/nv_clauses.sql`, `ON CONFLICT DO NOTHING` — never overwrites an
  edit) and editable at `/admin/agreements` with no deploy. RLS scoping (admin
  everywhere, location_manager only their location) is proven by an actual
  role-switch test, not just checked for shape —
  `supabase/test/02_agreements.test.sql`. A location with no rows (WI today) has
  no agreement yet; the "Aus importierter Word-Vorlage übernehmen" button or
  typing clauses in by hand both work the same way for turning one on later.
- 🚫 **3.2 Sammel-Nutzungsvereinbarung** — **Blocked, not attempted.** This needs
  the actual `Sammel-Nutzungsvereinbarung VS WE DE.docx` wording (the 30%
  Skonto clause and the no-deposit variant are contract text, not something to
  invent by analogy the way the WA deposit clause was adapted from WE's own
  approved wording — there, the source was this project's own text; here there
  is no source at all). Needs: (a) the Word file, imported the same way
  `scripts/import-nv-docx.py` handled WE/WA, and (b) a schema decision, since
  `agreement_clauses` is keyed by `location_id` only today — a location's
  Sammel-NV would need its own clause set alongside its normal one (e.g. a
  `document_type` column added to `agreement_clauses`, mirroring the enum
  already on `documents`).
- ✅ **3.3 Signing page** (no account) — **Done.** `/sign/[bookingId]` — the
  booking's own UUID is the access token, mailed only at `agreement_sent` (see
  `agreementSentToCustomer` and `markAgreementSent` in
  `app/admin/bookings/actions.ts`), matching the trust model the two JotForm
  links relied on. Renders the live agreement (`buildNutzungsvereinbarungHtml`,
  same renderer as the admin preview) alongside a canvas signature pad
  (mouse/touch) and an ID upload that's required exactly when
  `needs_id_upload` is set. `app/api/sign/[bookingId]/route.ts` stores the
  signature and any ID document in private Storage buckets
  (`supabase/migrations/0011_storage_buckets.sql`), writes `documents`
  (signer name, timestamp, IP), and transitions the booking to `signed`.
  Idempotent: opening an already-signed link again just shows confirmation.

## Phase 4 — payments & tasks

- 🟡 **4.1 SevDesk integration** (needs API token, OQ 14) — **Matching engine
  done and tested; the SevDesk half is unverified.** `packages/payments`'
  `matchPayments()` is a pure, tested function (10 tests) matching a
  transaction to a `signed` booking on Verwendungszweck-contains-in-purpose +
  exact amount, refusing to guess on an ambiguous match. `sevdesk-client.ts`
  and `app/api/cron/sync-payments/route.ts` wire it to the real SevDesk API,
  but the endpoint/field names there are from SevDesk's public docs, not
  confirmed against a real response — verify once OQ 14's token exists (that
  file's header says exactly what to check). Until then, **`/admin/payments`
  works today**: it records a payment manually through the identical
  `applyPayment()` the automated path uses, so a booking bought "manually
  now, automatically later" is recorded the same way either time.
- ✅ **4.2 Verwendungszweck generator** — **Done, format reproduced; exact
  Excel sequence not.** `generate_verwendungszweck()` in
  `supabase/migrations/0010_reference_and_tasks.sql` reproduces the documented
  FORMAT (`F` + location + 3-digit sequence + 2 letters surname + 2 letters
  first name) — the Excel *formula* itself was never recovered (still an open
  question), so the 3-digit component is this system's own sequence, not a
  continuation of Excel's historical numbers; see that migration's header for
  why that's fine going forward and what a future Excel import (1.7) should do
  differently. `create_booking_request()` now sets it on every booking.
- ✅ **4.3 Caretaker tasks + view** — **Done.** A trigger on `confirmed`
  (`create_lifecycle_tasks()`, same migration) creates `open_venue` /
  `close_venue` tasks, assigned to whichever `hausmeister` is linked to the
  location via `user_locations` (unassigned, visible to admin/location_manager,
  if none is on file yet). `/admin/tasks` is the caretaker's own list
  (`caretaker_tasks` view, already scoped to `auth.uid()`) with a "done"
  button, and the admin/location_manager management view alongside it.
- ✅ **4.4 Deposit-return workflow** — **Done**, same trigger: completing a
  booking with a deposit held creates a `return_deposit` task due 14 days
  after the event.
- ✅ **4.5 Cron: expire holds** — **Done, including the schedule.**
  `expire_holds()` (0007) does the work; `supabase/post-deploy/schedule-expire-
  holds.sql` is the one-time SQL-editor step that puts it on an hourly pg_cron
  schedule (kept outside `migrations/` because pg_cron is Supabase-managed and
  unavailable to the local test harness — see that file's header).

## Phase 5 — nice-to-haves

- **5.1** iCal feed per location. **5.2** Reporting (occupancy, revenue/school).
  **5.3** Reminders. **5.4** Optional online payment. **5.5** Reduced tariffs on
  the public form (toggle already supported by the engine + `tariffs`).

---

## Cross-cutting

- **Tests first for anything touching money or overlap.** The pricing engine
  already has a pinning suite; extend it, don't rewrite it.
- **Never trust the client price** — always recompute server-side in
  `request_booking()`.
- **GDPR:** `customer_experiences` is restricted; never expose it to staff,
  caretaker or anon. Keep the public availability view free of PII (it already is).
- **Staging first:** a separate Supabase project + Netlify preview per PR (OQ 17).
