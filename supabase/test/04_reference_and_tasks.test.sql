-- 04_reference_and_tasks.test.sql
-- Assertion suite for 0010_reference_and_tasks.sql: the Verwendungszweck
-- generator, and the caretaker/deposit-return tasks created on status change.
-- assert_eq/assert_raises come from 01_functions.test.sql, run earlier by
-- run-tests.sh in the same database/session.

-- ------------------------------------------------------- verwendungszweck format
-- setval(..., false) makes the NEXT nextval() return exactly this value, so the
-- sequence component is pinned and the test is deterministic.
select setval('booking_reference_seq', 41, false);
select assert_eq(generate_verwendungszweck('WE', 'Dolmetsch', 'Lukas'), 'FWE041DOLU', 'verwendungszweck: normal names');

select setval('booking_reference_seq', 7, false);
select assert_eq(generate_verwendungszweck('WA', 'Ö', 'A'), 'FWA007OXAX', 'verwendungszweck: short/accented names padded');

select setval('booking_reference_seq', 1000, false);
select assert_eq(generate_verwendungszweck('WI', 'Klein', 'Uwe'), 'FWI000KLUW', 'verwendungszweck: sequence wraps at 1000');

-- A booking created through the normal path gets one automatically.
do $$
declare b bookings%rowtype;
begin
  b := create_booking_request('WE',
    ((current_date + 200)::timestamp + time '10:00') at time zone 'Europe/Berlin',
    ((current_date + 200)::timestamp + time '14:00') at time zone 'Europe/Berlin',
    10, '{"first_name":"Petra","last_name":"Muster","email":"petra.muster@example.com"}'::jsonb,
    '{"total":100,"caution":null,"currency":"EUR","breakdown":{}}'::jsonb);
  perform assert_eq(b.verwendungszweck ~ '^FWE[0-9]{3}MUPE$', true, 'booking gets a generated verwendungszweck');
end $$;

-- ------------------------------------------------------------ caretaker tasks
-- No caretaker on file yet: confirming still creates the tasks, unassigned,
-- rather than silently scheduling nothing.
do $$
declare b bookings%rowtype;
begin
  b := create_booking_request('WE',
    ((current_date + 201)::timestamp + time '10:00') at time zone 'Europe/Berlin',
    ((current_date + 201)::timestamp + time '14:00') at time zone 'Europe/Berlin',
    10, '{"first_name":"Task","last_name":"Test","email":"task.test@example.com"}'::jsonb,
    '{"total":100,"caution":50,"currency":"EUR","breakdown":{}}'::jsonb);

  update bookings set status = 'confirmed' where id = b.id;
  perform assert_eq(
    (select count(*) from tasks where booking_id = b.id and type in ('open_venue','close_venue')),
    2::bigint, 'confirming creates one open_venue and one close_venue task');
  perform assert_eq(
    (select count(*) from tasks where booking_id = b.id and assignee_id is null),
    2::bigint, 'tasks are unassigned when no caretaker is on file for the location');
  perform assert_eq(
    (select due_at from tasks where booking_id = b.id and type = 'open_venue') = b.starts_at,
    true, 'open_venue task is due at the booking start');
  perform assert_eq(
    (select due_at from tasks where booking_id = b.id and type = 'close_venue') = b.ends_at,
    true, 'close_venue task is due at the booking end');

  -- Completing it, with a deposit held, schedules the return.
  update bookings set status = 'completed' where id = b.id;
  perform assert_eq(
    (select count(*) from tasks where booking_id = b.id and type = 'return_deposit'),
    1::bigint, 'completing with a deposit creates a return_deposit task');
  perform assert_eq(
    (select due_at from tasks where booking_id = b.id and type = 'return_deposit') = (b.ends_at + interval '14 days'),
    true, 'return_deposit task is due 14 days after the event');
end $$;

-- A caretaker on file for the location gets the tasks assigned directly.
do $$
declare
  b            bookings%rowtype;
  loc_id       uuid;
  caretaker_id uuid;
begin
  select id into loc_id from locations where code = 'WA';

  insert into auth.users (email) values ('caretaker.wa@example.com') returning id into caretaker_id;
  update profiles set role = 'hausmeister' where id = caretaker_id;
  insert into user_locations (user_id, location_id) values (caretaker_id, loc_id);

  b := create_booking_request('WA',
    ((current_date + 202)::timestamp + time '10:00') at time zone 'Europe/Berlin',
    ((current_date + 202)::timestamp + time '18:00') at time zone 'Europe/Berlin',
    10, '{"first_name":"Assigned","last_name":"Test","email":"assigned.test@example.com"}'::jsonb,
    '{"total":140,"caution":50,"currency":"EUR","breakdown":{}}'::jsonb);

  update bookings set status = 'confirmed' where id = b.id;
  perform assert_eq(
    (select count(*) from tasks where booking_id = b.id and assignee_id = caretaker_id),
    2::bigint, 'confirming assigns tasks to the location''s caretaker');
end $$;

-- No deposit held -> completing creates no return_deposit task.
do $$
declare b bookings%rowtype;
begin
  b := create_booking_request('WI',
    ((current_date + 203)::timestamp + time '10:00') at time zone 'Europe/Berlin',
    ((current_date + 203)::timestamp + time '14:00') at time zone 'Europe/Berlin',
    10, '{"first_name":"NoDeposit","last_name":"Test","email":"nodeposit.test@example.com"}'::jsonb,
    null, '[]'::jsonb, null, null, null, 'de', 'internal');

  update bookings set status = 'confirmed' where id = b.id;
  update bookings set status = 'completed' where id = b.id;
  perform assert_eq(
    (select count(*) from tasks where booking_id = b.id and type = 'return_deposit'),
    0::bigint, 'completing without a deposit creates no return_deposit task');
end $$;

\echo '--- all reference/task tests passed ---'
