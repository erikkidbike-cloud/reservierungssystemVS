-- 0018_occupancy.sql
-- Occupancy: hours booked against hours available, per location per month.
--
-- The dashboard chart counts BOOKINGS, which flatters a venue that takes lots
-- of short ones and punishes one that takes a few long ones. What a board
-- actually asks is "how full is the Verkehrsschule?", and that needs a
-- denominator.
--
-- THE DENOMINATOR
-- ---------------
-- Available hours come from the location's own bookable window —
-- `grid_min_hour` to `grid_max_end_hour`, the same pair the public calendar
-- draws — times the days in the month. That is a real, already-configured
-- number rather than an invented one: widen a venue's window and its occupancy
-- percentage drops accordingly, which is the honest answer.
--
-- It is NOT adjusted for closures, holidays, or blocks. A block is a decision
-- to not sell those hours, and hiding it in the denominator would turn "we
-- closed for three weeks" into "we were fully booked". Blocked hours are
-- reported alongside so the two can be read together.
--
-- THE NUMERATOR
-- -------------
-- Bookings in the statuses that actually occupy the calendar, CLIPPED to the
-- month: an event running from 23:00 on the 31st to 02:00 on the 1st
-- contributes one hour to one month and two to the next, not three to both.

/** Hours of a range that fall inside a span, 0 when they do not meet. */
create or replace function hours_within(r tstzrange, span tstzrange)
returns numeric language sql immutable as $$
  select case
    when r && span then extract(epoch from (upper(r * span) - lower(r * span))) / 3600.0
    else 0
  end::numeric;
$$;

create or replace function occupancy_by_month(
  p_from date,
  p_to   date
)
returns table (
  location_id     uuid,
  location_code   text,
  location_name   text,
  month           date,
  booked_hours    numeric,
  blocked_hours   numeric,
  available_hours numeric,
  booked_pct      numeric
)
language sql stable security definer set search_path = public as $$
  with months as (
    select generate_series(
      date_trunc('month', p_from)::date,
      date_trunc('month', p_to)::date,
      interval '1 month'
    )::date as m
  ),
  -- Only locations the caller may see. Occupancy carries no personal data, so
  -- bookings.read plus the usual location scope is the right gate — the same
  -- pair every other read of the calendar uses.
  visible as (
    select l.* from locations l
    where l.is_active
      and has_permission('bookings.read')
      and has_location(l.id)
  ),
  grid as (
    select
      v.id, v.code, v.name, m.m,
      -- The window may cross midnight (grid_max_end_hour is 28 for a venue
      -- that runs to 04:00), which is why it is stored as an hour offset
      -- rather than as two times of day.
      (v.grid_max_end_hour - v.grid_min_hour)::numeric
        * extract(day from (m.m + interval '1 month' - interval '1 day'))::numeric
        as available_hours,
      tstzrange(
        (m.m::timestamp at time zone app_timezone()),
        ((m.m + interval '1 month')::timestamp at time zone app_timezone()),
        '[)'
      ) as span
    from visible v cross join months m
  ),
  totals as (
    select
      g.id, g.code, g.name, g.m, g.available_hours,
      coalesce((
        select sum(hours_within(tstzrange(b.starts_at, b.ends_at, '[)'), g.span))
        from bookings b
        where b.location_id = g.id
          and b.status in ('approved','agreement_sent','signed','paid','confirmed','completed')
          and tstzrange(b.starts_at, b.ends_at, '[)') && g.span
      ), 0) as booked_hours,
      coalesce((
        select sum(hours_within(tstzrange(bl.starts_at, bl.ends_at, '[)'), g.span))
        from blocks bl
        where bl.location_id = g.id
          and tstzrange(bl.starts_at, bl.ends_at, '[)') && g.span
      ), 0) as blocked_hours
    from grid g
  )
  select
    t.id, t.code, t.name, t.m,
    t.booked_hours::numeric(10,2),
    t.blocked_hours::numeric(10,2),
    t.available_hours::numeric(10,2),
    case when t.available_hours > 0
      then round(t.booked_hours * 100 / t.available_hours, 1)
      else 0
    end
  from totals t
  order by t.code, t.m;
$$;

revoke all on function occupancy_by_month(date, date) from public, anon;
grant execute on function occupancy_by_month(date, date) to authenticated, service_role;

comment on function occupancy_by_month(date, date) is
  'Hours booked and blocked against the location''s own bookable window, per month. Scoped to the caller''s locations by has_location(); needs bookings.read.';
