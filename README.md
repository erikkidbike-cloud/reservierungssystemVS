# Reservierungssystem VS (KidBike Verkehrsschulen)

A rebuild of the KidBike traffic-school (Verkehrsschule) booking system, moving
from the current Excel + Power Automate + GitHub JSON + Netlify + Google Apps
Script + Word/JotForm chain onto a single database-backed web application.

> **Status:** foundation / scaffolding. This branch contains the *hard*
> architectural work — the canonical business-rules spec, the database schema,
> the row-level-security model, the tested pricing engine, and the booking
> state machine — plus a phased backlog for the remaining implementation work.
> No UI app has been built yet; that is deliberately left as scoped follow-up
> tasks (see [`docs/06-handoff-backlog.md`](docs/06-handoff-backlog.md)).

## Why this rebuild

The current system works, but **Excel is the database**, and everything else
exists to compensate for that. Roles and column-level permissions don't exist,
requests are re-typed by hand from email into Excel, holds live in a Google
Sheet while bookings live in Excel (two sources of truth), and the pricing
logic is duplicated in JavaScript *and* an Excel `Preistabelle` that have drifted
apart. Replacing the database removes the need for roughly half of the moving
parts.

See [`docs/00-overview.md`](docs/00-overview.md) for the full diagnosis, the
target architecture, and the migration phasing.

## Target stack

| Layer | Choice | Why |
|---|---|---|
| Database + auth + API | Supabase (Postgres, EU/Frankfurt region) | Row Level Security gives per-location and per-column access without a hand-rolled permission system. Data stays in the EU. |
| Employee login | Supabase Auth with Microsoft / Entra ID | Staff log in with their existing KidBike account. |
| Web app | Next.js on Netlify | Public booking form + internal admin in one project. Netlify is already in use. |
| Email | Transactional provider (Resend/Postmark) via `events@kidbike.de` | Reliable, templated, no Apps Script quota. |
| Documents | Server-side PDF from HTML templates | The Nutzungsvereinbarung becomes a code template filled from the database. |
| Accounting | SevDesk API | Auto-fetch transactions and match on Verwendungszweck. |

## Repository layout

```
docs/                         Canonical specification (read these first)
  00-overview.md              Vision, diagnosis, architecture, phasing
  01-business-rules.md        THE source of truth for every rule & constant
  02-data-model.md            Entities and columns, with rationale
  03-roles-and-rls.md         Roles matrix + RLS design
  04-state-machine.md         Booking lifecycle and side-effects
  05-open-questions.md        Answered questions + remaining gaps to confirm
  06-handoff-backlog.md       Phased, scoped tasks for follow-up models
  07-supabase-setup.md        Step-by-step: create the project, apply the
                              schema, wire up Entra ID login, verify it works

supabase/
  migrations/                 Postgres schema, constraints, RLS, views, functions
  seed/                       Locations + tariffs seeded with exact numbers
  test/                       Local verification harness (no Supabase needed)

packages/
  pricing/                    The pricing engine (pure TS, fully tested)
  domain/                     Shared domain logic (booking state machine)

reference/
  legacy-kidbike-json/        Verbatim copy of the current live front-end
                              (index.html etc.) — the ground truth for the
                              pricing constants and terms text.
```

## Running the tests

**TypeScript** (pricing engine + state machine) — no install required, Node 22
strips types and runs `node --test` natively:

```bash
npm test          # from the repo root: runs every workspace (54 tests)
```

**Database** (schema, RLS, RPC, triggers) — needs a local PostgreSQL 16 binary
set, but no Supabase project:

```bash
./supabase/test/run-tests.sh    # throwaway cluster, 36 assertions
```

The DB harness applies a Supabase shim, every migration and the seed, then
asserts the overlap constraint, the booking-request guards, hold expiry, the
audit trigger and that `public_availability` leaks no personal data.

## For the next contributor (Opus / Sonnet / Haiku)

Start at [`docs/06-handoff-backlog.md`](docs/06-handoff-backlog.md). Every task
there is scoped with acceptance criteria and points at the exact source file /
line for any constant or text you need to copy in. The intellectually hard parts
(rules, schema, security model, pricing algorithm) are already done and tested;
the backlog is deliberately the "easy work".
