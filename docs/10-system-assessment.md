# System assessment: old vs. new, and where to go next

Written after Phase E (tariff/extras editor, special events + widgets, editable
mail templates, PDF attachments) — a checkpoint on "can this replace the old
system" and "what would make it better still."

## Can the new system do everything the old one did?

| Old system did this | New system | Notes |
|---|---|---|
| Public calendar per location (WE/WA/WI) | ✅ `/book` | One day at a time rather than a multi-week grid — see `docs/06-handoff-backlog.md` Phase 2. |
| Booking request + live price preview | ✅ `/book` | Same engine client- and server-side; price cannot drift. |
| DE/EN | ✅ | Wizard, signing page, mail templates all bilingual. |
| Server-side double-booking prevention | ✅, **stronger** | A GiST exclusion constraint, not a race-prone JSON-file poll. |
| Auto-expiring holds | ✅ `expire_holds()` | Needs the pg_cron schedule turned on once — see "Open items" below. |
| Nutzungsvereinbarung generation + email | ✅ | Now with a real PDF attachment (this phase) — see "PDF risk" below. |
| Online signing (JotForm) | ✅ `/sign/[bookingId]` | Signature pad + optional ID upload, same trust model (an unguessable link). |
| Internal booking management (the Excel) | ✅ `/admin/bookings` | Detail view, lifecycle actions, audit trail, internal "phone booking" entry form. |
| Caretaker duty mail ("Automatische Mail Ziethen") | ✅ `/admin/tasks` | Auto-created tasks on confirm/complete, not a single fragile mail flow. |
| SevDesk payment tracking | 🟡 | Matching engine done & tested; live API unverified (no token yet — OQ 14). Manual entry at `/admin/payments` works today, same code path. |
| Deposit tracking + return reminder | ✅ | Automatic `return_deposit` task, 14-day deadline. |
| Customer "experience" notes (do-not-rent, past ratings) | ❌ **not yet surfaced** | `customer_experiences` table exists (GDPR-scoped RLS already written) but has no admin UI. Real gap — see below. |
| Special/project calendar blocks (Frauenprojekt etc.) | ✅ `/admin/events` | Now editable, not just seeded once; extended with per-event colour/popup (this phase). |
| Multi-role access | ✅, **stronger** | Real roles + RLS, not "whoever has the Google Sheet link." |
| Editable prices | ✅ (this phase) | `/admin/tariffs` — every tier, the surcharge, deposit amounts, and extras. |
| Sammel-Nutzungsvereinbarung | 🚫 **blocked** | Needs the actual Word source text — not something to approximate. See `docs/06-handoff-backlog.md` item 3.2. |
| Reduced tariffs (Kita/Schule) | 🟡 unchanged | The old system also handled this manually; the engine supports it (`tariff_type`), no UI toggle on the public form yet — Phase 5 nice-to-have, not a regression. |
| Historical bookings on record | ⬜ not started | Backlog 1.7 (Excel import), independent of everything above, blocked on the WA/WI column layouts. |

**Bottom line: yes, with two flagged exceptions.** Everything the old system did
day-to-day is either done or has a working manual fallback (SevDesk). The two
real gaps are customer experience notes (nobody asked for it this session, but
it's schema-ready and worth an hour to expose) and the Sammel-NV (blocked on a
document this project doesn't have).

## What this phase added (not in the old system at all)

- **Tariff/extras/deposit editor** (`/admin/tariffs`) — prices, duration and
  person tiers/bands, the time surcharge, and deposit AMOUNTS are all editable
  without a deploy. Extras gained a `quantity` type (a per-unit price with an
  optional min/max), generalising what used to be WE's bike-specific special
  case. The deposit rule's BRANCHING (when a fee applies at all) is
  deliberately left alone — `packages/pricing/src/caution.ts` flags it
  unverified against the owner (open question 7), so only the parameters
  changed, not the logic.
- **Special events + categories** (`/admin/events`, `/widget/events`) — a
  "category" is a `projects` row (colour, default description/link); an event
  is a `blocks` row that can override any of those per occurrence. Clickable
  on the public calendar (a popup) and in a standalone embeddable widget for
  the website.
- **Editable mail templates** (`/admin/mail-templates`) — every automated
  email's DE/EN subject and body, with `{{placeholders}}`. A specific send can
  still be hand-edited once more right before it goes out
  (`/admin/bookings/[id]/send/[action]`) without touching the template.
- **PDF attachment on the signing email** — see the risk note below.

## The one piece that needs a live check: the PDF attachment

`lib/pdf.ts` renders the agreement to PDF with headless Chromium
(`playwright-core` + `@sparticuz/chromium-min`) inside the Netlify function
that sends the agreement_sent email. This was verified LOCALLY — the
HTML→PDF pipeline itself produces a correct, good-looking PDF given a
matching Chromium binary (confirmed while making this phase's styling
changes). What is **not** verified is the exact pairing of Netlify's
serverless runtime with `@sparticuz/chromium-min`'s downloaded Chromium pack —
real-world reports of this combination are mixed specifically on Netlify
(unlike AWS Lambda directly, which the package targets first).

It fails safe: if Chromium can't launch for any reason, the code logs the
error and sends the same email without the attachment — the signing link
still works, nothing about the booking is affected. **Before relying on the
attachment being there, trigger one real "NV versendet" and open the email.**
If it doesn't arrive with a PDF, check the Netlify function logs for the
`[pdf]` error, and see `lib/pdf.ts`'s header for the override knobs
(`CHROMIUM_PATH`, `CHROMIUM_PACK_URL`).

## Recommendations beyond what was asked for

Roughly in order of "how much day-to-day pain would this remove":

1. **Customer experience notes UI.** The table and its RLS already exist
   (admin/location_manager/finance only, per GDPR). A simple list+form at
   `/admin/customers` (search by name/email, show/edit the rating and note)
   would close the last real functional gap against the old system.
2. **A real dashboard.** `/admin` currently only shows open requests. Once
   there's a season of data, occupancy-by-location and revenue-by-month are
   the numbers a nonprofit board actually asks for (Phase 5 in the backlog
   already names this).
3. **Reminder emails.** "Your event is in 3 days" / "please pay by X" — the
   `payBy` date is already computed for the agreement; a scheduled job
   (same pg_cron mechanism as `expire_holds`) could nudge unpaid bookings
   before they become a manual follow-up.
4. **Rate limiting on `/api/booking-request`.** It's anonymous and unauthenticated
   by design (that's the point of a public form) — worth a basic per-IP
   throttle before this is the only intake channel, so a scripted flood can't
   fill the calendar with junk holds. `create_booking_request`'s own
   validation already rejects nonsense, but that's not the same as rate
   limiting.
5. **A waitlist for a fully-booked date.** Common ask once a location gets
   popular; the schema (bookings + a `postponed`-adjacent status, or a new
   lightweight table) is a small addition on top of what exists.
6. **iCal feed per location** (Phase 5, already backlogged) — lets a
   caretaker or location_manager subscribe from their own calendar app
   instead of checking the console.

None of these are blocking anything — they're the next-most-valuable things to
build once the core loop (request → approve → sign → pay → confirm → tasks)
has run for real bookings and any rough edges from actual use surface.
