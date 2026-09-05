# Status & roadmap

Written after the Antigravity contribution (`a279a95`) was reviewed, repaired
and extended. Supersedes the "what's next" half of
`docs/10-system-assessment.md`; the old-vs-new parity table there still stands.

## 1. What the review of `a279a95` found

The contribution was substantial and the ideas in it were right — controlled
double booking, a waitlist, customer warnings, a calendar view, document
downloads, an edit form, cron endpoints. Four defects had to be fixed before
any of it could run:

| Defect | Consequence if deployed |
|---|---|
| `0014` called `is_finance()`, which does not exist | The migration aborts partway. Everything after it — the waitlist table, the task cleanup, auto-complete — never gets created, and the half-applied state is not obvious from the dashboard. |
| `0014` added `create_booking_request` as a 15-argument *overload* instead of replacing the 14-argument one | `function create_booking_request(...) is not unique`. **Every booking, public and internal, stops working** — the ambiguity is unresolvable for existing callers. |
| `me.user.id` in two server actions (`SessionUser` has no `.user`) | `next build` fails; nothing deploys at all. |
| No tests for any of the new behaviour | The two SQL defects above were invisible until the suite ran them. |

All four are fixed. The lesson worth keeping: **the SQL test harness is what
caught the two production-breaking ones**, seconds after they were written.
Anything that touches `supabase/migrations/` should be run through
`supabase/test/run-tests.sh` before it is pushed.

One behavioural change in that commit is worth flagging as an improvement, not
a bug: non-public blocks now occupy the public calendar as opaque `busy`.
Previously an internal closure was invisible to customers, so someone could
request a slot that was in fact blocked. `05_events.test.sql` now pins both
halves of that — the slot is taken, and nothing about it leaks.

## 2. What was built on top

- **NV layout** now follows the owner's own signed agreements: venue block
  top-left, KidBike wordmark top-right, `zwischen:`/`und:` with the party
  table, the "Herzlich willkommen!" lead paragraph (which was missing — it
  lives in the Word letterhead, not in any clause, so the clause importer never
  saw it), numbered clauses, three signature lines, and the two-column footer
  including *Leitung* and phone. `LOGO_SRC` in `nv-template.ts` takes a real
  logo file whenever one is to hand; until then the wordmark is styled text.
- **Dashboard** (`/admin`): action tiles that each link to the screen that
  resolves them, the next seven days as an agenda, a twelve-month booking
  chart, and — for roles that may see money — this month's fees. Single
  series, single hue, no chart library.
- **Reminder emails** (`/admin/reminders`): rules of the shape "N days/hours
  before or after the event start, the event end, or the payment due date,
  send template X to bookings in these statuses". The wording is edited in the
  existing `/admin/mail-templates` screen — one editor, one placeholder
  vocabulary. Sent by `/api/cron/send-reminders`; a send is claimed in the
  database before the mail goes out, so overlapping runs cannot double-send.
- **Rate limiting** on both anonymous endpoints (`/api/booking-request`,
  `/api/waitlist`): a per-IP and a global limit per hour, counted in Postgres
  (a serverless function's memory is useless for this), plus a honeypot field.
  Fails open by design — a broken limiter must not take the booking form down.
- **iCal feed per location** (`/api/ical/<code>?token=…`): a caretaker
  subscribes from their own calendar app. The URL is shown on their own task
  page. One token per location so a leaked feed can be rotated alone.
- **Tests**: 22 new SQL assertions covering the double-booking override, the
  block conflict check, auto-complete, task cleanup on cancellation, waitlist
  scoping, rate limiting, and reminder scheduling.

## 3. Open items, in the order worth doing them

### Blocked on something only the owner can supply
1. **Sammel-Nutzungsvereinbarung** — needs the Word source. Contract text is
   not something to approximate. See backlog 3.2 for the schema change it also
   needs (`agreement_clauses` is keyed by location only today).
2. **SevDesk** — the matching engine is done and tested; the live API shape is
   unverified because there is no token yet (open question 14).
3. **Historical Excel import** (backlog 1.7) — blocked on the WA/WI column
   layouts.

### Needs one live check, not more code
4. **PDF attachment on the agreement email.** The HTML→PDF pipeline is
   verified locally; the Netlify + `@sparticuz/chromium-min` pairing is not.
   Send one real agreement from staging and look at the mail. It fails safe
   (mail goes without the attachment, error in the logs), so this is a
   confirmation step, not a risk.
5. **Cron schedules.** Four endpoints exist; none is scheduled yet. See
   `docs/07-supabase-setup.md`, "Scheduled jobs".

### Worth building next
*(6 and 7 are done; 8 is the remaining one.)*
6. ~~Occupancy reporting.~~ **Done** — `/admin/occupancy` (0018). Hours booked
   against the location's own bookable window, per month, with blocked hours
   reported beside rather than subtracted from the denominator.
7. ~~Waitlist → offer flow.~~ **Done** — a cancelled booking now shows who is
   waiting for an overlapping range and offers one button to mail them a
   pre-filled link into the public form (0017). No claim token and no hold:
   see that migration's header for why.
8. **Per-location mail templates.** `mail_templates` is global; WA and WE may
   eventually want different wording. The table would gain a nullable
   `location_id` and the loader a fallback — small, but not needed until
   someone asks.
9. ~~A second pair of eyes on deposits.~~ **Done** — the owner confirmed the
   WE branching, and open question 7 is closed. The 500 € arm stays in
   deliberately: it is unreachable only because the 22:00 closing block
   currently stands, and that block is an editable setting.

### Deliberately not doing yet
- Online payment (Stripe/Mollie). The abstraction exists
  (`packages/payments/src/providers.ts`), but bank transfer is what the
  agreement says and what the deposit workflow assumes. Adding a gateway
  changes the contract text and the refund path — a decision, not a feature.
- Per-user notification preferences. One shared `cc_emails` per location is
  still the right size for a team of this size.
