# Improvement plan (after first real use)

Written after the first hands-on session with the deployed app. Supersedes the
ordering in `docs/06-handoff-backlog.md` where the two disagree — that backlog
was written before anything was deployed; this is based on what actually
breaks and blocks when you sit in front of it.

## The one-line diagnosis

**Every engine works. Almost none of them is reachable from a screen.**

| Engine | State | Reachable from the UI? |
|---|---|---|
| Pricing (`packages/pricing`, 48 tests) | ✅ works | only via the API route |
| Booking state machine (`packages/domain`, 6 tests) | ✅ works | ❌ **not wired to anything** |
| Agreement renderer (`packages/documents`, 22 tests) | ✅ works | ❌ **not wired to anything** |
| Schema + RLS + guards (52 SQL assertions) | ✅ works | partially |

That is good news: the remaining work is mostly **wiring**, which is faster and
much lower-risk than building. It also explains why the app feels hollow — the
expensive, careful parts are all there, just not connected to a button.

## What's actually broken right now

1. **`/admin/tariffs` and `/admin/users` 404.** The nav links to pages that were
   never built. A defect, not a missing feature — links should never point at
   nothing.
2. **No agreement preview.** The renderer is never called from the app.
3. **A booking cannot be created** — no public form, and no internal form either.
4. **A booking cannot be acted on.** `/admin/bookings` is a read-only list. There
   is no approve / reject / cancel, so the state machine has no way to run.
5. **No email is ever sent.** `create_booking_request` has a `TODO` where the
   notification should be. A booking would land in the database and nobody would
   know.
6. **Styling is minimal** — 138 lines of hand-rolled CSS.

## The sequencing decision that matters most

The instinct from "I can't make bookings" is to build the customer-facing
calendar first. **That's the wrong first move.** If a customer submits a booking
and no staff member can see it, be notified of it, or approve it, you have built
a form that submits into a void — worse than having no form, because it makes a
promise the system can't keep.

**Build the receiving end first.** Internal booking management is also smaller
(no drag-select calendar, no mobile, no DE/EN), it covers the phone-booking case
that Wiener Straße needs anyway, and it makes the system immediately useful:
new bookings could be entered here instead of Excel, before a single customer
ever sees it.

## Phase A — fix what's broken, plus cheap wins ✅ DONE

Small, mostly wiring. Done first because two were defects and the fourth makes
everything built afterward look better.

- ✅ **A1 — `/admin/users`.** Lists everyone who has logged in, with role and
  location assignment, plus deactivate. Removes the "run SQL by hand to promote
  someone" step — a recurring need every time staff changes, not a one-off. RLS
  (`profiles_admin_write`, `user_locations_admin`) remains the real enforcement;
  the page just stops making people write SQL.
- ✅ **A2 — `/admin/tariffs`, read-only.** Shows exactly what the engine will
  charge, parsed with the same `parseTariffConfig()` the pricing engine uses —
  so it cannot drift from reality, and reports a malformed tariff instead of
  rendering a plausible-looking lie. Deliberately **not** an editor: nested
  JSONB, fiddly to edit, and prices change roughly yearly.
- ✅ **A3 — Agreement preview** at `/admin/agreements/[code]/preview`, rendering
  the live DB clause text with example booking data. No Chromium (see below).
- ✅ **A4 — Styling foundation pass.** Token-driven CSS (spacing scale, colour
  tokens, dark mode), proper form controls, buttons, tables, cards, nav. Done
  before more pages existed, so new pages inherit it.

### A3 note: preview is cheap, automated PDF is not

`buildNutzungsvereinbarungHtml()` is a pure function — no Chromium, no
dependencies. So:

- **Preview** = render that HTML at a route and show it. Trivial, works on
  Netlify today.
- **A real PDF for a human** = that same page, browser print → Save as PDF. The
  stylesheet already has correct `@page` A4 rules, so the output is genuinely
  print-correct.
- **Only automated PDF *email attachments*** need headless Chromium — and
  Netlify's serverless functions are a poor host for it (bundle size, cold
  starts, timeouts, and under Netlify's credit pricing, heavy long-running
  functions are the most expensive thing you can run). That's a separate,
  later decision, not a blocker for anything in Phase A or B.

## Phase B — the booking spine (makes it genuinely usable)

This is the phase that turns it from a viewer into a system.

- **B1 — Booking detail page.** One booking, everything about it, in one place.
- **B2 — Lifecycle actions**, wired to `packages/domain`'s state machine:
  approve, reject, cancel, mark paid, confirm. The transitions and their guards
  already exist and are tested — this is connecting them to buttons and writing
  the `booking_events` audit row.
- **B3 — Internal "new booking" form.** Staff-entered bookings (phone calls,
  Wiener Straße, anything unusual). Reuses the pricing engine and
  `create_booking_request` with `source='internal'`, which already skips the
  7-day lead rule for staff.
- **B4 — Email notifications** via Resend (already set up for auth email, so the
  infrastructure decision is made and paid for): new request → the location's
  `cc_emails`; approved/rejected → the customer. Fills the existing `TODO`.

## Phase C — open the public tap

Only once B works end to end.

- **C1** — Public availability calendar, ported from
  `reference/legacy-kidbike-json/index.html`.
- **C2** — Booking wizard, DE/EN, with live price preview from the same engine
  the server uses (so the quoted price and the charged price cannot diverge).
- **C3** — Re-point the website iframe; decommission the Apps Script / Sheet /
  Power Automate chain.

## Phase D — documents, signing, money

Largely as already scoped in `docs/06-handoff-backlog.md` Phase 3–4: agreement
send + signature flow, SevDesk payment matching, caretaker tasks.

## Decisions from the owner

1. ✅ **Resend domain verification for `kidbike.de`** — done. Mail can now reach
   any address, so B4's notifications are testable with real staff and customers.
2. ✅ **The WA deposit contradiction** — resolved: charge it *and* put it in the
   contract. Implemented; see `docs/05-open-questions.md` §18 for what was
   written and the two follow-ups that remain (fold it into the Word template,
   and read the drafted wording once).
3. **Parallel running** — the term was jargon; restated plainly, the question is
   *when does the old system stop being the real one?* Today the old chain
   (Excel + Apps Script + Power Automate + the booking form on kidbike.de) is
   still taking every real booking; this system has no customers pointed at it.
   The recommended answer, unless there's a reason otherwise:
   - **Keep the old system authoritative and untouched** until Phase C ships.
     Don't change it, don't dual-enter into both — double entry is how two
     systems quietly disagree.
   - **Use this one internally only** during Phase B: staff can look at it, and
     once B3 lands, enter test bookings in it, but customers never see it.
   - **Then one clean cutover**: re-point the website's booking iframe at the new
     form, and from that moment the new system is the only one taking bookings.
   - This makes backlog **1.8 (temporary `events-*.json` export) unnecessary** —
     that task only exists to let the new database feed the *old* public form
     during an overlap period, which a clean cutover doesn't need. Skip it
     unless the cutover has to be gradual per location.
   - Historical data (backlog 1.7, the Excel import) can happen before or after
     cutover; it's independent, and blocked on the WA/WI column layouts anyway.
