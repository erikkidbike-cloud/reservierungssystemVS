-- 0016_roles_permissions.sql
-- Editable roles: an admin can create a role and tick exactly which
-- permissions it holds, instead of the five hard-coded enum values.
--
-- WHY THIS IS A REWRITE AND NOT AN ADDITION
-- -----------------------------------------
-- Until now `profiles.role` was the `app_role` enum and every policy asked
-- "which role is this?" (`auth_role() in ('admin','finance')`). Neither half
-- survives user-defined roles: a new role cannot be added to an enum from the
-- UI, and a policy naming roles by hand can never know about a role invented
-- afterwards. So the question every policy asks changes from
--
--     which role does this user have?      →   what may this user do?
--
-- and the role becomes nothing more than a named bundle of permissions.
--
-- That means `auth_role()` has to return text rather than the enum, and
-- Postgres will not change a function's return type in place. The only way is
-- `drop ... cascade`, which takes every policy that references it with it —
-- hence this migration re-creates the whole policy surface. That is not
-- collateral damage: those policies had to be rewritten in permission terms
-- anyway. The SQL suite (supabase/test) is what makes this safe to do in one
-- go; it re-checks every access rule afterwards.
--
-- SCOPING
-- -------
-- Two orthogonal questions, kept orthogonal:
--   * WHAT may you do          → permissions, per role.
--   * WHERE may you do it      → `roles.all_locations`, plus user_locations.
-- Modelling location scope per permission was considered and rejected: nobody
-- has asked for "may approve at WE but only read at WA", and it would double
-- the size of every policy for a case that does not exist.

-- 1. Catalogue ---------------------------------------------------------------

-- The permission catalogue is fixed by the code (a permission only means
-- something because some route or policy checks it), so it is seeded here and
-- has no write policy for anyone but the service role. What IS editable is
-- which permissions a role holds — that is role_permissions below.
create table if not exists permissions (
  key         text primary key,
  category    text not null,
  label_de    text not null,
  description text,
  sort        int  not null default 0
);

comment on table permissions is
  'Fixed catalogue of what the application can check for. Seeded by migration; not user-editable — roles are.';

create table if not exists roles (
  key           text primary key
                check (key ~ '^[a-z][a-z0-9_]{1,38}$'),
  label_de      text not null,
  description   text,
  -- true = this role sees every location without a user_locations row.
  -- Deliberately a property of the role, not of the user: it is the single
  -- thing has_location() needs to know and it belongs with the permissions.
  all_locations boolean not null default false,
  -- System roles may be renamed and re-permissioned but never deleted: they
  -- are what handle_new_user() and the seed data refer to by key.
  is_system     boolean not null default false,
  sort          int not null default 100,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);

create table if not exists role_permissions (
  role_key       text not null references roles(key) on update cascade on delete cascade,
  permission_key text not null references permissions(key) on update cascade on delete cascade,
  primary key (role_key, permission_key)
);

create index if not exists idx_role_permissions_role on role_permissions (role_key);

-- 2. Seed the catalogue ------------------------------------------------------

insert into permissions (key, category, label_de, description, sort) values
  ('system.admin',            'System',       'Vollzugriff (Administrator)',
   'Schließt jede andere Berechtigung ein. Nur für Administratoren.', 1),
  ('roles.manage',            'System',       'Rollen und Berechtigungen verwalten',
   'Rollen anlegen, umbenennen, Berechtigungen setzen.', 2),
  ('users.manage',            'System',       'Benutzer verwalten',
   'Rollen und Standorte zuweisen.', 3),
  ('locations.manage',        'System',       'Standorte verwalten', null, 4),

  ('bookings.read',           'Buchungen',    'Buchungen sehen',
   'Im zugewiesenen Standort (bzw. überall, wenn die Rolle alle Standorte umfasst).', 10),
  ('bookings.write',          'Buchungen',    'Buchungen anlegen und ändern', null, 11),
  ('bookings.approve',        'Buchungen',    'Buchungen bestätigen und ablehnen', null, 12),
  ('contact_data.read',       'Buchungen',    'Kontakt- und Preisdaten sehen',
   'Ohne diese Berechtigung sieht die Rolle nur Datum, Zeit, Personenzahl und Status.', 13),
  ('waitlist.manage',         'Buchungen',    'Warteliste verwalten', null, 14),

  ('customers.read',          'Kund*innen',   'Kund*innen sehen', null, 20),
  ('customers.write',         'Kund*innen',   'Kund*innen bearbeiten', null, 21),
  ('experiences.read',        'Kund*innen',   'Erfahrungsnotizen lesen',
   'Interne Notizen zu vergangenen Veranstaltungen.', 22),
  ('experiences.write',       'Kund*innen',   'Erfahrungsnotizen schreiben', null, 23),

  ('documents.access',        'Dokumente',    'Nutzungsvereinbarungen und Ausweise öffnen', null, 30),
  ('agreements.manage',       'Dokumente',    'Vertragstexte bearbeiten', null, 31),
  ('mail_templates.manage',   'Dokumente',    'E-Mail-Vorlagen und Erinnerungen verwalten', null, 32),

  ('payments.manage',         'Finanzen',     'Zahlungen verwalten', null, 40),
  ('tariffs.manage',          'Finanzen',     'Preise, Kautionen und Extras verwalten', null, 41),

  ('events.manage',           'Kalender',     'Sondertermine verwalten', null, 50),
  ('categories.manage',       'Kalender',     'Kategorien verwalten', null, 51),

  ('tasks.manage',            'Aufgaben',     'Alle Aufgaben sehen und zuweisen', null, 60),
  ('tasks.own',               'Aufgaben',     'Eigene Aufgaben sehen und abhaken', null, 61),
  ('tasks.caretaker',         'Aufgaben',     'Als Hausmeister*in eingeplant werden',
   'Wer diese Berechtigung hat, wird beim Bestätigen einer Buchung automatisch für Öffnen und Schließen eingeteilt.', 62)
on conflict (key) do update
  set category = excluded.category,
      label_de = excluded.label_de,
      description = excluded.description,
      sort = excluded.sort;

-- 3. Seed the five roles that exist today ------------------------------------
-- Same keys as the old enum values, so every existing profile row keeps working
-- once the column becomes text.

insert into roles (key, label_de, description, all_locations, is_system, sort) values
  ('admin',            'Administrator',  'Vollzugriff auf alle Standorte und Einstellungen.', true,  true, 10),
  ('location_manager', 'Standortleitung','Verwaltet Buchungen, Kund*innen und Termine der eigenen Standorte.', false, true, 20),
  ('finance',          'Finanzen',       'Sieht alle Standorte, verwaltet Zahlungen.', true,  true, 30),
  ('staff',            'Mitarbeiter*in', 'Sieht den Kalender der eigenen Standorte ohne Kontakt- und Preisdaten.', false, true, 40),
  ('hausmeister',      'Hausmeister*in', 'Sieht und erledigt die eigenen Öffnen-/Schließen-Aufgaben.', false, true, 50)
on conflict (key) do nothing;

insert into role_permissions (role_key, permission_key)
select 'admin', key from permissions
on conflict do nothing;

insert into role_permissions (role_key, permission_key) values
  ('location_manager', 'bookings.read'),
  ('location_manager', 'bookings.write'),
  ('location_manager', 'bookings.approve'),
  ('location_manager', 'contact_data.read'),
  ('location_manager', 'waitlist.manage'),
  ('location_manager', 'customers.read'),
  ('location_manager', 'customers.write'),
  ('location_manager', 'experiences.read'),
  ('location_manager', 'experiences.write'),
  ('location_manager', 'documents.access'),
  ('location_manager', 'agreements.manage'),
  ('location_manager', 'events.manage'),
  ('location_manager', 'tasks.manage'),
  ('location_manager', 'tasks.own'),

  ('finance', 'bookings.read'),
  ('finance', 'contact_data.read'),
  ('finance', 'customers.read'),
  ('finance', 'experiences.read'),
  ('finance', 'payments.manage'),
  ('finance', 'waitlist.manage'),

  ('staff', 'bookings.read'),
  ('staff', 'tasks.own'),

  ('hausmeister', 'bookings.read'),
  ('hausmeister', 'tasks.own'),
  ('hausmeister', 'tasks.caretaker')
on conflict do nothing;

-- 4. Tear down the enum-based primitives -------------------------------------
-- cascade removes every policy built on them; section 7 puts them all back in
-- permission terms.

drop function if exists auth_role() cascade;
drop function if exists is_admin() cascade;
drop function if exists has_location(uuid) cascade;

-- The views in 0006 use has_location() and were dropped by the cascade too;
-- they are recreated in section 8.

alter table profiles alter column role drop default;
alter table profiles alter column role type text using role::text;
alter table profiles alter column role set default 'staff';
alter table profiles add constraint profiles_role_fkey
  foreign key (role) references roles(key) on update cascade;

drop type if exists app_role;

-- 5. Primitives --------------------------------------------------------------

create or replace function auth_role()
returns text language sql stable security definer set search_path = public as $$
  select role from profiles where id = auth.uid() and is_active;
$$;

-- Split out from has_permission() so a query can ask about a role other than
-- the caller's own — the caretaker trigger does exactly that.
create or replace function role_has_permission(p_role text, p_perm text)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from role_permissions rp
    where rp.role_key = p_role
      -- system.admin is the one implication in the model: an administrator
      -- holds every permission without each one having to be ticked, so a
      -- permission added by a later migration is never accidentally missing
      -- from the role that is supposed to have everything.
      and rp.permission_key in (p_perm, 'system.admin')
  );
$$;

create or replace function has_permission(p_perm text)
returns boolean language sql stable security definer set search_path = public as $$
  select coalesce(role_has_permission(auth_role(), p_perm), false);
$$;

create or replace function is_admin()
returns boolean language sql stable security definer set search_path = public as $$
  select has_permission('system.admin');
$$;

create or replace function has_all_locations()
returns boolean language sql stable security definer set search_path = public as $$
  select coalesce((select r.all_locations from roles r where r.key = auth_role()), false);
$$;

-- Same contract as before: "may this user act at this location at all?".
-- What changed is only how "everywhere" is decided — a role property now,
-- rather than two hard-coded role names.
create or replace function has_location(loc uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select
    has_all_locations()
    or exists (
      select 1 from user_locations ul
      where ul.user_id = auth.uid() and ul.location_id = loc
    );
$$;

-- The pairing used by almost every policy below: hold the permission AND be
-- allowed at that location.
create or replace function can_at(p_perm text, loc uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select has_permission(p_perm) and has_location(loc);
$$;

-- 6. Guard rails -------------------------------------------------------------
-- An editable permission system can lock everyone out of it. Three rules stop
-- the plausible accidents; none of them can be worked around from the UI
-- because they are triggers, not application checks.

create or replace function protect_admin_role()
returns trigger language plpgsql set search_path = public as $$
begin
  if tg_op = 'DELETE' then
    if old.role_key = 'admin' and old.permission_key in ('system.admin', 'roles.manage') then
      raise exception 'admin_role_protected'
        using detail = 'the administrator role must keep system.admin and roles.manage';
    end if;
    return old;
  end if;
  return new;
end $$;

drop trigger if exists trg_protect_admin_role on role_permissions;
create trigger trg_protect_admin_role
  before delete on role_permissions
  for each row execute function protect_admin_role();

create or replace function protect_system_roles()
returns trigger language plpgsql set search_path = public as $$
begin
  if tg_op = 'DELETE' then
    if old.is_system then
      raise exception 'system_role_protected'
        using detail = format('the role %s is referenced by the application and cannot be deleted', old.key);
    end if;
    return old;
  end if;

  -- Renaming the KEY of a system role would silently break handle_new_user()
  -- and the seed. The label is free to change; the key is not.
  if tg_op = 'UPDATE' and old.is_system and new.key <> old.key then
    raise exception 'system_role_protected'
      using detail = 'the key of a system role cannot be changed (the label can)';
  end if;
  if tg_op = 'UPDATE' and old.is_system and new.is_system = false then
    raise exception 'system_role_protected'
      using detail = 'a system role cannot be turned into an ordinary one';
  end if;
  -- Admin without every location is an admin who cannot see the site they
  -- administer; the FK from profiles already stops deletion of a role in use.
  if tg_op = 'UPDATE' and old.key = 'admin' and new.all_locations = false then
    raise exception 'admin_role_protected'
      using detail = 'the administrator role must cover all locations';
  end if;

  new.updated_at := now();
  return new;
end $$;

drop trigger if exists trg_protect_system_roles on roles;
create trigger trg_protect_system_roles
  before update or delete on roles
  for each row execute function protect_system_roles();

-- The last administrator cannot be demoted. Without this, one careless edit on
-- the users screen leaves a system nobody can administer — and the fix would
-- need database access, which is exactly what this console exists to avoid.
create or replace function protect_last_admin()
returns trigger language plpgsql set search_path = public as $$
declare
  remaining int;
begin
  if tg_op = 'UPDATE' and old.role = 'admin'
     and (new.role <> 'admin' or new.is_active = false) then
    select count(*) into remaining
    from profiles p
    where p.role = 'admin' and p.is_active and p.id <> old.id;

    if remaining = 0 then
      raise exception 'last_admin_protected'
        using detail = 'at least one active administrator must remain';
    end if;
  end if;
  return new;
end $$;

drop trigger if exists trg_protect_last_admin on profiles;
create trigger trg_protect_last_admin
  before update on profiles
  for each row execute function protect_last_admin();

-- 7. Policies, in permission terms -------------------------------------------

alter table roles            enable row level security;
alter table permissions      enable row level security;
alter table role_permissions enable row level security;

-- The cascade in section 4 only removed the policies that actually referenced
-- the dropped helpers. The purely `auth.uid() is not null` ones survived, so
-- every policy this migration owns is dropped explicitly first — that also
-- makes the migration re-runnable, which matters when it is applied by hand in
-- the Supabase SQL editor.
drop policy if exists profiles_self_read          on profiles;
drop policy if exists profiles_self_update        on profiles;
drop policy if exists profiles_admin_write        on profiles;
drop policy if exists locations_read              on locations;
drop policy if exists locations_write             on locations;
drop policy if exists tariffs_read                on tariffs;
drop policy if exists tariffs_write               on tariffs;
drop policy if exists projects_read               on projects;
drop policy if exists projects_write              on projects;
drop policy if exists user_locations_self         on user_locations;
drop policy if exists user_locations_admin        on user_locations;
drop policy if exists customers_read              on customers;
drop policy if exists customers_write             on customers;
drop policy if exists experiences_read            on customer_experiences;
drop policy if exists experiences_write           on customer_experiences;
drop policy if exists bookings_read               on bookings;
drop policy if exists bookings_write              on bookings;
drop policy if exists bookings_admin_finance      on bookings;
drop policy if exists bookings_manager_all        on bookings;
drop policy if exists bookings_admin_write        on bookings;
drop policy if exists booking_events_read         on booking_events;
drop policy if exists blocks_read                 on blocks;
drop policy if exists blocks_write                on blocks;
drop policy if exists documents_access            on documents;
drop policy if exists payments_access             on payments;
drop policy if exists tasks_manage                on tasks;
drop policy if exists tasks_assignee_read         on tasks;
drop policy if exists tasks_assignee_update       on tasks;
drop policy if exists agreement_clauses_read      on agreement_clauses;
drop policy if exists agreement_clauses_write     on agreement_clauses;
drop policy if exists mail_templates_read         on mail_templates;
drop policy if exists mail_templates_write        on mail_templates;
drop policy if exists waitlist_read               on waitlist_requests;
drop policy if exists waitlist_write              on waitlist_requests;
drop policy if exists reminder_rules_read         on reminder_rules;
drop policy if exists reminder_rules_write        on reminder_rules;
drop policy if exists reminder_sends_read         on reminder_sends;
drop policy if exists roles_read                  on roles;
drop policy if exists roles_write                 on roles;
drop policy if exists permissions_read            on permissions;
drop policy if exists role_permissions_read       on role_permissions;
drop policy if exists role_permissions_write      on role_permissions;

-- Everyone signed in may READ the catalogue: the console needs it to render a
-- role name, and knowing that a permission exists grants nothing. Writing is
-- the admin-only part the owner asked for.
create policy roles_read  on roles for select using (auth.uid() is not null);
create policy roles_write on roles for all
  using (has_permission('roles.manage')) with check (has_permission('roles.manage'));

create policy permissions_read on permissions for select using (auth.uid() is not null);
-- No write policy: the catalogue is code, changed by migration only.

create policy role_permissions_read  on role_permissions for select using (auth.uid() is not null);
create policy role_permissions_write on role_permissions for all
  using (has_permission('roles.manage')) with check (has_permission('roles.manage'));

-- profiles
create policy profiles_self_read   on profiles for select
  using (id = auth.uid() or has_permission('users.manage'));
create policy profiles_self_update on profiles for update
  using (id = auth.uid() or has_permission('users.manage'));
create policy profiles_admin_write on profiles for all
  using (has_permission('users.manage')) with check (has_permission('users.manage'));

-- locations / tariffs / projects
create policy locations_read  on locations for select using (auth.uid() is not null);
create policy locations_write on locations for all
  using (has_permission('locations.manage')) with check (has_permission('locations.manage'));

create policy tariffs_read  on tariffs for select using (auth.uid() is not null);
create policy tariffs_write on tariffs for all
  using (has_permission('tariffs.manage')) with check (has_permission('tariffs.manage'));

create policy projects_read  on projects for select using (auth.uid() is not null);
create policy projects_write on projects for all
  using (has_permission('categories.manage')) with check (has_permission('categories.manage'));

create policy user_locations_self  on user_locations for select
  using (user_id = auth.uid() or has_permission('users.manage'));
create policy user_locations_admin on user_locations for all
  using (has_permission('users.manage')) with check (has_permission('users.manage'));

-- customers / experiences
create policy customers_read  on customers for select using (has_permission('customers.read'));
create policy customers_write on customers for all
  using (has_permission('customers.write')) with check (has_permission('customers.write'));

create policy experiences_read  on customer_experiences for select
  using (has_permission('experiences.read'));
create policy experiences_write on customer_experiences for all
  using (has_permission('experiences.write')) with check (has_permission('experiences.write'));

-- bookings
--
-- The base table carries the contact and financial columns, so reading it at
-- all requires contact_data.read; a role without it is granted the
-- bookings_staff view instead (0006 / section 8), which has no such columns.
-- That is the same two-tier arrangement as before, now expressed as a
-- permission rather than as a list of role names.
create policy bookings_read on bookings for select using (
  has_permission('contact_data.read') and has_location(location_id)
);
create policy bookings_write on bookings for all
  using (can_at('bookings.write', location_id))
  with check (can_at('bookings.write', location_id));

create policy booking_events_read on booking_events for select using (
  exists (
    select 1 from bookings b
    where b.id = booking_events.booking_id
      and can_at('bookings.read', b.location_id)
  )
);

-- blocks
create policy blocks_read  on blocks for select using (auth.uid() is not null);
create policy blocks_write on blocks for all
  using (can_at('events.manage', location_id))
  with check (can_at('events.manage', location_id));

-- documents
create policy documents_access on documents for all using (
  exists (
    select 1 from bookings b
    where b.id = documents.booking_id
      and can_at('documents.access', b.location_id)
  )
) with check (
  exists (
    select 1 from bookings b
    where b.id = documents.booking_id
      and can_at('documents.access', b.location_id)
  )
);

-- payments
create policy payments_access on payments for all
  using (has_permission('payments.manage')) with check (has_permission('payments.manage'));

-- tasks
create policy tasks_manage on tasks for all
  using (can_at('tasks.manage', location_id))
  with check (can_at('tasks.manage', location_id));
create policy tasks_assignee_read   on tasks for select
  using (assignee_id = auth.uid() and has_permission('tasks.own'));
create policy tasks_assignee_update on tasks for update
  using (assignee_id = auth.uid() and has_permission('tasks.own'))
  with check (assignee_id = auth.uid() and has_permission('tasks.own'));

-- agreement_clauses (0008)
create policy agreement_clauses_read on agreement_clauses for select
  using (auth.uid() is not null);
create policy agreement_clauses_write on agreement_clauses for all
  using (can_at('agreements.manage', location_id))
  with check (can_at('agreements.manage', location_id));

-- mail_templates (0013)
create policy mail_templates_read  on mail_templates for select using (auth.uid() is not null);
create policy mail_templates_write on mail_templates for all
  using (has_permission('mail_templates.manage'))
  with check (has_permission('mail_templates.manage'));

-- waitlist (0014)
create policy waitlist_read on waitlist_requests for select
  using (can_at('bookings.read', location_id));
create policy waitlist_write on waitlist_requests for all
  using (can_at('waitlist.manage', location_id))
  with check (can_at('waitlist.manage', location_id));

-- reminders (0015)
create policy reminder_rules_read  on reminder_rules for select using (auth.uid() is not null);
create policy reminder_rules_write on reminder_rules for all
  using (has_permission('mail_templates.manage'))
  with check (has_permission('mail_templates.manage'));
create policy reminder_sends_read on reminder_sends for select using (auth.uid() is not null);

-- 8. Views the cascade took with it ------------------------------------------
-- Identical to 0006 except that has_location() now answers in permission
-- terms. Repeated here rather than edited in place in 0006, so that a fresh
-- database and an upgraded one end up with byte-identical definitions.

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

-- 9. Caretaker assignment by permission --------------------------------------
-- Previously `p.role = 'hausmeister'`, which a role named anything else could
-- never satisfy — the exact thing user-defined roles are supposed to fix.

create or replace function create_lifecycle_tasks()
returns trigger language plpgsql security definer set search_path = public as $$
declare
  caretaker_id uuid;
begin
  if new.status = 'confirmed' then
    select p.id into caretaker_id
    from profiles p
    join user_locations ul on ul.user_id = p.id
    where ul.location_id = new.location_id
      and p.is_active
      and role_has_permission(p.role, 'tasks.caretaker')
    limit 1;

    insert into tasks (booking_id, location_id, type, title, assignee_id, due_at)
    values (new.id, new.location_id, 'open_venue',
            'Öffnen: ' || coalesce(new.event_type, 'Veranstaltung'), caretaker_id, new.starts_at);
    insert into tasks (booking_id, location_id, type, title, assignee_id, due_at)
    values (new.id, new.location_id, 'close_venue',
            'Schließen: ' || coalesce(new.event_type, 'Veranstaltung'), caretaker_id, new.ends_at);
  end if;

  if new.status = 'completed' and coalesce(new.caution, 0) > 0 then
    insert into tasks (booking_id, location_id, type, title, due_at, notes)
    values (
      new.id, new.location_id, 'return_deposit',
      'Kaution zurückerstatten: ' || coalesce(new.event_type, 'Veranstaltung'),
      new.ends_at + interval '14 days',
      format('Kaution %s €', new.caution)
    );
  end if;

  if new.status in ('cancelled', 'postponed', 'rejected') then
    update tasks
       set status = 'cancelled',
           updated_at = now()
     where booking_id = new.id
       and status = 'open';
  end if;

  return new;
end $$;

-- 10. Grants -----------------------------------------------------------------

grant select on permissions to authenticated;
grant select, insert, update, delete on roles, role_permissions to authenticated;
grant all on permissions, roles, role_permissions to service_role;

-- The helpers are called from inside policies, so authenticated must be able
-- to execute them. They are SECURITY DEFINER but read-only and take no
-- caller-supplied identity — has_permission() always answers about auth.uid().
grant execute on function auth_role(), is_admin(), has_location(uuid),
  has_permission(text), role_has_permission(text, text), has_all_locations(),
  can_at(text, uuid) to authenticated, service_role;
