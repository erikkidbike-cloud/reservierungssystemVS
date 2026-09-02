-- 0003_core_tables.sql
-- Core schema. See docs/02-data-model.md for rationale.
-- Constraints/indexes that need their own attention (the overlap exclusion) are
-- in 0004; RLS in 0005; views in 0006.

-- Reusable updated_at trigger ------------------------------------------------
create or replace function set_updated_at()
returns trigger language plpgsql as $$
begin
  new.updated_at = now();
  return new;
end $$;

-- profiles -------------------------------------------------------------------
-- Mirrors auth.users; holds the app role. One row per employee.
create table profiles (
  id         uuid primary key references auth.users (id) on delete cascade,
  email      text,
  full_name  text,
  role       app_role not null default 'staff',
  is_active  boolean  not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create trigger trg_profiles_updated before update on profiles
  for each row execute function set_updated_at();

-- locations ------------------------------------------------------------------
-- Every per-location constant that is hard-coded in the current front-end is a
-- column here (closing hour, hold days, lead time, grid hints, CC emails).
create table locations (
  id                  uuid primary key default gen_random_uuid(),
  code                text unique not null,          -- WE / WA / WI
  name                text not null,
  short_name          text,
  address             text,
  lat                 numeric(9,6),
  lng                 numeric(9,6),
  phone               text,
  online_bookability  online_bookability not null default 'online',
  closing_hour        int,                           -- WE = 22; null = none
  hold_business_days  int  not null default 3,       -- WE 3 / WA 2 / WI 3
  min_lead_days       int  not null default 7,
  min_duration_minutes int not null default 30,
  default_tap_minutes int  not null default 120,
  grid_min_hour       int  not null default 12,
  grid_max_end_hour   int  not null default 28,
  cc_emails           text[] not null default '{}',
  is_active           boolean not null default true,
  sort_order          int not null default 0,
  created_at          timestamptz not null default now(),
  updated_at          timestamptz not null default now(),
  constraint closing_hour_range check (closing_hour is null or (closing_hour between 1 and 28))
);
create trigger trg_locations_updated before update on locations
  for each row execute function set_updated_at();

-- user_locations -------------------------------------------------------------
-- Scopes location_manager / staff / hausmeister to specific locations.
-- admin & finance see all → no rows needed.
create table user_locations (
  user_id     uuid not null references profiles (id) on delete cascade,
  location_id uuid not null references locations (id) on delete cascade,
  primary key (user_id, location_id)
);

-- tariffs --------------------------------------------------------------------
-- The pricing NUMBERS (editable, versioned). The pricing ALGORITHM lives in
-- packages/pricing and takes `config` as input. Shape documented in
-- docs/02-data-model.md and mirrored by packages/pricing/src/config.ts.
create table tariffs (
  id          uuid primary key default gen_random_uuid(),
  location_id uuid not null references locations (id) on delete cascade,
  tariff_type tariff_type not null default 'standard',
  config      jsonb not null,
  valid_from  date not null default current_date,
  valid_to    date,
  is_active   boolean not null default true,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now(),
  unique (location_id, tariff_type, valid_from)
);
create trigger trg_tariffs_updated before update on tariffs
  for each row execute function set_updated_at();

-- customers ------------------------------------------------------------------
create table customers (
  id            uuid primary key default gen_random_uuid(),
  salutation    text,
  first_name    text,
  last_name     text,
  organization  text,
  email         text,
  phone         text,
  phone_country text,
  street        text,
  house_number  text,
  zip           text,
  city          text,
  address_full  text,
  lang          text not null default 'de',
  notes         text,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);
create trigger trg_customers_updated before update on customers
  for each row execute function set_updated_at();
create index idx_customers_email on customers (lower(email));
create index idx_customers_lastname on customers (lower(last_name));

-- customer_experiences (GDPR-sensitive) --------------------------------------
create table customer_experiences (
  id                   uuid primary key default gen_random_uuid(),
  customer_id          uuid references customers (id) on delete set null,
  match_first_name     text,
  match_last_name      text,
  match_organization   text,
  match_address        text,
  match_phone          text,
  match_email          text,
  alt_name             text,
  rating               experience_rating not null default 'neutral',
  surcharge_or_discount numeric(10,2),
  note                 text,
  created_by           uuid references profiles (id),
  created_at           timestamptz not null default now(),
  updated_at           timestamptz not null default now()
);
create trigger trg_experiences_updated before update on customer_experiences
  for each row execute function set_updated_at();

-- projects -------------------------------------------------------------------
-- Frauenprojekt, Frauengefängnis Barnimstraße, and future projects — named once.
create table projects (
  id                 uuid primary key default gen_random_uuid(),
  code               text unique not null,
  name               text not null,
  public_title       text,
  public_description text,
  public_link        text,
  color              text,
  created_at         timestamptz not null default now(),
  updated_at         timestamptz not null default now()
);
create trigger trg_projects_updated before update on projects
  for each row execute function set_updated_at();

-- bookings (holds included) --------------------------------------------------
create table bookings (
  id               uuid primary key default gen_random_uuid(),
  location_id      uuid not null references locations (id),
  customer_id      uuid references customers (id) on delete set null,
  tariff_type      tariff_type not null default 'standard',
  starts_at        timestamptz not null,
  ends_at          timestamptz not null,
  during           tstzrange generated always as (tstzrange(starts_at, ends_at, '[)')) stored,
  persons          int,
  event_type       text,
  extras           jsonb not null default '[]'::jsonb,
  bikes            jsonb,
  needs_id_upload  boolean not null default false,
  price_total      numeric(10,2),
  price_breakdown  jsonb,
  caution          numeric(10,2),
  currency         text not null default 'EUR',
  verwendungszweck text,
  lang             text not null default 'de',
  status           booking_status not null default 'requested',
  source           booking_source not null default 'public_form',
  hold_expires_at  timestamptz,
  message          text,
  internal_notes   text,
  has_overlap      boolean not null default false,
  created_by       uuid references profiles (id),
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now(),
  constraint bookings_time_order check (ends_at > starts_at)
);
create trigger trg_bookings_updated before update on bookings
  for each row execute function set_updated_at();

-- booking_events (append-only audit log) -------------------------------------
create table booking_events (
  id          uuid primary key default gen_random_uuid(),
  booking_id  uuid not null references bookings (id) on delete cascade,
  event_type  text not null,
  from_status booking_status,
  to_status   booking_status,
  actor_id    uuid references profiles (id),  -- null = system
  payload     jsonb not null default '{}'::jsonb,
  created_at  timestamptz not null default now()
);
create index idx_booking_events_booking on booking_events (booking_id, created_at);

-- blocks (manual non-bookable periods) ---------------------------------------
create table blocks (
  id           uuid primary key default gen_random_uuid(),
  location_id  uuid not null references locations (id) on delete cascade,
  project_id   uuid references projects (id) on delete set null,
  starts_at    timestamptz not null,
  ends_at      timestamptz not null,
  during       tstzrange generated always as (tstzrange(starts_at, ends_at, '[)')) stored,
  title        text,
  kind         block_kind not null default 'other',
  is_public    boolean not null default false,
  public_title text,
  public_link  text,
  created_by   uuid references profiles (id),
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now(),
  constraint blocks_time_order check (ends_at > starts_at)
);
create trigger trg_blocks_updated before update on blocks
  for each row execute function set_updated_at();

-- documents ------------------------------------------------------------------
create table documents (
  id                  uuid primary key default gen_random_uuid(),
  booking_id          uuid references bookings (id) on delete cascade,
  type                document_type not null,
  status              document_status not null default 'draft',
  storage_path        text,
  jotform_submission_id text,
  signed_at           timestamptz,
  signer_name         text,
  signer_ip           inet,
  id_document_required boolean not null default false,
  id_document_path    text,
  created_at          timestamptz not null default now(),
  updated_at          timestamptz not null default now()
);
create trigger trg_documents_updated before update on documents
  for each row execute function set_updated_at();

-- payments -------------------------------------------------------------------
create table payments (
  id          uuid primary key default gen_random_uuid(),
  booking_id  uuid references bookings (id) on delete set null,
  sevdesk_id  text,
  amount      numeric(10,2) not null,
  currency    text not null default 'EUR',
  purpose     text,
  booked_at   date,
  matched     boolean not null default false,
  match_kind  text,
  raw         jsonb,
  created_at  timestamptz not null default now()
);
create index idx_payments_booking on payments (booking_id);
create index idx_payments_purpose on payments (purpose);

-- tasks ----------------------------------------------------------------------
create table tasks (
  id          uuid primary key default gen_random_uuid(),
  booking_id  uuid references bookings (id) on delete cascade,
  location_id uuid not null references locations (id) on delete cascade,
  type        task_type not null default 'other',
  title       text,
  assignee_id uuid references profiles (id),
  due_at      timestamptz,
  status      task_status not null default 'open',
  done_at     timestamptz,
  notes       text,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);
create trigger trg_tasks_updated before update on tasks
  for each row execute function set_updated_at();
create index idx_tasks_assignee on tasks (assignee_id, status);
create index idx_tasks_location on tasks (location_id, status);
