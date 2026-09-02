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

- **1.1 Provision Supabase** (EU/Frankfurt). Apply `supabase/migrations/*` in
  order, then `supabase/seed/seed.sql`. AC: `select * from public_availability`
  works; `select computed price` via the RPC returns sane numbers.
- **1.2 Wire the pricing engine to the DB config.** Load `tariffs.config` and
  pass it to `packages/pricing`'s `computePrice`. AC: engine output for seeded
  configs equals the hard-coded config output (a test asserts this).
- **1.3 `request_booking()` RPC** — implement the SECURITY DEFINER function
  sketched in `docs/03-roles-and-rls.md`: validate (reuse the engine's
  `validateRequest`), compute price, upsert customer, insert booking, write
  `booking_events`. AC: a double-submit of the same slot fails on the exclusion
  constraint with a clean error.
- **1.4 Microsoft / Entra ID auth** in Supabase; on first login create a
  `profiles` row (default role `staff`). AC: staff log in; admin can set roles.
- **1.5 Internal console shell** (Next.js `/admin`): auth guard, role-aware nav.
- **1.6 Booking list + calendar** (internal), querying the role-appropriate view.
  AC: staff never receive contact/financial columns (verify in the network tab).
- **1.7 Import existing data.** WE from the known 58-column workbook; WA/WI once
  columns are supplied (OQ 4). Map to `customers` + `bookings` (+ `blocks` for
  projects). AC: historical WE events appear in the internal calendar.
- **1.8 Temporary JSON export** so the *current* public form keeps working during
  the transition: a scheduled function writes `events-*.json` from
  `public_availability`. Remove in Phase 2.

## Phase 2 — public booking form

- **2.1 Public calendar** (FullCalendar) reading `public_availability`. Port the
  UX from `reference/legacy-kidbike-json/index.html` (grid, responsive day/week,
  closing block for WE). AC: occupancy matches the DB, no PII in the payload.
- **2.2 Booking wizard** (2 steps: time/price, then contact + terms). Reuse the
  DE/EN i18n and the 10 terms per language verbatim from `index.html`
  (`I18N`, `getTermsForSchool`). AC: validation matches `validateTimes`
  (see engine `validateRequest`).
- **2.3 Live price preview** from `packages/pricing` (same module the server
  uses). AC: preview equals server-computed price for identical input.
- **2.4 Submit → `request_booking()` RPC.** AC: server recomputes and stores the
  price; client number is never trusted. Overlap is rejected server-side.
- **2.5 Re-point the website iframe** to the new form; keep the `postMessage`
  height protocol (`embed-size`) from `index.html`. Decommission Apps Script,
  the Sheet, the four flows, the GitHub dispatch.

## Phase 3 — documents & signing

- **3.1 Nutzungsvereinbarung PDF template** from HTML, filled from a booking.
  Copy the 16 clauses verbatim from `Nutzungsvereinbarung VS WE DE EN` (owner has
  the .docx; bank details: KidBike e.V., Berliner Sparkasse,
  DE09 1005 0000 0190 8304 17). AC: generated PDF matches the Word content
  (DE + EN).
- **3.2 Sammel-Nutzungsvereinbarung** — select multiple bookings → one PDF
  (30% Skonto clause, no deposit clause). Replaces the Excel `Sammel-NV`
  paste-tab. Source: `Sammel-Nutzungsvereinbarung VS WE DE.docx`.
- **3.3 Signing page** (no account): mouse/touch signature; **optional** ID
  upload when `needs_id_upload`. Store signer name, timestamp, IP. Two JotForm
  forms are being replaced (with-ID `261884496339373`, without-ID
  `251882285854065`). AC: signed PDF + metadata stored; state → `signed`.

## Phase 4 — payments & tasks

- **4.1 SevDesk integration** (needs API token, OQ 14): poll transactions →
  `payments`. Match on Verwendungszweck + amount. AC: a matching payment advances
  `signed`→`paid` automatically.
- **4.2 Verwendungszweck generator** — reproduce the Excel `AutoVZweck` formula
  (`F` + location + last 3 of series + 2 surname + 2 first-name letters). AC:
  generated reference equals the Excel output for sample rows.
- **4.3 Caretaker tasks + view** — on `confirmed`, create `open_venue` /
  `close_venue` tasks; caretaker sees only `caretaker_tasks`. Replaces the
  "Automatische Mail Ziethen" flow. AC: caretaker login shows only their tasks.
- **4.4 Deposit-return workflow** — on `completed`, a `return_deposit` task with a
  14-day deadline when a deposit was held.
- **4.5 Cron: expire holds** — hourly, `requested` past `hold_expires_at` →
  `expired`.

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
