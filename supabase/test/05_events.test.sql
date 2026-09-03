-- 05_events.test.sql
-- Assertion suite for 0012_events.sql: a public block's colour/description
-- fall back to its category (projects row) when the block doesn't set its own.

do $$
declare
  loc_id uuid;
  proj_id uuid;
  block_default_id uuid;
  block_override_id uuid;
begin
  select id into loc_id from locations where code = 'WE';

  insert into projects (code, name, color, public_description)
  values ('test_category', 'Test-Kategorie', '#112233', 'Kategorie-Beschreibung')
  returning id into proj_id;

  insert into blocks (location_id, project_id, starts_at, ends_at, is_public)
  values (
    loc_id, proj_id,
    (current_date + 300)::timestamp at time zone 'Europe/Berlin',
    (current_date + 300)::timestamp at time zone 'Europe/Berlin' + interval '2 hours',
    true
  )
  returning id into block_default_id;

  insert into blocks (location_id, project_id, starts_at, ends_at, is_public, color, public_description)
  values (
    loc_id, proj_id,
    (current_date + 301)::timestamp at time zone 'Europe/Berlin',
    (current_date + 301)::timestamp at time zone 'Europe/Berlin' + interval '2 hours',
    true, '#ff0000', 'Eigene Beschreibung'
  )
  returning id into block_override_id;

  perform assert_eq(
    (select color from public_availability where location_code = 'WE'
       and starts_at = (current_date + 300)::timestamp at time zone 'Europe/Berlin'),
    '#112233', 'a block with no color falls back to its category''s color');
  perform assert_eq(
    (select public_description from public_availability where location_code = 'WE'
       and starts_at = (current_date + 300)::timestamp at time zone 'Europe/Berlin'),
    'Kategorie-Beschreibung', 'a block with no description falls back to its category''s description');
  perform assert_eq(
    (select project_code from public_availability where location_code = 'WE'
       and starts_at = (current_date + 300)::timestamp at time zone 'Europe/Berlin'),
    'test_category', 'public_availability exposes the category code');

  perform assert_eq(
    (select color from public_availability where location_code = 'WE'
       and starts_at = (current_date + 301)::timestamp at time zone 'Europe/Berlin'),
    '#ff0000', 'a block''s own color overrides its category''s');
  perform assert_eq(
    (select public_description from public_availability where location_code = 'WE'
       and starts_at = (current_date + 301)::timestamp at time zone 'Europe/Berlin'),
    'Eigene Beschreibung', 'a block''s own description overrides its category''s');

  perform assert_eq(
    (select kind from public_availability where location_code = 'WE'
       and starts_at = (current_date + 300)::timestamp at time zone 'Europe/Berlin'),
    'project', 'a block linked to a project is kind=project');
end $$;

-- A non-public block never appears, category or not.
do $$
declare loc_id uuid; proj_id uuid;
begin
  select id into loc_id from locations where code = 'WI';
  select id into proj_id from projects where code = 'test_category';
  insert into blocks (location_id, project_id, starts_at, ends_at, is_public)
  values (
    loc_id, proj_id,
    (current_date + 302)::timestamp at time zone 'Europe/Berlin',
    (current_date + 302)::timestamp at time zone 'Europe/Berlin' + interval '2 hours',
    false
  );
  perform assert_eq(
    (select count(*)::int from public_availability where location_code = 'WI'
       and starts_at = (current_date + 302)::timestamp at time zone 'Europe/Berlin'),
    0, 'a non-public block is never exposed, even with a category');
end $$;

\echo '--- all events tests passed ---'
