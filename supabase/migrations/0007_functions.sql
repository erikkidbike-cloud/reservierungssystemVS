-- 0007_functions.sql
-- Booking creation, hold expiry, profile provisioning and status auditing.
-- Backlog tasks 1.3, 1.4 (partial), 4.5.
--
-- IMPORTANT — where pricing lives: prices are NOT computed here. The pricing
-- algorithm has exactly one implementation, packages/pricing (TypeScript), used
-- by both the public form and the internal console. The trusted server route
-- computes the price with that engine and passes it in as p_price. Re-deriving
-- prices in PL/pgSQL would recreate the very JS-vs-Excel drift this rebuild
-- exists to remove. Everything that must be atomic with the insert (validation,
-- customer upsert, overlap, hold expiry, audit) *is* done here.

-- All wall-clock rules (closing hour, business days) are evaluated in this zone.
-- Berlin is the operating timezone of every location.
create or replace function app_timezone() returns text
  language sql immutable as $$ select 'Europe/Berlin'::text $$;

-- Business days ---------------------------------------------------------------
-- Adds n business days (Mon-Fri) to a date. Public holidays are NOT considered;
-- the current Apps Script does not consider them either. If holiday-aware hold
-- expiry is ever needed, add a holidays table and extend this function.
create or replace function add_business_days(from_date date, n int)
returns date language plpgsql immutable as $$
declare
  d date := from_date;
  added int := 0;
begin
  if n <= 0 then return from_date; end if;
  while added < n loop
    d := d + 1;
    if extract(isodow from d) < 6 then     -- 1..5 = Mon..Fri
      added := added + 1;
    end if;
  end loop;
  return d;
end $$;

-- Local wall-clock helpers ----------------------------------------------------
create or replace function local_time_of(ts timestamptz)
returns time language sql immutable as $$
  select (ts at time zone app_timezone())::time;
$$;

create or replace function local_date_of(ts timestamptz)
returns date language sql immutable as $$
  select (ts at time zone app_timezone())::date;
$$;

-- Closing-rule check, mirroring violatesClosing (index.html:1562) and
-- packages/pricing validation.ts. Returns true when the range is NOT allowed.
create or replace function violates_closing(p_closing_hour int, p_starts_at timestamptz, p_ends_at timestamptz)
returns boolean language sql immutable as $$
  select case
    when p_closing_hour is null then false
    when local_date_of(p_starts_at) <> local_date_of(p_ends_at) then true      -- crosses midnight
    when local_time_of(p_starts_at) >= make_time(p_closing_hour, 0, 0) then true
    when local_time_of(p_ends_at)   >  make_time(p_closing_hour, 0, 0) then true
    when local_time_of(p_starts_at) <  time '06:00' then true                  -- night hours are closed
    else false
  end;
$$;

-- Booking request -------------------------------------------------------------
-- Creates a hold (a booking with status 'requested'). Validates server-side so
-- the rules hold for internal entry too, not only in the customer's browser.
--
-- Security: SECURITY DEFINER, but EXECUTE is revoked from anon/authenticated and
-- granted only to service_role. The public form reaches it through a trusted
-- server route that has already computed the price with @vs/pricing. This keeps
-- untrusted clients from setting their own price or status.
--
-- Raises (message = machine code, so the app can map to a user-facing string):
--   location_not_found · not_online_bookable · invalid_range · too_short
--   too_soon · closing_violation · slot_taken
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

  -- Insert. The exclusion constraint is the real overlap guard: a concurrent
  -- request for the same slot fails here even if both passed their checks.
  begin
    insert into bookings (
      location_id, customer_id, tariff_type, starts_at, ends_at, persons,
      event_type, extras, bikes, needs_id_upload,
      price_total, price_breakdown, caution, currency,
      lang, status, source, hold_expires_at, message
    ) values (
      loc.id, cust_id, p_tariff_type, p_starts_at, p_ends_at, p_persons,
      p_event_type, coalesce(p_extras, '[]'::jsonb), p_bikes, p_needs_id_upload,
      (p_price->>'total')::numeric,
      p_price->'breakdown',
      (p_price->>'caution')::numeric,
      coalesce(p_price->>'currency', 'EUR'),
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

-- Hold expiry (hourly cron) ---------------------------------------------------
-- Replaces cronExpireHolds in the Apps Script. Returns the number expired.
create or replace function expire_holds()
returns int language plpgsql security definer set search_path = public as $$
declare
  n int;
begin
  with expired as (
    update bookings
       set status = 'expired'
     where status = 'requested'
       and hold_expires_at is not null
       and hold_expires_at < now()
    returning id
  )
  insert into booking_events (booking_id, event_type, from_status, to_status, payload)
  select id, 'expired', 'requested', 'expired', jsonb_build_object('reason', 'hold_lapsed')
  from expired;

  get diagnostics n = row_count;
  return n;
end $$;

revoke all on function expire_holds() from public, anon, authenticated;
grant execute on function expire_holds() to service_role;

-- Profile provisioning --------------------------------------------------------
-- On first Entra ID / Microsoft login, create the profile row (default 'staff';
-- an admin assigns the real role afterwards).
create or replace function handle_new_user()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  insert into profiles (id, email)
  values (new.id, new.email)
  on conflict (id) do nothing;
  return new;
end $$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function handle_new_user();

-- Status audit ----------------------------------------------------------------
-- Mechanism only: every status change is logged. Which transitions are LEGAL is
-- defined once, in packages/domain (booking-state.ts) — deliberately not
-- duplicated here, to avoid the two drifting apart.
create or replace function log_booking_status_change()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if new.status is distinct from old.status then
    insert into booking_events (booking_id, event_type, from_status, to_status, actor_id)
    values (new.id, 'status_changed', old.status, new.status, auth.uid());
  end if;
  return new;
end $$;

drop trigger if exists trg_bookings_status_audit on bookings;
create trigger trg_bookings_status_audit
  after update of status on bookings
  for each row execute function log_booking_status_change();
