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

## Phase A — fix what's broken, plus cheap wins

Small, mostly wiring. Do this first because two of them are defects and the
fourth makes everything built afterward look better.

- **A1 — `/admin/users`.** Build it properly: list profiles, change role, assign
  `user_locations`. Removes the "run SQL by hand to promote someone" step, which
  is a recurring need every time staff changes, not a one-off.
- **A2 — `/admin/tariffs`, read-only.** Show the current prices the engine will
  actually charge. Deliberately **not** a full editor yet: the config is nested
  JSONB, an editor is fiddly, and prices change roughly yearly — a read-only
  view plus an occasional code change is the right effort trade for now.
- **A3 — Agreement preview.** See the note below; this is much cheaper than it
  looks.
- **A4 — Styling foundation pass.** Consistent form controls, buttons, tables,
  spacing scale, a real app header. Do it *now*, before more pages exist —
  otherwise it's a restyle of ten pages instead of four. A focused pass, not a
  redesign.

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

## Decisions needed from the owner (not code)

1. **Resend domain verification for `kidbike.de`.** Until the DNS records are
   verified, mail can only reach the Resend account's own address — which means
   **B4 cannot be tested with real staff or customers.** This gates Phase B's
   usefulness.
2. **The WA deposit contradiction** (`docs/05-open-questions.md` §18): the
   booking form charges a 50/70 € Wassertorplatz deposit that the WA agreement
   never mentions. Must be resolved before any WA agreement goes out for real.
3. **Parallel running.** How long do the old Excel/Apps Script system and this
   one run side by side, and which is authoritative meanwhile? Affects whether
   Phase C needs the temporary `events-*.json` export (backlog 1.8).
