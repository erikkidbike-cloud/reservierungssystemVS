-- 0005_rls.sql
-- Row-Level Security. See docs/03-roles-and-rls.md.
-- Column-level scoping is done with the role views in 0006; these policies do
-- row scoping. Helper functions are SECURITY DEFINER + STABLE and read from
-- profiles/user_locations without triggering recursive RLS.

-- Helpers --------------------------------------------------------------------
create or replace function auth_role()
returns app_role language sql stable security definer set search_path = public as $$
  select role from profiles where id = auth.uid();
$$;

create or replace function is_admin()
returns boolean language sql stable security definer set search_path = public as $$
  select coalesce(auth_role() = 'admin', false);
$$;

create or replace function has_location(loc uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select
    coalesce(auth_role() in ('admin','finance'), false)
    or exists (
      select 1 from user_locations ul
      where ul.user_id = auth.uid() and ul.location_id = loc
    );
$$;

-- Enable RLS -----------------------------------------------------------------
alter table profiles              enable row level security;
alter table locations             enable row level security;
alter table user_locations        enable row level security;
alter table tariffs               enable row level security;
alter table customers             enable row level security;
alter table customer_experiences  enable row level security;
alter table projects              enable row level security;
alter table bookings              enable row level security;
alter table booking_events        enable row level security;
alter table blocks                enable row level security;
alter table documents             enable row level security;
alter table payments              enable row level security;
alter table tasks                 enable row level security;

-- profiles -------------------------------------------------------------------
create policy profiles_self_read   on profiles for select using (id = auth.uid() or is_admin());
create policy profiles_self_update on profiles for update using (id = auth.uid() or is_admin());
create policy profiles_admin_write on profiles for all    using (is_admin()) with check (is_admin());

-- locations / tariffs / projects: readable by any authenticated user, written by admin
create policy locations_read  on locations for select using (auth.uid() is not null);
create policy locations_write on locations for all    using (is_admin()) with check (is_admin());

create policy tariffs_read  on tariffs for select using (auth.uid() is not null);
create policy tariffs_write on tariffs for all    using (is_admin()) with check (is_admin());

create policy projects_read  on projects for select using (auth.uid() is not null);
create policy projects_write on projects for all    using (is_admin()) with check (is_admin());

-- user_locations: admin manages; a user may read their own memberships
create policy user_locations_self  on user_locations for select using (user_id = auth.uid() or is_admin());
create policy user_locations_admin on user_locations for all    using (is_admin()) with check (is_admin());

-- customers: admin/finance all; location_manager sees customers referenced by a
-- booking in their location. Staff never query customers directly (they use the
-- bookings_staff view). Simplest safe rule: admin/finance/location_manager read.
create policy customers_read on customers for select using (
  auth_role() in ('admin','finance','location_manager')
);
create policy customers_write on customers for all using (
  auth_role() in ('admin','location_manager')
) with check (
  auth_role() in ('admin','location_manager')
);

-- customer_experiences: GDPR-sensitive — admin / location_manager / finance only
create policy experiences_read on customer_experiences for select using (
  auth_role() in ('admin','location_manager','finance')
);
create policy experiences_write on customer_experiences for all using (
  auth_role() in ('admin','location_manager')
) with check (
  auth_role() in ('admin','location_manager')
);

-- bookings: admin/finance all; location_manager full access in their locations.
-- Staff get NO direct policy here — they are granted SELECT on bookings_staff
-- only (0006). Public inserts go through request_booking() (SECURITY DEFINER),
-- so there is deliberately no anon INSERT policy.
create policy bookings_admin_finance on bookings for select using (
  auth_role() in ('admin','finance')
);
create policy bookings_manager_all on bookings for all using (
  auth_role() = 'location_manager' and has_location(location_id)
) with check (
  auth_role() = 'location_manager' and has_location(location_id)
);
create policy bookings_admin_write on bookings for all using (is_admin()) with check (is_admin());

-- booking_events: read by admin + location_manager (their locations); inserts
-- happen via SECURITY DEFINER RPCs / triggers.
create policy booking_events_read on booking_events for select using (
  is_admin()
  or exists (
    select 1 from bookings b
    where b.id = booking_events.booking_id
      and auth_role() = 'location_manager'
      and has_location(b.location_id)
  )
);

-- blocks: read by any authenticated; written by admin / location_manager in scope
create policy blocks_read  on blocks for select using (auth.uid() is not null);
create policy blocks_write on blocks for all using (
  is_admin() or (auth_role() = 'location_manager' and has_location(location_id))
) with check (
  is_admin() or (auth_role() = 'location_manager' and has_location(location_id))
);

-- documents: admin + location_manager (scoped to the booking's location)
create policy documents_access on documents for all using (
  is_admin()
  or exists (
    select 1 from bookings b
    where b.id = documents.booking_id
      and auth_role() = 'location_manager'
      and has_location(b.location_id)
  )
) with check (
  is_admin()
  or exists (
    select 1 from bookings b
    where b.id = documents.booking_id
      and auth_role() = 'location_manager'
      and has_location(b.location_id)
  )
);

-- payments: admin + finance only
create policy payments_access on payments for all using (
  auth_role() in ('admin','finance')
) with check (
  auth_role() in ('admin','finance')
);

-- tasks: admin/location_manager manage in scope; assignee reads & updates own.
create policy tasks_manage on tasks for all using (
  is_admin() or (auth_role() = 'location_manager' and has_location(location_id))
) with check (
  is_admin() or (auth_role() = 'location_manager' and has_location(location_id))
);
create policy tasks_assignee_read   on tasks for select using (assignee_id = auth.uid());
create policy tasks_assignee_update on tasks for update using (assignee_id = auth.uid())
  with check (assignee_id = auth.uid());
