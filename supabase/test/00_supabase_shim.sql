-- 00_supabase_shim.sql
-- Minimal stand-in for the parts of Supabase that the migrations depend on, so
-- the schema can be applied and tested against a plain local Postgres. NOT for
-- production — the real Supabase project provides all of this natively.
--
-- Usage: see supabase/test/run-tests.sh

-- Roles Supabase provides out of the box.
do $$
begin
  if not exists (select 1 from pg_roles where rolname = 'anon') then
    create role anon nologin noinherit;
  end if;
  if not exists (select 1 from pg_roles where rolname = 'authenticated') then
    create role authenticated nologin noinherit;
  end if;
  if not exists (select 1 from pg_roles where rolname = 'service_role') then
    create role service_role nologin noinherit bypassrls;
  end if;
end $$;

-- auth schema + users table.
create schema if not exists auth;

create table if not exists auth.users (
  id    uuid primary key default gen_random_uuid(),
  email text
);

-- auth.uid() reads the request's JWT subject claim. Locally we emulate that with
-- a session setting: select set_config('request.jwt.claim.sub', '<uuid>', false);
create or replace function auth.uid()
returns uuid language sql stable as $$
  select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid;
$$;

grant usage on schema auth to anon, authenticated, service_role;
grant usage on schema public to anon, authenticated, service_role;
