-- 0008_agreements.sql
-- Editable Nutzungsvereinbarung clause text, per location.
--
-- The clause WORDING lives here (in the database, editable by staff with the
-- right role), the same way tariffs.config holds the pricing NUMBERS while the
-- pricing ALGORITHM stays in code. packages/documents/src/nv-clauses.generated.ts
-- (mechanically extracted from the owner's Word templates — see that package's
-- README) is only the INITIAL import source, seeded once via
-- supabase/seed/nv_clauses.sql; after that, this table is authoritative and an
-- admin/location_manager edits it through /admin/agreements, no deploy needed.
--
-- Because clauses are keyed by location_id (not hardcoded to WE/WA in code), a
-- location with zero rows — e.g. Wiener Straße today — simply has no agreement
-- yet. Turning WI's Nutzungsvereinbarung on later is "an admin fills in the
-- clauses in the browser (or a WI Word file gets imported the same way WE/WA
-- were)", not a schema or code change.

create table agreement_clauses (
  id          uuid primary key default gen_random_uuid(),
  location_id uuid not null references locations (id) on delete cascade,
  -- Stable identifier for a clause independent of its title, e.g. "nutzungszeit".
  -- Clauses imported from Word keep the importer's id; clauses added by hand in
  -- the admin UI get a slug generated from their title.
  clause_key  text not null,
  sort_order  int  not null default 0,
  title_de    text not null default '',
  title_en    text not null default '',
  body_de     text not null default '',
  body_en     text not null default '',
  updated_by  uuid references profiles (id),
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now(),
  unique (location_id, clause_key)
);

create index idx_agreement_clauses_location on agreement_clauses (location_id, sort_order);

create trigger trg_agreement_clauses_updated before update on agreement_clauses
  for each row execute function set_updated_at();

-- Records who last touched a clause (null = system import, not a person).
create or replace function set_agreement_updated_by()
returns trigger language plpgsql as $$
begin
  new.updated_by = auth.uid();
  return new;
end $$;

create trigger trg_agreement_clauses_updated_by before update on agreement_clauses
  for each row execute function set_agreement_updated_by();

-- RLS --------------------------------------------------------------------
-- Contract text is not personal or financial data, so any signed-in staff
-- member may read it (useful to preview a document before it's their job to
-- edit it). Editing is scoped like bookings: admin everywhere,
-- location_manager only for their own location(s).
alter table agreement_clauses enable row level security;

create policy agreement_clauses_read on agreement_clauses for select
  using (auth.uid() is not null);

create policy agreement_clauses_write on agreement_clauses for all
  using (is_admin() or (auth_role() = 'location_manager' and has_location(location_id)))
  with check (is_admin() or (auth_role() = 'location_manager' and has_location(location_id)));

-- A real Supabase project auto-grants base table privileges to anon/
-- authenticated/service_role and relies on RLS alone to restrict rows (that is
-- what "Row Level Security" means there — the grant already exists). This local
-- test harness does not replicate that project-wide default, so the grant is
-- made explicit here for the one table a role-switch test
-- (02_agreements.test.sql) actually exercises as a non-superuser role.
grant select, insert, update, delete on agreement_clauses to authenticated;
