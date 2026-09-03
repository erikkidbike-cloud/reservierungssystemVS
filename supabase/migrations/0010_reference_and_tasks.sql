-- 0010_reference_and_tasks.sql
-- Backlog 4.2 (Verwendungszweck), 4.3 (caretaker tasks), 4.4 (deposit return).
-- See docs/01-business-rules.md §7 and docs/06-handoff-backlog.md Phase 4.

create extension if not exists unaccent;

-- Payment reference (Verwendungszweck) ----------------------------------------
-- Format ported from the Excel `AutoVZweck` column: `F` + location code +
-- a 3-digit sequence + 2 letters of the surname + 2 letters of the first name
-- (e.g. FWE211DOLU). See docs/01-business-rules.md §7.
--
-- ⚠️ The Excel formula itself was never recovered (flagged there as an open
-- question) — this reproduces the documented FORMAT and is internally
-- consistent (deterministic, and unique enough for SevDesk matching purposes:
-- 1000 references per rollover, refreshed with two more identifying letters),
-- but it does NOT continue Excel's own historical sequence numbers. That is
-- fine going forward — this function only ever runs for bookings created by
-- this system — but a booking imported from the Excel history (backlog 1.7)
-- should carry its ORIGINAL reference rather than a new one generated here,
-- so a payment already made against the old reference still matches.
create sequence if not exists booking_reference_seq start 1;

create or replace function generate_verwendungszweck(
  p_location_code text,
  p_last_name text,
  p_first_name text
) returns text language plpgsql as $$
declare
  seq   int;
  sur   text;
  first text;
begin
  seq := nextval('booking_reference_seq') % 1000;
  -- Strip everything but letters (so "Müller-Lüdenscheidt" and a stray space
  -- or apostrophe don't break the fixed-width format), then pad with filler
  -- so a one-letter or empty name still yields exactly two characters.
  sur   := upper(left(regexp_replace(unaccent(coalesce(p_last_name, '')),  '[^a-zA-Z]', '', 'g') || 'XX', 2));
  first := upper(left(regexp_replace(unaccent(coalesce(p_first_name, '')), '[^a-zA-Z]', '', 'g') || 'XX', 2));
  return 'F' || upper(p_location_code) || lpad(seq::text, 3, '0') || sur || first;
end $$;

-- create_booking_request: unchanged signature, replaced body — now also
-- generates and stores the payment reference at creation time, so it exists
-- from the very first "requested" hold onward (visible to staff immediately,
-- not only once a deposit is expected).
create or replace function create_booking_request(
  p_location_code text,
  p_starts_at     timestamptz,
  p_ends_at       timestamptz,
  p_persons       int,
  p_customer      jsonb,
  p_price         jsonb        default null,
  p_extras        jsonb        default '[]'::jsonb,
  p_bikes         jsonb        default null,
  p_event_type    text         default null,
  p_message       text         default null,
  p_lang          text         default 'de',
  p_source        booking_source default 'public_form',
  p_tariff_type   tariff_type  default 'standard',
  p_needs_id_upload boolean    default false
)
returns bookings
language plpgsql security definer set search_path = public as $$
declare
  loc        locations%rowtype;
  cust_id    uuid;
  email_norm text := lower(nullif(trim(p_customer->>'email'), ''));
  new_row    bookings%rowtype;
  hold_until timestamptz;
  vzweck     text;
begin
  -- Location ------------------------------------------------------------------
  select * into loc from locations where code = p_location_code and is_active;
  if not found then
    raise exception 'location_not_found' using detail = p_location_code;
  end if;

  -- A phone-only or offline location cannot be booked through the public form.
  if p_source = 'public_form' and loc.online_bookability <> 'online' then
    raise exception 'not_online_bookable' using detail = p_location_code;
  end if;

  -- Time validation (mirrors packages/pricing validateRequest) -----------------
  if p_starts_at is null or p_ends_at is null or p_ends_at <= p_starts_at then
    raise exception 'invalid_range';
  end if;

  if p_ends_at - p_starts_at < make_interval(mins => loc.min_duration_minutes) then
    raise exception 'too_short' using detail = loc.min_duration_minutes::text;
  end if;

  -- Lead time is only enforced for public requests; staff may enter a booking
  -- for tomorrow when someone phones up.
  if p_source = 'public_form'
     and local_date_of(p_starts_at) < (current_date + loc.min_lead_days) then
    raise exception 'too_soon' using detail = loc.min_lead_days::text;
  end if;

  if violates_closing(loc.closing_hour, p_starts_at, p_ends_at) then
    raise exception 'closing_violation' using detail = loc.closing_hour::text;
  end if;

  -- Customer upsert (match on email when we have one) --------------------------
  if email_norm is not null then
    select id into cust_id from customers where lower(email) = email_norm limit 1;
  end if;

  if cust_id is null then
    insert into customers (salutation, first_name, last_name, organization, email,
                           phone, phone_country, street, house_number, zip, city,
                           address_full, lang)
    values (p_customer->>'salutation', p_customer->>'first_name', p_customer->>'last_name',
            p_customer->>'organization', p_customer->>'email', p_customer->>'phone',
            p_customer->>'phone_country', p_customer->>'street', p_customer->>'house_number',
            p_customer->>'zip', p_customer->>'city', p_customer->>'address_full',
            coalesce(p_customer->>'lang', p_lang))
    returning id into cust_id;
  else
    -- Refresh contact details from the newest request, without nulling what we
    -- already hold.
    update customers set
      salutation    = coalesce(nullif(p_customer->>'salutation',''),    salutation),
      first_name    = coalesce(nullif(p_customer->>'first_name',''),    first_name),
      last_name     = coalesce(nullif(p_customer->>'last_name',''),     last_name),
      organization  = coalesce(nullif(p_customer->>'organization',''),  organization),
      phone         = coalesce(nullif(p_customer->>'phone',''),         phone),
      phone_country = coalesce(nullif(p_customer->>'phone_country',''), phone_country),
      street        = coalesce(nullif(p_customer->>'street',''),        street),
      house_number  = coalesce(nullif(p_customer->>'house_number',''),  house_number),
      zip           = coalesce(nullif(p_customer->>'zip',''),           zip),
      city          = coalesce(nullif(p_customer->>'city',''),          city),
      address_full  = coalesce(nullif(p_customer->>'address_full',''),  address_full)
    where id = cust_id;
  end if;

  -- Hold expiry: N business days from today, end of that day (Berlin).
  hold_until := ((add_business_days(current_date, loc.hold_business_days) + 1)::timestamp
                 - interval '1 second') at time zone app_timezone();

  vzweck := generate_verwendungszweck(p_location_code, p_customer->>'last_name', p_customer->>'first_name');

  -- Insert. The exclusion constraint is the real overlap guard: a concurrent
  -- request for the same slot fails here even if both passed their checks.
  begin
    insert into bookings (
      location_id, customer_id, tariff_type, starts_at, ends_at, persons,
      event_type, extras, bikes, needs_id_upload,
      price_total, price_breakdown, caution, currency, verwendungszweck,
      lang, status, source, hold_expires_at, message
    ) values (
      loc.id, cust_id, p_tariff_type, p_starts_at, p_ends_at, p_persons,
      p_event_type, coalesce(p_extras, '[]'::jsonb), p_bikes, p_needs_id_upload,
      (p_price->>'total')::numeric,
      p_price->'breakdown',
      (p_price->>'caution')::numeric,
      coalesce(p_price->>'currency', 'EUR'),
      vzweck,
      p_lang, 'requested', p_source, hold_until, p_message
    )
    returning * into new_row;
  exception when exclusion_violation then
    raise exception 'slot_taken' using detail = p_location_code;
  end;

  insert into booking_events (booking_id, event_type, to_status, payload)
  values (new_row.id, 'requested', 'requested',
          jsonb_build_object('source', p_source, 'hold_expires_at', hold_until));

  return new_row;
end $$;

revoke all on function create_booking_request(
  text, timestamptz, timestamptz, int, jsonb, jsonb, jsonb, jsonb,
  text, text, text, booking_source, tariff_type, boolean
) from public, anon, authenticated;

grant execute on function create_booking_request(
  text, timestamptz, timestamptz, int, jsonb, jsonb, jsonb, jsonb,
  text, text, text, booking_source, tariff_type, boolean
) to service_role;

-- Caretaker tasks + deposit return ---------------------------------------------
-- Mechanism only, mirroring TRANSITIONS' documented `effect` strings in
-- packages/domain/booking-state.ts (paid→confirmed: "create caretaker
-- open/close tasks"; confirmed→completed: "create return_deposit task
-- (14-day deadline) if deposit held") — so this trigger implements exactly
-- what the state machine already says should happen, nothing more.
--
-- A location's caretaker(s) are whoever holds the 'hausmeister' role and is
-- linked to that location via user_locations. If none is on file yet, the
-- tasks are still created, just unassigned — visible to admin/location_manager
-- (tasks_manage RLS, 0005) so one of them can assign it by hand rather than
-- the confirmation silently scheduling nothing.
create or replace function create_lifecycle_tasks()
returns trigger language plpgsql security definer set search_path = public as $$
declare
  caretaker  record;
  any_caretaker boolean := false;
begin
  if new.status = 'confirmed' then
    for caretaker in
      select p.id from profiles p
      join user_locations ul on ul.user_id = p.id
      where ul.location_id = new.location_id and p.role = 'hausmeister' and p.is_active
    loop
      any_caretaker := true;
      insert into tasks (booking_id, location_id, type, title, assignee_id, due_at)
      values (new.id, new.location_id, 'open_venue',
              'Öffnen: ' || coalesce(new.event_type, 'Veranstaltung'), caretaker.id, new.starts_at);
      insert into tasks (booking_id, location_id, type, title, assignee_id, due_at)
      values (new.id, new.location_id, 'close_venue',
              'Schließen: ' || coalesce(new.event_type, 'Veranstaltung'), caretaker.id, new.ends_at);
    end loop;

    if not any_caretaker then
      insert into tasks (booking_id, location_id, type, title, due_at)
      values (new.id, new.location_id, 'open_venue',
              'Öffnen: ' || coalesce(new.event_type, 'Veranstaltung'), new.starts_at);
      insert into tasks (booking_id, location_id, type, title, due_at)
      values (new.id, new.location_id, 'close_venue',
              'Schließen: ' || coalesce(new.event_type, 'Veranstaltung'), new.ends_at);
    end if;
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

  return new;
end $$;

drop trigger if exists trg_bookings_lifecycle_tasks on bookings;
create trigger trg_bookings_lifecycle_tasks
  after update of status on bookings
  for each row
  when (new.status is distinct from old.status)
  execute function create_lifecycle_tasks();
