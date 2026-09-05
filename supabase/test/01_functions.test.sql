-- 01_functions.test.sql
-- Assertion suite for 0007_functions.sql. Every check RAISEs on failure, so the
-- script exits non-zero under `psql -v ON_ERROR_STOP=1`. Run via run-tests.sh.

\set ON_ERROR_STOP on
set timezone = 'UTC';   -- prove the wall-clock rules do not depend on the session zone

create or replace function assert_eq(actual anyelement, expected anyelement, label text)
returns void language plpgsql as $$
begin
  if actual is distinct from expected then
    raise exception 'FAIL % — expected %, got %', label, expected, actual;
  end if;
  raise notice 'ok  %', label;
end $$;

-- Raises only if the given statement does NOT fail with the expected message.
create or replace function assert_raises(stmt text, expected_msg text, label text)
returns void language plpgsql as $$
begin
  begin
    execute stmt;
  exception when others then
    if sqlerrm = expected_msg then
      raise notice 'ok  % (raised %)', label, expected_msg;
      return;
    end if;
    raise exception 'FAIL % — expected error %, got %', label, expected_msg, sqlerrm;
  end;
  raise exception 'FAIL % — expected error %, but statement succeeded', label, expected_msg;
end $$;

-- ---------------------------------------------------------------- business days
select assert_eq(add_business_days(date '2026-01-05', 3), date '2026-01-08', 'Mon +3 business days = Thu');
-- Thu +3 must skip the weekend and land on Tue
select assert_eq(add_business_days(date '2026-01-01', 3), date '2026-01-06', 'Thu +3 skips weekend = Tue');
select assert_eq(add_business_days(date '2026-01-02', 2), date '2026-01-06', 'Fri +2 skips weekend = Tue');
select assert_eq(add_business_days(date '2026-01-05', 0), date '2026-01-05', '+0 returns same day');

-- ------------------------------------------------------------- closing rule
-- 10:00-14:00 Berlin on a normal day is fine for a 22:00 closing hour.
select assert_eq(violates_closing(22, '2026-03-10 10:00+01', '2026-03-10 14:00+01'), false, 'daytime ok');
select assert_eq(violates_closing(22, '2026-03-10 20:00+01', '2026-03-10 23:00+01'), true,  'end after 22:00 blocked');
select assert_eq(violates_closing(22, '2026-03-10 22:00+01', '2026-03-10 23:00+01'), true,  'start at 22:00 blocked');
select assert_eq(violates_closing(22, '2026-03-10 05:00+01', '2026-03-10 09:00+01'), true,  'start before 06:00 blocked');
select assert_eq(violates_closing(22, '2026-03-10 20:00+01', '2026-03-11 01:00+01'), true,  'crosses midnight blocked');
select assert_eq(violates_closing(null, '2026-03-10 20:00+01', '2026-03-11 01:00+01'), false, 'no closing hour = never blocked');

-- ------------------------------------------------------- create_booking_request
-- A valid public request far enough ahead.
do $$
declare b bookings%rowtype;
begin
  b := create_booking_request(
    'WE',
    ((current_date + 30)::timestamp + time '10:00') at time zone 'Europe/Berlin',
    ((current_date + 30)::timestamp + time '14:00') at time zone 'Europe/Berlin',
    20,
    '{"first_name":"Anna","last_name":"Beispiel","email":"anna@example.com","street":"Weinstr","house_number":"2","zip":"10249","city":"Berlin"}'::jsonb,
    '{"total":100,"caution":null,"currency":"EUR","breakdown":{"base":100}}'::jsonb
  );
  perform assert_eq(b.status, 'requested'::booking_status, 'request created as hold');
  perform assert_eq(b.price_total, 100::numeric, 'price stored from server-computed value');
  perform assert_eq(b.hold_expires_at is not null, true, 'hold expiry set');
  perform assert_eq((select count(*)::int from booking_events where booking_id = b.id), 1,
                    'booking_event logged on creation');
  perform assert_eq((select count(*)::int from customers where lower(email)='anna@example.com'), 1,
                    'customer created');
end $$;

-- Second request from the same person at a different time reuses the customer.
do $$
declare b bookings%rowtype;
begin
  b := create_booking_request(
    'WE',
    ((current_date + 31)::timestamp + time '10:00') at time zone 'Europe/Berlin',
    ((current_date + 31)::timestamp + time '14:00') at time zone 'Europe/Berlin',
    20,
    '{"first_name":"Anna","last_name":"Beispiel","email":"anna@example.com","organization":"Kita Sonne"}'::jsonb
  );
  perform assert_eq((select count(*)::int from customers where lower(email)='anna@example.com'), 1,
                    'customer deduplicated on email');
  perform assert_eq((select organization from customers where lower(email)='anna@example.com'),
                    'Kita Sonne', 'customer details enriched, not duplicated');
end $$;

-- Overlap -> slot_taken (the exclusion constraint surfaced as a clean error).
select assert_raises($$
  select create_booking_request('WE',
    ((current_date + 30)::timestamp + time '12:00') at time zone 'Europe/Berlin',
    ((current_date + 30)::timestamp + time '16:00') at time zone 'Europe/Berlin',
    10, '{"email":"other@example.com"}'::jsonb)
$$, 'slot_taken', 'overlapping request rejected');

-- Same slot at another location is fine.
do $$
declare b bookings%rowtype;
begin
  b := create_booking_request('WA',
    ((current_date + 30)::timestamp + time '12:00') at time zone 'Europe/Berlin',
    ((current_date + 30)::timestamp + time '16:00') at time zone 'Europe/Berlin',
    10, '{"email":"other@example.com"}'::jsonb);
  perform assert_eq(b.status, 'requested'::booking_status, 'same slot at another location allowed');
end $$;

-- Lead time, duration, closing and bookability guards.
select assert_raises($$
  select create_booking_request('WE',
    ((current_date + 2)::timestamp + time '10:00') at time zone 'Europe/Berlin',
    ((current_date + 2)::timestamp + time '14:00') at time zone 'Europe/Berlin',
    10, '{"email":"soon@example.com"}'::jsonb)
$$, 'too_soon', 'inside 7-day lead rejected');

select assert_raises($$
  select create_booking_request('WE',
    ((current_date + 40)::timestamp + time '10:00') at time zone 'Europe/Berlin',
    ((current_date + 40)::timestamp + time '10:10') at time zone 'Europe/Berlin',
    10, '{"email":"short@example.com"}'::jsonb)
$$, 'too_short', 'under 30 minutes rejected');

select assert_raises($$
  select create_booking_request('WE',
    ((current_date + 41)::timestamp + time '20:00') at time zone 'Europe/Berlin',
    ((current_date + 41)::timestamp + time '23:00') at time zone 'Europe/Berlin',
    10, '{"email":"late@example.com"}'::jsonb)
$$, 'closing_violation', 'past 22:00 at WE rejected');

select assert_raises($$
  select create_booking_request('WI',
    ((current_date + 42)::timestamp + time '10:00') at time zone 'Europe/Berlin',
    ((current_date + 42)::timestamp + time '14:00') at time zone 'Europe/Berlin',
    10, '{"email":"wi@example.com"}'::jsonb)
$$, 'not_online_bookable', 'phone-only location rejects public form');

select assert_raises($$
  select create_booking_request('ZZ',
    ((current_date + 43)::timestamp + time '10:00') at time zone 'Europe/Berlin',
    ((current_date + 43)::timestamp + time '14:00') at time zone 'Europe/Berlin',
    10, '{"email":"zz@example.com"}'::jsonb)
$$, 'location_not_found', 'unknown location rejected');

-- Staff may book inside the lead window (internal source bypasses too_soon).
do $$
declare b bookings%rowtype;
begin
  b := create_booking_request('WI',
    ((current_date + 1)::timestamp + time '10:00') at time zone 'Europe/Berlin',
    ((current_date + 1)::timestamp + time '14:00') at time zone 'Europe/Berlin',
    10, '{"email":"phone@example.com"}'::jsonb, null, '[]'::jsonb, null, null, null, 'de', 'internal');
  perform assert_eq(b.source, 'internal'::booking_source, 'internal booking at phone-only location allowed');
end $$;

-- ------------------------------------------------------------- freed slots
-- Cancelling a booking must release the slot for a new one.
do $$
declare b bookings%rowtype; b2 bookings%rowtype;
begin
  b := create_booking_request('WA',
    ((current_date + 50)::timestamp + time '10:00') at time zone 'Europe/Berlin',
    ((current_date + 50)::timestamp + time '14:00') at time zone 'Europe/Berlin',
    10, '{"email":"cancel@example.com"}'::jsonb);
  update bookings set status = 'cancelled' where id = b.id;

  b2 := create_booking_request('WA',
    ((current_date + 50)::timestamp + time '10:00') at time zone 'Europe/Berlin',
    ((current_date + 50)::timestamp + time '14:00') at time zone 'Europe/Berlin',
    10, '{"email":"next@example.com"}'::jsonb);
  perform assert_eq(b2.status, 'requested'::booking_status, 'cancelled booking frees the slot');

  -- and the status change was audited
  perform assert_eq(
    (select count(*)::int from booking_events
      where booking_id = b.id and event_type = 'status_changed' and to_status = 'cancelled'),
    1, 'status change audited by trigger');
end $$;

-- ------------------------------------------------------------- expire_holds
do $$
declare b bookings%rowtype; n int;
begin
  b := create_booking_request('WA',
    ((current_date + 60)::timestamp + time '10:00') at time zone 'Europe/Berlin',
    ((current_date + 60)::timestamp + time '14:00') at time zone 'Europe/Berlin',
    10, '{"email":"expire@example.com"}'::jsonb);
  -- force the hold into the past
  update bookings set hold_expires_at = now() - interval '1 hour' where id = b.id;

  n := expire_holds();
  perform assert_eq(n >= 1, true, 'expire_holds reports expired count');
  perform assert_eq((select status from bookings where id = b.id), 'expired'::booking_status,
                    'lapsed hold becomes expired');
  perform assert_eq(
    (select count(*)::int from booking_events where booking_id = b.id and to_status = 'expired') >= 1,
    true, 'expiry logged');
end $$;

-- --------------------------------------------------------- public_availability
-- The public view must never leak personal data and must label holds.
do $$
declare cols text[];
begin
  select array_agg(column_name::text order by column_name) into cols
  from information_schema.columns
  where table_name = 'public_availability';

  perform assert_eq(cols, ARRAY['color','ends_at','kind','location_code','project_code',
                                 'public_description','public_link','public_title','starts_at'],
                    'public_availability exposes only non-personal columns');
  perform assert_eq(
    (select count(*)::int from public_availability where kind = 'hold') >= 1,
    true, 'active holds appear as kind=hold');
end $$;

-- A booking is published while active and disappears once it is cancelled.
-- Uses a start time no other test touches, so the check targets exactly this row
-- (public_availability deliberately exposes no id to join on).
do $$
declare b bookings%rowtype; uniq_start timestamptz;
begin
  uniq_start := ((current_date + 200)::timestamp + time '09:30') at time zone 'Europe/Berlin';
  b := create_booking_request('WA', uniq_start, uniq_start + interval '2 hours', 5,
                              '{"email":"hidden@example.com"}'::jsonb);

  perform assert_eq((select count(*)::int from public_availability where starts_at = uniq_start),
                    1, 'active booking is published');

  update bookings set status = 'cancelled' where id = b.id;

  perform assert_eq((select count(*)::int from public_availability where starts_at = uniq_start),
                    0, 'cancelled booking is not published');
end $$;

-- ------------------------------------------------------------- new user hook
do $$
declare uid uuid := gen_random_uuid();
begin
  insert into auth.users (id, email) values (uid, 'neu@kidbike.de');
  perform assert_eq((select count(*)::int from profiles where id = uid), 1,
                    'profile auto-created on new auth user');
  perform assert_eq((select role from profiles where id = uid), 'staff'::text,
                    'new profile defaults to staff role');
end $$;

\echo '--- all SQL function tests passed ---'
