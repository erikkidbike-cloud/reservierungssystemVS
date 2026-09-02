# Data model

Postgres (Supabase). The authoritative DDL is in `supabase/migrations/`; this
document explains the *why*. Design principles:

1. **Holds are not a separate store.** A hold is a `booking` with
   `status = 'requested'` and a `hold_expires_at`. One table, one source of truth
   — the current Sheet-vs-Excel split disappears.
2. **Overlap is prevented in the database**, not just the browser, via a GiST
   exclusion constraint (see §bookings).
3. **Prices (the numbers) live in the `tariffs` table** as editable config; the
   pricing **algorithm** lives in `packages/pricing`. Non-devs adjust prices
   without a deploy; the algorithm stays tested in code.
4. **Column-level security via role-scoped views** (see `docs/03-roles-and-rls.md`).
5. **Locations are a table, not an enum**, so a fourth location needs data, not
   code. All the current `if (currentKey === 'WI')` hardcoding becomes columns.

## Enums

| Enum | Values |
|---|---|
| `online_bookability` | `online`, `phone_only`, `offline` |
| `tariff_type` | `standard`, `kita_schule`, `nachweis` |
| `app_role` | `admin`, `location_manager`, `staff`, `finance`, `hausmeister` |
| `booking_status` | `requested`, `approved`, `agreement_sent`, `signed`, `paid`, `confirmed`, `completed`, `rejected`, `expired`, `cancelled`, `postponed` |
| `booking_source` | `public_form`, `internal`, `import` |
| `experience_rating` | `do_not_rent`, `negative`, `neutral`, `positive` |
| `task_type` | `open_venue`, `close_venue`, `return_deposit`, `send_agreement`, `other` |
| `task_status` | `open`, `done`, `cancelled` |
| `document_type` | `nutzungsvereinbarung`, `sammel_nutzungsvereinbarung` |
| `document_status` | `draft`, `sent`, `signed` |
| `block_kind` | `project`, `maintenance`, `training`, `other` |

## Tables

### `profiles`
Mirror of `auth.users`, holding the app role. One row per employee.
`id (uuid, FK auth.users)`, `email`, `full_name`, `role app_role`,
`is_active`, timestamps.

### `user_locations`
Which locations a scoped user belongs to (`location_manager`, `staff`,
`hausmeister`). `admin` and `finance` implicitly see all → no rows needed.
PK `(user_id, location_id)`.

### `locations`
`id`, `code` (WE/WA/WI, unique), `name`, `short_name`, `address`, `lat`, `lng`,
`phone`, `online_bookability`, `closing_hour int null` (WE=22), `hold_business_days`
(WE 3 / WA 2 / WI 3), `min_lead_days` (7), `min_duration_minutes` (30),
`default_tap_minutes` (120), `grid_min_hour` (12), `grid_max_end_hour` (28),
`cc_emails text[]` (notification CCs), `is_active`, `sort_order`, timestamps.
Every current hardcoded per-location constant is a column here.

### `tariffs`
Holds the pricing **config** as JSONB, versioned by date so prices can change
without losing history. `id`, `location_id`, `tariff_type`, `config jsonb`,
`valid_from date`, `valid_to date null`, `is_active`. Unique
`(location_id, tariff_type, valid_from)`.

`config` shape (matches `packages/pricing` `TariffConfig`):
```jsonc
{
  "model": "multiplier" | "person_band",
  "durationTiers": [ { "maxMin": 240, "hoursLabel": 4, "base": 100 }, ... ],
  "personTiers":  [ { "max": 30, "mult": 1.0 }, ... ],        // multiplier model
  "personBands":  [ { "max": 45, "addByTier": { "12": 0, "16": 0 } }, ... ], // band model
  "surcharge":    { "type": "window_or_weekend", "amount": 35,
                    "windowStart": "09:00", "windowEnd": "17:30" }
                  | { "type": "none" }
                  | { "type": "stacked", "rules": [...] },     // Excel-style, optional
  "extras":       [ { "id": "parcours", "price": 10, "labelDe": "...", "labelEn": "..." }, ... ],
  "bikePricePerUnit": 1,                                       // WE only, else absent
  "caution":      { "type": "we" | "wa" | "none" }
}
```
The exact seeded values are in `supabase/seed/seed.sql` and mirror
`packages/pricing/src/config.ts`.

### `customers`
`id`, `salutation`, `first_name`, `last_name`, `organization` (Einrichtung),
`email`, `phone`, `phone_country`, `street`, `house_number`, `zip`, `city`,
`address_full`, `lang` (default `de`), `notes`, timestamps. Dedupe on
`(lower(email), lower(last_name))` is a follow-up concern, not enforced yet.

### `customer_experiences`  (GDPR-sensitive — restricted RLS)
The current Excel `Erfahrungen` blacklist. Match criteria mirror the XLOOKUP keys:
`match_first_name`, `match_last_name`, `match_organization`, `match_address`,
`match_phone`, `match_email`, `alt_name`. Plus `rating experience_rating`,
`surcharge_or_discount numeric null`, `note`, `created_by`, timestamps. Optional
`customer_id` link. **Readable only by admin / location_manager / finance.**

### `bookings`  (holds included)
Core table. Columns:
- `id`, `location_id`, `customer_id`
- `tariff_type` (default `standard`)
- `starts_at timestamptz`, `ends_at timestamptz`
- `during tstzrange` **generated** = `tstzrange(starts_at, ends_at, '[)')`
- `persons int`, `event_type text` (Art)
- `extras jsonb` (selected extras), `bikes jsonb null` (WE bucket counts)
- `needs_id_upload bool` (whether an ID upload is required for this event)
- `price_total numeric null`, `price_breakdown jsonb null`, `caution numeric null`,
  `currency text default 'EUR'`
- `verwendungszweck text` (payment reference, generated)
- `lang text default 'de'`
- `status booking_status default 'requested'`, `source booking_source`
- `hold_expires_at timestamptz null`
- `message text`, `internal_notes text`, `has_overlap bool default false`
- `created_by uuid null`, timestamps

**Server-side overlap prevention** (the key improvement):
```sql
ALTER TABLE bookings ADD CONSTRAINT bookings_no_overlap
  EXCLUDE USING gist (location_id WITH =, during WITH &&)
  WHERE (status IN ('requested','approved','agreement_sent','signed','paid','confirmed'));
```
Two simultaneous requests for the same slot can no longer both succeed. Cancelled
/ rejected / expired / postponed bookings are excluded from the constraint so a
freed slot is immediately bookable.

### `booking_events`  (audit log / lifecycle)
Append-only. `id`, `booking_id`, `event_type text`, `from_status`, `to_status`,
`actor_id uuid null` (null = system), `payload jsonb`, `created_at`. This is the
"wie heeft die kautie op 0 gezet en wanneer" audit trail.

### `projects`
Frauenprojekt, Frauengefängnis Barnimstraße, and future projects — named once.
`id`, `code` (unique), `name`, `public_title`, `public_description`,
`public_link`, `color`, timestamps.

### `blocks`
Manual non-bookable periods (projects, maintenance, Radfahrausbildung).
`id`, `location_id`, `project_id null`, `starts_at`, `ends_at`, `during` (generated),
`title`, `kind block_kind`, `is_public bool` (show on public calendar),
`public_title null`, `public_link null`, `created_by`, timestamps.
Blocks are intentionally **not** part of the booking exclusion constraint (admin
may legitimately overlap them).

### `agreement_clauses`
The **editable** Nutzungsvereinbarung text, per location. This is the pricing
pattern applied to contracts: the wording (like the tariff *numbers*) lives in
the database and is editable by an admin/location_manager with no deploy; the
rendering logic (like the pricing *algorithm*) stays in code
(`packages/documents`). `id`, `location_id`, `clause_key` (stable id,
e.g. `nutzungszeit`), `sort_order`, `title_de`, `title_en`, `body_de`,
`body_en`, `updated_by`, timestamps. Unique `(location_id, clause_key)`.

`packages/documents/src/nv-clauses.generated.ts` — mechanically extracted from
the owner's Word templates — is only the **initial import source**, seeded once
via `supabase/seed/nv_clauses.sql` (every insert `ON CONFLICT DO NOTHING`, so
re-seeding never overwrites an edit made in `/admin/agreements`). A location
with zero rows simply has no agreement yet: Wiener Straße is phone-only today
and has none, and turning its Nutzungsvereinbarung on later is "an admin types
it into `/admin/agreements`" — no schema or code change.

### `documents`
`id`, `booking_id null`, `type document_type`, `status document_status`,
`storage_path text`, `jotform_submission_id text null` (migration bridge),
`signed_at`, `signer_name`, `signer_ip inet null`, `id_document_required bool`,
`id_document_path text null`, timestamps.

### `payments`
`id`, `booking_id null`, `sevdesk_id text null`, `amount numeric`,
`currency default 'EUR'`, `purpose text` (Verwendungszweck seen), `booked_at date`,
`matched bool`, `match_kind text`, `raw jsonb`, `created_at`.

### `tasks`
`id`, `booking_id null`, `location_id`, `type task_type`, `title`,
`assignee_id uuid null`, `due_at`, `status task_status`, `done_at`, `notes`,
timestamps. Replaces the caretaker email flow with real assignable tasks.

## Views (role-scoped) — see `supabase/migrations/0006_views.sql`

- `public_availability` — occupancy for the public calendar: `location_code`,
  `starts_at`, `ends_at`, `kind` (`busy` | `hold` | `frei` | `project`),
  `public_title`, `public_link`. **No personal data.** Replaces `events-*.json`.
- `bookings_staff` — bookings without personal / financial columns (for `staff`).
- `caretaker_tasks` — tasks joined with the minimal booking fields a caretaker
  needs (date, time, open/close, name, phone).
