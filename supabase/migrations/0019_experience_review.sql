-- 0019_experience_review.sql
-- Three things that turn the Sperrliste from a form somebody remembers to fill
-- in into part of the ordinary flow of a booking.
--
-- 1. A Vermerk can name OTHER names the same group books under. Regulars book
--    as a person one year and as their Verein the next, and the warning has to
--    follow the group rather than the spelling.
-- 2. A Vermerk knows which booking it came from, so "why is this flagged?" has
--    an answer beyond a free-text note.
-- 3. A finished booking schedules a task to assess it. Nobody was ever going to
--    remember to write up the ones that went badly, and the ones that went well
--    were never written up at all — which is why the list only ever collected
--    complaints.

-- 1. Other names --------------------------------------------------------------
--
-- `alt_name` (singular, text) has existed since 0003 and was never written or
-- read by anything — no UI, no matching. So it is widened rather than kept
-- beside a new column: one place where alternative names live.
alter table customer_experiences
  add column if not exists alt_names text[] not null default '{}';

-- Carry across anything that somehow got in, then retire the old column.
update customer_experiences
   set alt_names = array[alt_name]
 where alt_name is not null and alt_name <> '' and alt_names = '{}';

alter table customer_experiences drop column if exists alt_name;

comment on column customer_experiences.alt_names is
  'Other names the same group books under. Matched case-insensitively against a booking''s surname and organisation.';

-- 2. Where the Vermerk came from ----------------------------------------------
alter table customer_experiences
  add column if not exists booking_id uuid references bookings (id) on delete set null;

create index if not exists idx_experiences_booking on customer_experiences (booking_id);

comment on column customer_experiences.booking_id is
  'The booking this note was written about, when it was created from one. Null for a note typed in by hand.';

-- 3. Assessing a finished booking ---------------------------------------------

alter type task_type add value if not exists 'review_booking';

-- A new enum value cannot be USED in the transaction that added it, and the
-- Supabase SQL editor runs a pasted file as a single transaction. The plpgsql
-- body below is fine — it is parsed lazily, so 'review_booking' is not
-- resolved until the trigger first fires. An index predicate is not: it is
-- evaluated at creation, and casting around it (`type::text = ...`) fails a
-- second way, because that cast is not IMMUTABLE.
--
-- Hence no uniqueness index for the review task. It does not need one: the
-- trigger is `after update of status ... when (new.status is distinct from
-- old.status)`, so it fires on the transition INTO 'completed' and not on a
-- re-save of an already-completed booking. The `not exists` below covers the
-- one remaining path — completed → something → completed — which is not a
-- normal flow but should not produce a second task if it happens.

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

  if new.status = 'completed' then
    if coalesce(new.caution, 0) > 0 then
      insert into tasks (booking_id, location_id, type, title, due_at, notes)
      values (
        new.id, new.location_id, 'return_deposit',
        'Kaution zurückerstatten: ' || coalesce(new.event_type, 'Veranstaltung'),
        new.ends_at + interval '14 days',
        format('Kaution %s €', new.caution)
      );
    end if;

    -- Due the next day rather than immediately: whoever closed up should have
    -- gone home before being asked how it went.
    if not exists (
      select 1 from tasks
      where booking_id = new.id and type = 'review_booking'
    ) then
      insert into tasks (booking_id, location_id, type, title, due_at, notes)
      values (
        new.id, new.location_id, 'review_booking',
        'Beurteilen: ' || coalesce(new.event_type, 'Veranstaltung'),
        new.ends_at + interval '1 day',
        'Wie ist die Veranstaltung gelaufen? Bei Auffälligkeiten — im Guten wie im Schlechten — einen Kundenvermerk anlegen.'
      );
    end if;
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
