-- 0006_views.sql
-- Role-scoped views provide COLUMN-level security (RLS only scopes rows).
--
-- Design note: a plain Postgres view runs with the view owner's rights
-- (security_invoker = false, the default), so it bypasses the base tables' RLS.
-- We rely on that here and re-impose row scoping *inside* each view via
-- has_location()/auth.uid(), which still evaluate for the CALLER (auth.uid()
-- reads the request JWT, independent of the view owner). This lets us expose a
-- curated, PII-free / location-scoped column set to roles that have no direct
-- policy on the base table. Staff, caretaker and anon are granted the views
-- only — never the base tables (RLS returns them zero rows there anyway).

-- Public availability --------------------------------------------------------
-- Replaces events-*.json. No personal data. Occupancy as opaque blocks.
create or replace view public_availability as
  select
    l.code                              as location_code,
    b.starts_at,
    b.ends_at,
    case when b.status = 'requested' then 'hold' else 'busy' end as kind,
    null::text                          as public_title,
    null::text                          as public_link
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
    coalesce(bl.public_link,  p.public_link)  as public_link
  from blocks bl
  join locations l on l.id = bl.location_id
  left join projects p on p.id = bl.project_id
  where bl.is_public = true;

grant select on public_availability to anon, authenticated;

-- Staff view of bookings -----------------------------------------------------
-- Calendar essentials only — no customer link, message, price, deposit or
-- payment reference. Row-scoped to the caller's locations.
create or replace view bookings_staff as
  select
    b.id,
    b.location_id,
    l.code as location_code,
    b.starts_at,
    b.ends_at,
    b.persons,
    b.event_type,
    b.status
  from bookings b
  join locations l on l.id = b.location_id
  where has_location(b.location_id);

grant select on bookings_staff to authenticated;

-- Caretaker (Hausmeister) task view ------------------------------------------
-- Only their own tasks, joined with the minimal booking fields they need:
-- date, time, open/close, name, phone. Nothing financial, no address.
create or replace view caretaker_tasks as
  select
    t.id            as task_id,
    t.type,
    t.title,
    t.due_at,
    t.status,
    t.notes,
    b.starts_at,
    b.ends_at,
    l.code          as location_code,
    c.first_name,
    c.last_name,
    c.phone
  from tasks t
  join locations l on l.id = t.location_id
  left join bookings b on b.id = t.booking_id
  left join customers c on c.id = b.customer_id
  where t.assignee_id = auth.uid();

grant select on caretaker_tasks to authenticated;
