# Overview: diagnosis, architecture, phasing

## The diagnosis, in one sentence

The problem is not that the current system uses Excel, Power Automate, GitHub,
Netlify, Apps Script, Google Sheets, Word and JotForm. The problem is that
**Excel is the database** and everything else is built around it to compensate.
Nearly everything that hurts today comes from that:

- Roles and column-level permissions don't exist, because Excel has no
  row-level or column-level security.
- Requests are re-typed by hand, because there is no path from form to table.
- Holds live in a Google Sheet and bookings in Excel → two sources of truth.
- Pricing logic lives in JavaScript **and** in an Excel `Preistabelle`, and the
  two have drifted apart.
- The Word mail-merge depends on a Windows file path on one laptop.
- The caretaker email is a separate flow with a snapshot file, because there is
  no "task" concept.

Replace the database, and half of the building blocks become unnecessary.

## What disappears vs. what stays

**Removed by the rebuild:** the four Power Automate flows, the GitHub
`repository_dispatch`, the `events-*.json` files, Apps Script, the Google Sheet,
the Word templates, JotForm.

**Kept:** Netlify (hosting), the Microsoft tenant (login + the `events@kidbike.de`
mailbox), SevDesk (accounting).

## Target architecture

```
                         ┌─────────────────────────────────────────────┐
                         │                Next.js app (Netlify)          │
   Public visitor ──────▶│  /  public booking form + calendar            │
                         │  /admin  internal console (auth required)     │
   Staff (Entra ID) ───▶│                                               │
                         └───────────────┬───────────────────────────────┘
                                         │  (RLS-scoped queries + RPC)
                                         ▼
                         ┌─────────────────────────────────────────────┐
                         │            Supabase (Postgres, EU)            │
                         │  auth · tables · Row Level Security · views   │
                         │  overlap exclusion constraint (server-side)   │
                         └───┬───────────────┬───────────────┬───────────┘
                             │               │               │
                   transactional mail   PDF generation    SevDesk API
                   (Resend/Postmark)    (NV, Sammel-NV)   (payment match)
```

The **pricing engine** (`packages/pricing`) is a pure, framework-agnostic,
fully-tested TypeScript module used by *both* the public form and the internal
console, so the two can never drift again — the single-price-motor principle.

## Why custom app over Power Apps / Dataverse

Dataverse is the honest alternative (already inside Microsoft 365, has roles and
row/column security built in). It was weighed and set aside because:

- Dataverse needs premium per-user Power Apps licences — a structural monthly
  cost that scales with every caretaker and volunteer added.
- The public drag-select calendar form must be built separately anyway (Power
  Apps is for logged-in users) — the hardest integration in the whole picture.
- The pricing logic wants to live in one place used by both public and internal;
  that is one TypeScript module here versus awkward Power Fx / Flow there.
- The builder is comfortable with code, Git and JS — the profile a custom app
  suits.

Pick Dataverse if someone after the current builder must maintain this who
cannot read code but is a Microsoft admin. Otherwise the custom route wins on
control, cost and a good public form. Owner has chosen the custom route.

## Roles (target)

| Role | Sees | May |
|---|---|---|
| Admin | everything | everything incl. tariffs & users |
| Location manager (per location) | all bookings of their location(s), incl. contact & payment data | approve, edit, cancel, send agreement |
| Staff (per location) | calendar + name + persons + type; **no** address/phone/finance | add notes, tick tasks |
| Finance | all locations, payment & deposit side only | match payments, refund deposit |
| Caretaker (Hausmeister) | only their tasks: date, time, open/close, name, phone | tick task done |
| Public | occupancy as blocks without content | submit requests |

"Not seeing all columns" is solved with per-role Postgres views + RLS, so the
front-end simply never receives what a role may not see. Detail in
`docs/03-roles-and-rls.md`.

## Booking lifecycle (target)

```
requested ──▶ approved ──▶ agreement_sent ──▶ signed ──▶ paid ──▶ confirmed
    │            │                                                    │
    └ rejected   └ expired (auto after N business days)     completed ─┴▶ deposit returned
                                                              │
                                                    cancelled / postponed
```

Each transition can fire a side effect (notification, PDF generation, task
creation, payment watch). Full table in `docs/04-state-machine.md`.

## Phasing

Each phase is independently useful; Phase 1 is the biggest step.

- **Phase 0 (≈1 day):** repair the worst issues in the *current* system so it is
  stable while the rebuild proceeds: fix the WE `fg`→`frauenprojekt` data-contract
  bug, verify the Apps Script "Für Excel kopieren" TSV column mapping, remove the
  "kostenlos" bike label, add the filename filter to the WA/WI flows.
- **Phase 1 — database + admin (core):** data model, import existing Excel data
  for all three locations, Microsoft login, roles, internal calendar and booking
  list. Staff work here instead of in Excel. Temporarily keep exporting the old
  `events-*.json` so the current public form keeps working.
- **Phase 2 — public form:** new booking page against the new database, with
  server-side overlap checking and the pricing engine. Re-point the website
  iframe. Turn off Apps Script, the Sheet, the flows and the GitHub dispatch.
- **Phase 3 — documents & signing:** Nutzungsvereinbarung as PDF, signing link
  (mouse/touch signature + optional ID upload), Sammel-NV. Turn off Word and
  JotForm.
- **Phase 4 — payments & tasks:** SevDesk integration, automatic status change on
  payment, caretaker tasks and email, deposit-return workflow.
- **Phase 5 — the nice-to-haves:** iCal feed per location, reporting (occupancy,
  revenue per school), reminders, optional online payment.

The task-level breakdown is in `docs/06-handoff-backlog.md`.
