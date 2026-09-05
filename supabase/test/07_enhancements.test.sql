-- 07_enhancements.test.sql
-- Assertions for 0014_enhancements.sql and 0015_reminders_ical_ratelimit.sql:
-- the staff double-booking override, the block conflict check, auto-complete,
-- the waitlist table, rate limiting, and reminder scheduling.

-- ------------------------------------------------------- double booking guard
-- The public form can never double-book, whatever it sends.
create or replace function assert_true(actual boolean, label text)
returns void language plpgsql as $$
begin
  if actual is distinct from true then
    raise exception 'FAIL % — expected true, got %', label, coalesce(actual::text, 'null');
  end if;
  raise notice 'ok  %', label;
end $$;

do $$
declare b bookings%rowtype;
begin
  b := create_booking_request('WA',
    ((current_date + 400)::timestamp + time '10:00') at time zone 'Europe/Berlin',
    ((current_date + 400)::timestamp + time '14:00') at time zone 'Europe/Berlin',
    10, '{"email":"overlap-a@example.com"}'::jsonb);
  perform assert_eq(b.allow_overlap, false, 'a normal booking does not allow overlap');
end $$;

select assert_raises($$
  select create_booking_request('WA',
    ((current_date + 400)::timestamp + time '11:00') at time zone 'Europe/Berlin',
    ((current_date + 400)::timestamp + time '13:00') at time zone 'Europe/Berlin',
    10, '{"email":"overlap-b@example.com"}'::jsonb)
$$, 'slot_taken', 'a second public request for the same slot is refused');

-- Even asking for the override explicitly does not help a public request:
-- p_allow_overlap is only honoured for p_source='internal', and the refusal is
-- its own code ('forbidden') rather than a generic slot_taken, so a public
-- caller reaching for a staff-only power is visible in the logs as exactly
-- that rather than looking like ordinary contention.
select assert_raises($$
  select create_booking_request('WA',
    ((current_date + 400)::timestamp + time '11:00') at time zone 'Europe/Berlin',
    ((current_date + 400)::timestamp + time '13:00') at time zone 'Europe/Berlin',
    10, '{"email":"overlap-c@example.com"}'::jsonb,
    null, '[]'::jsonb, null, null, null, 'de', 'public_form', 'standard', false, true)
$$, 'forbidden', 'the public form cannot double-book even by asking for the override');

-- Staff can, deliberately and explicitly.
do $$
declare b bookings%rowtype;
begin
  b := create_booking_request('WA',
    ((current_date + 400)::timestamp + time '11:00') at time zone 'Europe/Berlin',
    ((current_date + 400)::timestamp + time '13:00') at time zone 'Europe/Berlin',
    10, '{"email":"overlap-staff@example.com"}'::jsonb,
    null, '[]'::jsonb, null, null, null, 'de', 'internal', 'standard', false, true);
  perform assert_eq(b.allow_overlap, true, 'internal entry may double-book with the explicit flag');
  perform assert_eq(b.has_overlap, true, 'the double booking is marked as overlapping');
end $$;

-- ------------------------------------------------------------- blocks conflict
-- A slot covered by an internal closure is refused too, not just one covered
-- by another booking.
do $$
declare loc_id uuid;
begin
  select id into loc_id from locations where code = 'WI';
  insert into blocks (location_id, starts_at, ends_at, is_public, kind, title)
  values (loc_id,
    ((current_date + 401)::timestamp + time '09:00') at time zone 'Europe/Berlin',
    ((current_date + 401)::timestamp + time '18:00') at time zone 'Europe/Berlin',
    false, 'maintenance', 'Wartung');
end $$;

select assert_raises($$
  select create_booking_request('WI',
    ((current_date + 401)::timestamp + time '10:00') at time zone 'Europe/Berlin',
    ((current_date + 401)::timestamp + time '12:00') at time zone 'Europe/Berlin',
    10, '{"email":"blocked@example.com"}'::jsonb,
    null, '[]'::jsonb, null, null, null, 'de', 'internal')
$$, 'slot_taken', 'a slot covered by a block is refused');

-- ------------------------------------------------------------- auto-complete
do $$
declare b bookings%rowtype; n int;
begin
  b := create_booking_request('WE',
    ((current_date - 3)::timestamp + time '10:00') at time zone 'Europe/Berlin',
    ((current_date - 3)::timestamp + time '14:00') at time zone 'Europe/Berlin',
    10, '{"email":"past@example.com"}'::jsonb,
    '{"total":100,"caution":200,"currency":"EUR","breakdown":{}}'::jsonb,
    '[]'::jsonb, null, null, null, 'de', 'internal');
  update bookings set status = 'confirmed' where id = b.id;

  n := auto_complete_past_bookings();
  perform assert_eq(n >= 1, true, 'auto_complete_past_bookings reports what it completed');
  perform assert_eq((select status from bookings where id = b.id), 'completed'::booking_status,
                    'a confirmed booking whose event has passed is auto-completed');
  perform assert_eq(
    (select count(*)::int from tasks where booking_id = b.id and type = 'return_deposit'),
    1, 'auto-completing a booking with a deposit still schedules the deposit return');
end $$;

-- A future confirmed booking is left alone.
do $$
declare b bookings%rowtype;
begin
  b := create_booking_request('WE',
    ((current_date + 402)::timestamp + time '10:00') at time zone 'Europe/Berlin',
    ((current_date + 402)::timestamp + time '14:00') at time zone 'Europe/Berlin',
    10, '{"email":"future@example.com"}'::jsonb);
  update bookings set status = 'confirmed' where id = b.id;
  perform auto_complete_past_bookings();
  perform assert_eq((select status from bookings where id = b.id), 'confirmed'::booking_status,
                    'a future confirmed booking is not auto-completed');
end $$;

-- --------------------------------------------------- cancelling frees the tasks
do $$
declare b bookings%rowtype;
begin
  b := create_booking_request('WE',
    ((current_date + 403)::timestamp + time '10:00') at time zone 'Europe/Berlin',
    ((current_date + 403)::timestamp + time '14:00') at time zone 'Europe/Berlin',
    10, '{"email":"cancel-tasks@example.com"}'::jsonb);
  update bookings set status = 'confirmed' where id = b.id;
  perform assert_eq(
    (select count(*)::int from tasks where booking_id = b.id and status = 'open'), 2,
    'confirming schedules two open caretaker tasks');

  update bookings set status = 'cancelled' where id = b.id;
  perform assert_eq(
    (select count(*)::int from tasks where booking_id = b.id and status = 'open'), 0,
    'cancelling closes the caretaker tasks instead of leaving them due');
end $$;

-- ------------------------------------------------------------------ waitlist
do $$
declare loc_id uuid; staff_id uuid;
begin
  select id into loc_id from locations where code = 'WE';
  insert into waitlist_requests (location_id, starts_at, ends_at, customer_name, customer_email)
  values (loc_id,
    ((current_date + 404)::timestamp + time '10:00') at time zone 'Europe/Berlin',
    ((current_date + 404)::timestamp + time '14:00') at time zone 'Europe/Berlin',
    'Test Wartend', 'waitlist@example.com');

  perform assert_eq((select status from waitlist_requests where customer_email = 'waitlist@example.com'),
                    'waiting', 'a waitlist entry starts as waiting');

  -- Staff with no location assignment must not see other locations' entries.
  insert into auth.users (email) values ('wl-staff@example.com') returning id into staff_id;
  perform set_config('request.jwt.claim.sub', staff_id::text, false);
  set local role authenticated;
  perform assert_eq((select count(*)::int from waitlist_requests), 0,
                    'unassigned staff sees no waitlist entries at all');
  reset role;
end $$;

-- --------------------------------------------------------------- rate limiting
do $$
declare allowed boolean;
begin
  -- Third call with a limit of 2 must be refused, in the same window.
  perform check_rate_limit('test:bucket', 2, 3600);
  perform check_rate_limit('test:bucket', 2, 3600);
  allowed := check_rate_limit('test:bucket', 2, 3600);
  perform assert_eq(allowed, false, 'check_rate_limit refuses once over the limit');

  -- A different bucket has its own budget.
  allowed := check_rate_limit('test:other', 2, 3600);
  perform assert_eq(allowed, true, 'each bucket counts separately');
end $$;

-- ---------------------------------------------------------------- reminders
do $$
declare
  rule_id uuid;
  b bookings%rowtype;
  due_count int;
begin
  -- "One day after the event ends", for confirmed bookings.
  insert into reminder_rules (name, template_key, offset_days, anchor, statuses)
  values ('Test-Nachfassen', 'reminder_after_event', 1, 'event_end', '{confirmed}')
  returning id into rule_id;

  -- An event that ended two days ago: the send moment (end + 1 day) has passed
  -- and is still inside the default 48h grace window.
  b := create_booking_request('WA',
    ((current_date - 2)::timestamp + time '10:00') at time zone 'Europe/Berlin',
    ((current_date - 2)::timestamp + time '14:00') at time zone 'Europe/Berlin',
    10, '{"email":"reminder@example.com"}'::jsonb,
    null, '[]'::jsonb, null, null, null, 'de', 'internal');
  update bookings set status = 'confirmed' where id = b.id;

  select count(*)::int into due_count from due_reminders(rule_id) where id = b.id;
  perform assert_eq(due_count, 1, 'a booking past the rule offset is due for its reminder');

  -- Once recorded as sent it must never come up again.
  insert into reminder_sends (booking_id, rule_id) values (b.id, rule_id);
  select count(*)::int into due_count from due_reminders(rule_id) where id = b.id;
  perform assert_eq(due_count, 0, 'a reminder already sent is never due again');

  -- A rule that is switched off returns nothing at all.
  update reminder_rules set is_active = false where id = rule_id;
  select count(*)::int into due_count from due_reminders(rule_id);
  perform assert_eq(due_count, 0, 'an inactive rule is never due');
end $$;

-- A booking whose status is outside the rule's list is not picked up.
do $$
declare rule_id uuid; b bookings%rowtype; due_count int;
begin
  insert into reminder_rules (name, template_key, offset_days, anchor, statuses)
  values ('Test-Nur-Bezahlt', 'reminder_before_event', 1, 'event_end', '{paid}')
  returning id into rule_id;

  b := create_booking_request('WA',
    ((current_date - 2)::timestamp + time '16:00') at time zone 'Europe/Berlin',
    ((current_date - 2)::timestamp + time '18:00') at time zone 'Europe/Berlin',
    10, '{"email":"reminder-status@example.com"}'::jsonb,
    null, '[]'::jsonb, null, null, null, 'de', 'internal');
  update bookings set status = 'confirmed' where id = b.id;

  select count(*)::int into due_count from due_reminders(rule_id) where id = b.id;
  perform assert_eq(due_count, 0, 'a booking in a status the rule does not target is not due');
end $$;

-- --------------------------------------------------------------- iCal tokens
select assert_eq(
  (select count(*)::int from locations where ical_token is null), 0,
  'every location has an iCal token');
select assert_eq(
  (select count(distinct ical_token)::int from locations),
  (select count(*)::int from locations),
  'each location has its own iCal token, so one leak does not expose the rest');

\echo '--- all enhancement tests passed ---'

-- ---------------------------------------------------------------- waitlist offers
-- 0017: who gets told when a slot frees up, and the guard that stops the same
-- person being told about the same slot twice.

do $$
declare
  we_id uuid; w_overlap uuid; w_other uuid; w_wrong_loc uuid; wa_id uuid;
  n int;
begin
  select id into we_id from locations where code = 'WE';
  select id into wa_id from locations where code = 'WA';

  -- Freed slot: 2026-11-14 10:00–14:00 (Berlin).
  insert into waitlist_requests (location_id, starts_at, ends_at, customer_name, customer_email, status)
  values (we_id, timestamptz '2026-11-14 12:00+01', timestamptz '2026-11-14 16:00+01',
          'Overlaps', 'overlap@example.com', 'waiting')
  returning id into w_overlap;

  insert into waitlist_requests (location_id, starts_at, ends_at, customer_name, customer_email, status)
  values (we_id, timestamptz '2026-11-14 15:00+01', timestamptz '2026-11-14 18:00+01',
          'Later', 'later@example.com', 'waiting')
  returning id into w_other;

  insert into waitlist_requests (location_id, starts_at, ends_at, customer_name, customer_email, status)
  values (wa_id, timestamptz '2026-11-14 12:00+01', timestamptz '2026-11-14 16:00+01',
          'Other venue', 'wa@example.com', 'waiting')
  returning id into w_wrong_loc;

  select count(*)::int into n
  from waitlist_matches(we_id, timestamptz '2026-11-14 10:00+01', timestamptz '2026-11-14 14:00+01');
  perform assert_eq(n, 1, 'only the overlapping waiting entry at that location matches');

  perform assert_eq(
    (select id from waitlist_matches(we_id, timestamptz '2026-11-14 10:00+01', timestamptz '2026-11-14 14:00+01')),
    w_overlap, 'and it is the right one');

  -- A range that merely touches at the boundary is NOT an overlap: 14:00–18:00
  -- starting exactly when the freed slot ends is a different afternoon.
  select count(*)::int into n
  from waitlist_matches(we_id, timestamptz '2026-11-14 18:00+01', timestamptz '2026-11-14 20:00+01');
  perform assert_eq(n, 0, 'a range that starts after the last entry ends matches nobody');

  -- A notified entry drops out, so a later cancellation does not re-mail them.
  update waitlist_requests set status = 'notified' where id = w_overlap;
  select count(*)::int into n
  from waitlist_matches(we_id, timestamptz '2026-11-14 10:00+01', timestamptz '2026-11-14 14:00+01');
  perform assert_eq(n, 0, 'an entry that is no longer waiting is not offered again');
  update waitlist_requests set status = 'waiting' where id = w_overlap;
end $$;

do $$
declare
  we_id uuid; w uuid; failed boolean;
begin
  select id into we_id from locations where code = 'WE';
  insert into waitlist_requests (location_id, starts_at, ends_at, customer_name, customer_email, status)
  values (we_id, timestamptz '2026-12-05 10:00+01', timestamptz '2026-12-05 14:00+01',
          'Duplicate guard', 'dup@example.com', 'waiting')
  returning id into w;

  insert into waitlist_offers (waitlist_id, starts_at, ends_at)
  values (w, timestamptz '2026-12-05 10:00+01', timestamptz '2026-12-05 14:00+01');

  failed := false;
  begin
    insert into waitlist_offers (waitlist_id, starts_at, ends_at)
    values (w, timestamptz '2026-12-05 10:00+01', timestamptz '2026-12-05 14:00+01');
  exception when others then failed := true;
  end;
  perform assert_true(failed,
    'the same person cannot be told about the same slot twice — claim before send relies on this');

  -- A DIFFERENT slot for the same person is fine.
  insert into waitlist_offers (waitlist_id, starts_at, ends_at)
  values (w, timestamptz '2026-12-12 10:00+01', timestamptz '2026-12-12 14:00+01');
  perform assert_eq((select count(*)::int from waitlist_offers where waitlist_id = w), 2,
    'a second, different slot can still be offered to the same person');
end $$;

-- ---------------------------------------------------------------- occupancy
-- 0018: hours booked against the location's own bookable window.

do $$
declare
  we_id uuid; cust uuid; row_ record; expected numeric; admin_id uuid;
begin
  select id into we_id from locations where code = 'WE';

  -- occupancy_by_month() answers for the CALLER (has_permission +
  -- has_location), so the test needs an identity. As postgres, auth.uid() is
  -- null and the function correctly returns nothing at all.
  insert into auth.users (email) values ('occ-admin@example.com') returning id into admin_id;
  update profiles set role = 'admin' where id = admin_id;
  perform set_config('request.jwt.claim.sub', admin_id::text, false);

  insert into customers (first_name, last_name, email)
  values ('Occ', 'Test', 'occ@example.com') returning id into cust;

  -- 4 hours inside March 2029. A year no other test reaches: several
  -- fixtures here are built from current_date + N and would otherwise drift
  -- into the window as the calendar moves.
  insert into bookings (location_id, customer_id, starts_at, ends_at, persons, status, source)
  values (we_id, cust, timestamptz '2029-03-10 12:00+01', timestamptz '2029-03-10 16:00+01',
          20, 'confirmed', 'internal');

  -- A requested booking holds the slot but is not yet a sale — excluded.
  insert into bookings (location_id, customer_id, starts_at, ends_at, persons, status, source)
  values (we_id, cust, timestamptz '2029-03-11 12:00+01', timestamptz '2029-03-11 16:00+01',
          20, 'requested', 'internal');

  -- Spans the month boundary: 22:00 on 31 March to 02:00 on 1 April. Two hours
  -- belong to March, two to April.
  insert into bookings (location_id, customer_id, starts_at, ends_at, persons, status, source)
  values (we_id, cust, timestamptz '2029-03-31 22:00+02', timestamptz '2029-04-01 02:00+02',
          20, 'confirmed', 'internal');

  select * into row_ from occupancy_by_month(date '2029-03-01', date '2029-03-01')
  where location_code = 'WE';

  perform assert_eq(row_.booked_hours, 6.00::numeric,
    'confirmed hours are counted and clipped to the month; a requested hold is not a sale');

  select (grid_max_end_hour - grid_min_hour) * 31 into expected from locations where id = we_id;
  perform assert_eq(row_.available_hours, expected::numeric(10,2),
    'available hours are the location''s own bookable window times the days in March');

  perform assert_eq(row_.booked_pct, round(6.0 * 100 / expected, 1),
    'the percentage is booked over available');

  select * into row_ from occupancy_by_month(date '2029-04-01', date '2029-04-01')
  where location_code = 'WE';
  perform assert_eq(row_.booked_hours, 2.00::numeric,
    'the other side of the boundary lands in April, not counted twice');

  -- A block eats availability in practice but is reported separately, never
  -- folded into the denominator.
  insert into blocks (location_id, starts_at, ends_at, title, kind, is_public)
  values (we_id, timestamptz '2029-04-05 12:00+02', timestamptz '2029-04-05 17:00+02',
          'Wartung', 'other', false);

  select * into row_ from occupancy_by_month(date '2029-04-01', date '2029-04-01')
  where location_code = 'WE';
  perform assert_eq(row_.blocked_hours, 5.00::numeric, 'blocked hours are reported');
  select (grid_max_end_hour - grid_min_hour) * 30 into expected from locations where id = we_id;
  perform assert_eq(row_.available_hours, expected::numeric(10,2),
    'and are NOT subtracted from availability — a closure is not a full house');
end $$;

do $$
declare staff_id uuid; n int;
begin
  insert into auth.users (email) values ('occ-staff@example.com') returning id into staff_id;
  -- staff by default: no user_locations row, so no location is in scope.
  perform set_config('request.jwt.claim.sub', staff_id::text, false);
  set local role authenticated;
  select count(*)::int into n from occupancy_by_month(date '2029-03-01', date '2029-03-01');
  perform assert_eq(n, 0,
    'occupancy is scoped by has_location() — an unassigned account sees no venues');
  reset role;
end $$;
