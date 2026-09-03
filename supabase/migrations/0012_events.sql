-- 0012_events.sql
-- "Special events": admin-entered public blocks with a category (a `projects`
-- row — the table already modelled exactly this: name, color, a public link)
-- and, new here, a per-event color override and popup description, so an
-- event can either open a popup (public_description) or a URL
-- (public_link) when clicked, and needn't inherit its category's color.

alter table blocks   add column if not exists color text;
alter table blocks   add column if not exists public_description text;

alter table projects add column if not exists sort_order int not null default 0;

comment on column blocks.color is
  'Per-event colour override, "#rrggbb". Falls back to the linked project''s colour, then a default, when null.';
comment on column blocks.public_description is
  'Shown in the public widget''s popup when the block has no public_link (or as extra context alongside one). Falls back to the project''s own public_description when null.';

-- public_availability: adds color/description/project_code, appended at the
-- end so this remains a valid `create or replace` of the 0006 view (Postgres
-- allows adding trailing columns to a view in place, not reordering/removing
-- existing ones).
create or replace view public_availability as
  select
    l.code                              as location_code,
    b.starts_at,
    b.ends_at,
    case when b.status = 'requested' then 'hold' else 'busy' end as kind,
    null::text                          as public_title,
    null::text                          as public_link,
    null::text                          as color,
    null::text                          as public_description,
    null::text                          as project_code
  from bookings b
  join locations l on l.id = b.location_id
  where b.status in ('requested','approved','agreement_sent','signed','paid','confirmed')
  union all
  select
    l.code,
    bl.starts_at,
    bl.ends_at,
    case when bl.project_id is not null then 'project' else 'busy' end as kind,
    coalesce(bl.public_title, p.public_title) as public_title,
    coalesce(bl.public_link,  p.public_link)  as public_link,
    coalesce(bl.color, p.color)                          as color,
    coalesce(bl.public_description, p.public_description) as public_description,
    p.code                                                as project_code
  from blocks bl
  join locations l on l.id = bl.location_id
  left join projects p on p.id = bl.project_id
  where bl.is_public = true;

grant select on public_availability to anon, authenticated;
