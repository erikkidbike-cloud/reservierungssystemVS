-- 08_roles.test.sql
-- User-definable roles and their permissions (0016_roles_permissions.sql).
--
-- Two things need proving, and they pull in opposite directions:
--   1. a role invented in the UI genuinely works — the policies honour it
--      without anyone editing SQL; and
--   2. it cannot be used to escalate, and the guard rails cannot be edited
--      away from the same screen that grants permissions.

\set ON_ERROR_STOP on

-- assert_eq comes from 01_functions.test.sql (same database, earlier file).
-- Most assertions here are about a yes/no answer from a helper, which reads
-- better as its own assertion than as `= true`.
create or replace function assert_true(actual boolean, label text)
returns void language plpgsql as $$
begin
  if actual is distinct from true then
    raise exception 'FAIL % — expected true, got %', label, coalesce(actual::text, 'null');
  end if;
  raise notice 'ok  %', label;
end $$;

-- Catalogue ------------------------------------------------------------------

select assert_eq(
  (select count(*)::int from roles where is_system), 5,
  'the five roles that existed as enum values survived as system roles');

select assert_eq(
  (select count(*)::int from profiles p left join roles r on r.key = p.role where r.key is null),
  0, 'every profile points at a real role (the FK holds)');

-- admin holds literally every permission, so a permission added by a later
-- migration is never silently missing from the role meant to have everything.
select assert_eq(
  (select count(*)::int from permissions)
    - (select count(*)::int from role_permissions where role_key = 'admin'),
  0, 'the admin role holds every catalogued permission');

select assert_true(
  role_has_permission('admin', 'payments.manage'),
  'admin holds a permission directly');
select assert_true(
  role_has_permission('staff', 'bookings.read'),
  'staff can read bookings (through the column-restricted view)');
select assert_true(
  not role_has_permission('staff', 'contact_data.read'),
  'staff must NOT hold contact_data.read — that is what keeps them on the view');
select assert_true(
  not role_has_permission('hausmeister', 'bookings.read') = false,
  'hausmeister can see the calendar');
select assert_true(
  not role_has_permission('finance', 'bookings.write'),
  'finance is read-only on bookings');

-- system.admin implies everything, including permissions it was never
-- explicitly given.
do $$
begin
  insert into roles (key, label_de, all_locations) values ('tmp_super', 'Test-Super', true);
  insert into role_permissions (role_key, permission_key) values ('tmp_super', 'system.admin');
  perform assert_true(
    role_has_permission('tmp_super', 'payments.manage'),
    'system.admin implies every other permission without ticking them');
  delete from roles where key = 'tmp_super';
end $$;

-- A custom role actually works ------------------------------------------------
-- The whole point of the feature: a role that does not exist in any migration,
-- created the way the UI creates one, must be honoured by RLS.

do $$
declare
  kassenwart uuid;
  we_id uuid;
begin
  select id into we_id from locations where code = 'WE';

  -- "Kassenwart": may see money everywhere, may not touch bookings.
  insert into roles (key, label_de, description, all_locations)
  values ('kassenwart', 'Kassenwart*in', 'Nur Zahlungen, alle Standorte.', true);
  insert into role_permissions (role_key, permission_key) values
    ('kassenwart', 'payments.manage'),
    ('kassenwart', 'bookings.read'),
    ('kassenwart', 'contact_data.read');

  insert into auth.users (email) values ('kassenwart@example.com') returning id into kassenwart;
  update profiles set role = 'kassenwart' where id = kassenwart;

  perform set_config('request.jwt.claim.sub', kassenwart::text, false);
  set local role authenticated;

  perform assert_true(has_permission('payments.manage'),
    'a role invented at runtime carries its permissions');
  perform assert_true(has_all_locations(),
    'all_locations is a property of the role, so has_location() answers yes everywhere');
  perform assert_true(has_location(we_id),
    'and that holds for a concrete location with no user_locations row');
  perform assert_true(not has_permission('tariffs.manage'),
    'a permission that was not granted stays denied');
  perform assert_true(not is_admin(),
    'a custom role is not an administrator just because it can see everything');

  -- The policies, not just the helpers.
  insert into payments (booking_id, amount, purpose)
  select id, 10, 'VS-TEST-KASSE' from bookings limit 1;
  perform assert_true(
    (select count(*) from payments) > 0,
    'the payments policy accepts a custom role holding payments.manage');

  reset role;
end $$;

-- Location scoping ------------------------------------------------------------

do $$
declare
  scoped uuid;
  we_id uuid;
  wa_id uuid;
begin
  select id into we_id from locations where code = 'WE';
  select id into wa_id from locations where code = 'WA';

  insert into roles (key, label_de, all_locations)
  values ('kiezleitung', 'Kiezleitung', false);
  insert into role_permissions (role_key, permission_key) values
    ('kiezleitung', 'bookings.read'),
    ('kiezleitung', 'bookings.write'),
    ('kiezleitung', 'contact_data.read');

  insert into auth.users (email) values ('kiez@example.com') returning id into scoped;
  update profiles set role = 'kiezleitung' where id = scoped;
  insert into user_locations (user_id, location_id) values (scoped, we_id);

  perform set_config('request.jwt.claim.sub', scoped::text, false);
  set local role authenticated;

  perform assert_true(has_location(we_id),  'a scoped role reaches its assigned location');
  perform assert_true(not has_location(wa_id), 'and no further');
  perform assert_true(can_at('bookings.write', we_id),
    'can_at() is the pair: permission AND location');
  perform assert_true(not can_at('bookings.write', wa_id),
    'holding the permission is not enough outside the assigned location');

  reset role;
end $$;

-- Escalation ------------------------------------------------------------------

do $$
declare staff_id uuid; refused boolean;
begin
  insert into auth.users (email) values ('role-staff@example.com') returning id into staff_id;
  -- staff by default (handle_new_user)

  perform set_config('request.jwt.claim.sub', staff_id::text, false);
  set local role authenticated;

  perform assert_true(
    (select count(*) from roles) > 0,
    'any signed-in user may READ the role catalogue — the console renders role names');

  -- The attack this is really about: grant yourself system.admin. RLS rejects
  -- an INSERT outright (with-check violation) rather than dropping it
  -- silently the way it filters a SELECT — so the assertion is that it raises.
  refused := false;
  begin
    insert into role_permissions (role_key, permission_key) values ('staff', 'system.admin');
  exception when others then refused := true;
  end;
  perform assert_true(refused,
    'a user without roles.manage cannot grant permissions — RLS refuses the insert');

  refused := false;
  begin
    insert into roles (key, label_de, all_locations) values ('backdoor', 'Backdoor', true);
  exception when others then refused := true;
  end;
  perform assert_true(refused, 'nor invent a role for themselves');

  reset role;

  perform assert_true(
    not role_has_permission('staff', 'system.admin'),
    'and nothing was written either way');
  perform assert_eq(
    (select count(*)::int from roles where key = 'backdoor'), 0,
    'no backdoor role exists');
end $$;

-- Guard rails -----------------------------------------------------------------
-- These are triggers rather than application checks precisely because the
-- screen that edits permissions is the screen that could remove its own.

do $$
declare failed boolean;
begin
  failed := false;
  begin
    delete from role_permissions where role_key = 'admin' and permission_key = 'system.admin';
  exception when others then failed := true;
  end;
  perform assert_true(failed, 'system.admin cannot be taken away from the admin role');

  failed := false;
  begin
    delete from role_permissions where role_key = 'admin' and permission_key = 'roles.manage';
  exception when others then failed := true;
  end;
  perform assert_true(failed, 'nor roles.manage — that is the way back in');

  failed := false;
  begin
    delete from roles where key = 'staff';
  exception when others then failed := true;
  end;
  perform assert_true(failed, 'a system role cannot be deleted');

  failed := false;
  begin
    update roles set key = 'administrator' where key = 'admin';
  exception when others then failed := true;
  end;
  perform assert_true(failed, 'the KEY of a system role is fixed (handle_new_user refers to it)');

  -- but the label is not
  update roles set label_de = 'Verwaltung' where key = 'admin';
  perform assert_eq((select label_de from roles where key = 'admin'), 'Verwaltung',
    'the LABEL of a system role can be changed freely');
  update roles set label_de = 'Administrator' where key = 'admin';

  failed := false;
  begin
    update roles set all_locations = false where key = 'admin';
  exception when others then failed := true;
  end;
  perform assert_true(failed, 'an administrator who cannot see every location is not one');
end $$;

-- A non-system role behaves the opposite way in every respect.
do $$
declare failed boolean;
begin
  insert into roles (key, label_de) values ('tmp_deletable', 'Weg damit');
  delete from roles where key = 'tmp_deletable';
  perform assert_eq((select count(*)::int from roles where key = 'tmp_deletable'), 0,
    'a role nobody holds can be deleted');

  insert into roles (key, label_de) values ('tmp_inuse', 'In Gebrauch');
  failed := false;
  begin
    -- borrow an existing profile
    update profiles set role = 'tmp_inuse'
      where id = (select id from profiles where role = 'staff' limit 1);
    delete from roles where key = 'tmp_inuse';
  exception when others then failed := true;
  end;
  perform assert_true(failed,
    'a role still assigned to someone cannot be deleted — the FK refuses');
end $$;

-- The last administrator ------------------------------------------------------

do $$
declare
  a1 uuid; a2 uuid; failed boolean;
begin
  -- Reduce to a known state: exactly the two admins this test creates.
  -- Order matters — promote the new pair FIRST, so demoting the admins other
  -- test files left behind never touches the last one (which the trigger under
  -- test would rightly refuse).
  insert into auth.users (email) values ('last-admin-1@example.com') returning id into a1;
  insert into auth.users (email) values ('last-admin-2@example.com') returning id into a2;
  update profiles set role = 'admin' where id in (a1, a2);
  update profiles set role = 'staff' where role = 'admin' and id not in (a1, a2);

  -- Two admins: demoting one is fine.
  update profiles set role = 'staff' where id = a2;
  perform assert_eq((select role from profiles where id = a2), 'staff',
    'an administrator can be demoted while another one remains');

  failed := false;
  begin
    update profiles set role = 'staff' where id = a1;
  exception when others then failed := true;
  end;
  perform assert_true(failed, 'the last administrator cannot be demoted');

  failed := false;
  begin
    update profiles set is_active = false where id = a1;
  exception when others then failed := true;
  end;
  perform assert_true(failed,
    'nor deactivated — that is the same lock-out by another route');
end $$;

-- Caretaker assignment follows the permission, not the role name --------------
-- The old trigger matched `p.role = 'hausmeister'` literally, which no
-- user-defined role could ever satisfy.

do $$
declare
  we_id uuid; cust uuid; who uuid; booking uuid; assigned uuid;
begin
  select id into we_id from locations where code = 'WE';

  insert into roles (key, label_de) values ('platzwart', 'Platzwart*in');
  insert into role_permissions (role_key, permission_key) values
    ('platzwart', 'tasks.own'),
    ('platzwart', 'tasks.caretaker');

  insert into auth.users (email) values ('platzwart@example.com') returning id into who;
  update profiles set role = 'platzwart' where id = who;
  insert into user_locations (user_id, location_id) values (who, we_id);

  insert into customers (first_name, last_name, email)
  values ('Test', 'Platzwart', 'pw@example.com') returning id into cust;

  -- A FIXED far-future date, not now()-relative. An earlier version used
  -- now() + 30 days, which collides with the WE fixture at current_date + 30
  -- in 01_functions.test.sql — but only when the suite runs at certain times
  -- of day, since now() carries a clock and current_date does not. A test that
  -- passes in the afternoon and fails in the morning is worse than no test.
  --
  -- The trigger is `after update of status`, so the booking has to arrive in
  -- 'confirmed' rather than start there.
  insert into bookings (location_id, customer_id, starts_at, ends_at, persons, status, source)
  values (we_id, cust,
          timestamptz '2029-05-15 10:00+02', timestamptz '2029-05-15 13:00+02',
          20, 'approved', 'internal')
  returning id into booking;
  update bookings set status = 'confirmed' where id = booking;

  select assignee_id into assigned
  from tasks where booking_id = booking and type = 'open_venue';

  perform assert_eq(assigned, who,
    'a role named anything at all gets the caretaker tasks, as long as it holds tasks.caretaker');
end $$;

\echo '--- all role and permission tests passed ---'
