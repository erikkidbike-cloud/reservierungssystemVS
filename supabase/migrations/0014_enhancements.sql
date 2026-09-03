-- 0014_enhancements.sql
-- 1. Controlled double bookings (staff override with explicit flag)
-- 2. Conflict checking against blocks in create_booking_request
-- 3. Non-public blocks masked as 'busy' in public_availability
-- 4. Waitlist requests table
-- 5. Caretaker task cleanup on cancellation and single-assignment guard
-- 6. auto_complete_past_bookings function

-- 1. Allow double bookings with explicit staff override ----------------------
alter table bookings add column if not exists allow_overlap boolean not null default false;

alter table bookings drop constraint if exists bookings_no_overlap;

alter table bookings
  add constraint bookings_no_overlap
  exclude using gist (
    location_id with =,
    during      with &&
  )
  where (status in ('requested','approved','agreement_sent','signed','paid','confirmed') and not allow_overlap);

-- 2. Update public_availability: mask non-public blocks as 'busy' ------------
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
    case
      when not bl.is_public then 'busy'
      when bl.project_id is not null then 'project'
      else 'busy'
    end as kind,
    case when bl.is_public then coalesce(bl.public_title, p.public_title) else null end as public_title,
    case when bl.is_public then coalesce(bl.public_link,  p.public_link)  else null end as public_link,
    case when bl.is_public then coalesce(bl.color, p.color)              else null end as color,
    case when bl.is_public then coalesce(bl.public_description, p.public_description) else null end as public_description,
    case when bl.is_public then p.code                                    else null end as project_code
  from blocks bl
  join locations l on l.id = bl.location_id
  left join projects p on p.id = bl.project_id;

grant select on public_availability to anon, authenticated;

-- 3. create_booking_request with blocks check & allow_overlap support --------
create or replace function create_booking_request(
  p_location_code   text,
  p_starts_at       timestamptz,
  p_ends_at         timestamptz,
  p_persons         int,
  p_customer        jsonb,
  p_price           jsonb          default null,
  p_extras          jsonb          default '[]'::jsonb,
  p_bikes           jsonb          default null,
  p_event_type      text           default null,
  p_message         text           default null,
  p_lang            text           default 'de',
  p_source          booking_source default 'public_form',
  p_tariff_type     tariff_type    default 'standard',
  p_needs_id_upload boolean        default false,
  p_allow_overlap   boolean        default false
)
returns bookings
language plpgsql security definer set search_path = public as $$
declare
  loc          locations%rowtype;
  cust_id      uuid;
  email_norm   text := lower(nullif(trim(p_customer->>'email'), ''));
  new_row      bookings%rowtype;
  hold_until   timestamptz;
  vzweck       text;
  has_conflict boolean := false;
begin
  -- Location
  select * into loc from locations where code = p_location_code and is_active;
  if not found then
    raise exception 'location_not_found' using detail = p_location_code;
  end if;

  -- A phone-only or offline location cannot be booked through the public form.
  if p_source = 'public_form' and loc.online_bookability <> 'online' then
    raise exception 'not_online_bookable' using detail = p_location_code;
  end if;

  -- Time validation (mirrors packages/pricing validateRequest)
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

  -- Overlap check against both active bookings AND blocks --------------------
  select exists(
    select 1 from blocks
    where location_id = loc.id
      and during && tstzrange(p_starts_at, p_ends_at)
  ) into has_conflict;

  if not has_conflict then
    select exists(
      select 1 from bookings
      where location_id = loc.id
        and status in ('requested','approved','agreement_sent','signed','paid','confirmed')
        and during && tstzrange(p_starts_at, p_ends_at)
    ) into has_conflict;
  end if;

  if has_conflict then
    if not p_allow_overlap then
      raise exception 'slot_taken' using detail = p_location_code;
    elsif p_source <> 'internal' then
      raise exception 'forbidden' using detail = 'overlap_only_allowed_for_internal';
    end if;
  end if;

  -- Customer upsert (match on email when we have one) ------------------------
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

  -- Insert booking
  begin
    insert into bookings (
      location_id, customer_id, tariff_type, starts_at, ends_at, persons,
      event_type, extras, bikes, needs_id_upload,
      price_total, price_breakdown, caution, currency, verwendungszweck,
      lang, status, source, hold_expires_at, message,
      has_overlap, allow_overlap
    ) values (
      loc.id, cust_id, p_tariff_type, p_starts_at, p_ends_at, p_persons,
      p_event_type, coalesce(p_extras, '[]'::jsonb), p_bikes, p_needs_id_upload,
      (p_price->>'total')::numeric,
      p_price->'breakdown',
      (p_price->>'caution')::numeric,
      coalesce(p_price->>'currency', 'EUR'),
      vzweck,
      p_lang, 'requested', p_source, hold_until, p_message,
      has_conflict, (p_allow_overlap and has_conflict)
    )
    returning * into new_row;
  exception when exclusion_violation then
    raise exception 'slot_taken' using detail = p_location_code;
  end;

  insert into booking_events (booking_id, event_type, to_status, payload)
  values (new_row.id, 'requested', 'requested',
          jsonb_build_object('source', p_source, 'hold_expires_at', hold_until, 'has_overlap', has_conflict));

  return new_row;
end $$;

revoke all on function create_booking_request(
  text, timestamptz, timestamptz, int, jsonb, jsonb, jsonb, jsonb,
  text, text, text, booking_source, tariff_type, boolean, boolean
) from public, anon, authenticated;

grant execute on function create_booking_request(
  text, timestamptz, timestamptz, int, jsonb, jsonb, jsonb, jsonb,
  text, text, text, booking_source, tariff_type, boolean, boolean
) to service_role;

-- 4. Waitlist table ----------------------------------------------------------
create table if not exists waitlist_requests (
  id             uuid primary key default gen_random_uuid(),
  location_id    uuid not null references locations (id) on delete cascade,
  starts_at      timestamptz not null,
  ends_at        timestamptz not null,
  customer_name  text not null,
  customer_email text not null,
  customer_phone text,
  persons        int,
  message        text,
  status         text not null default 'waiting',
  created_at     timestamptz not null default now(),
  notified_at    timestamptz,
  constraint waitlist_time_order check (ends_at > starts_at)
);

create index if not exists idx_waitlist_location on waitlist_requests (location_id, starts_at);
create index if not exists idx_waitlist_status   on waitlist_requests (status);

alter table waitlist_requests enable row level security;

create policy waitlist_read on waitlist_requests for select using (
  is_admin() or is_finance() or has_location(location_id)
);

create policy waitlist_write on waitlist_requests for all using (
  is_admin() or has_location(location_id)
);

grant select, insert, update, delete on waitlist_requests to authenticated, service_role;

-- 5. Caretaker tasks trigger: task cleanup on cancel & single caretaker ------
create or replace function create_lifecycle_tasks()
returns trigger language plpgsql security definer set search_path = public as $$
declare
  caretaker_id uuid;
begin
  if new.status = 'confirmed' then
    -- Find a caretaker linked to this location (first active one)
    select p.id into caretaker_id
    from profiles p
    join user_locations ul on ul.user_id = p.id
    where ul.location_id = new.location_id and p.role = 'hausmeister' and p.is_active
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

  -- Clean up open tasks on cancellation or postponement
  if new.status in ('cancelled', 'postponed', 'rejected') then
    update tasks
       set status = 'cancelled',
           updated_at = now()
     where booking_id = new.id
       and status = 'open';
  end if;

  return new;
end $$;

-- 6. Auto-complete past confirmed bookings -----------------------------------
create or replace function auto_complete_past_bookings()
returns int language plpgsql security definer set search_path = public as $$
declare
  n int;
begin
  with completed_rows as (
    update bookings
       set status = 'completed'
     where status = 'confirmed'
       and ends_at < (now() - interval '1 hour')
    returning id
  )
  insert into booking_events (booking_id, event_type, from_status, to_status, payload)
  select id, 'complete', 'confirmed', 'completed', jsonb_build_object('reason', 'auto_completed_after_event')
  from completed_rows;

  get diagnostics n = row_count;
  return n;
end $$;

revoke all on function auto_complete_past_bookings() from public, anon, authenticated;
grant execute on function auto_complete_past_bookings() to service_role;
