-- 0015_reminders_ical_ratelimit.sql
-- 1. Rate limiting for the anonymous public endpoints (booking + waitlist)
-- 2. Per-location iCal feed tokens
-- 3. Configurable reminder emails (rules + a send log so nothing goes twice)

-- 1. Rate limiting -----------------------------------------------------------
-- Counter-per-window rather than a row per request: a fixed-size table that
-- can't grow with traffic, and one upsert per check. Lives in the database
-- rather than in process memory because the app runs as serverless functions —
-- an in-memory counter would reset on every cold start and be per-instance,
-- which is exactly no protection at all.
create table if not exists rate_limit_counters (
  bucket       text not null,
  window_start timestamptz not null,
  hits         int not null default 0,
  primary key (bucket, window_start)
);

-- Never readable or writable by a client: only the SECURITY DEFINER function
-- below touches it, and only the trusted server calls that.
alter table rate_limit_counters enable row level security;

/**
 * Count one hit against `p_bucket` and report whether it stays within
 * `p_limit` per `p_window_seconds`. Returns true when the caller may proceed.
 *
 * Fails OPEN by design: a rate limiter that errors must not take the booking
 * form down with it, so the caller treats an exception as "allowed" (see
 * apps/web/lib/rate-limit.ts). The cost of that choice is that a database
 * outage also suspends throttling — acceptable, because during a database
 * outage no booking can be written anyway.
 */
create or replace function check_rate_limit(
  p_bucket text,
  p_limit int,
  p_window_seconds int
) returns boolean language plpgsql security definer set search_path = public as $$
declare
  w timestamptz;
  n int;
begin
  w := to_timestamp(floor(extract(epoch from now()) / p_window_seconds) * p_window_seconds);

  insert into rate_limit_counters (bucket, window_start, hits)
  values (p_bucket, w, 1)
  on conflict (bucket, window_start) do update
    set hits = rate_limit_counters.hits + 1
  returning hits into n;

  -- Opportunistic cleanup, ~1 call in 100, so the table stays small without
  -- a scheduled job and without a delete on every single request.
  if random() < 0.01 then
    delete from rate_limit_counters where window_start < now() - interval '1 day';
  end if;

  return n <= p_limit;
end $$;

revoke all on function check_rate_limit(text, int, int) from public, anon, authenticated;
grant execute on function check_rate_limit(text, int, int) to service_role;

-- 2. iCal feed tokens --------------------------------------------------------
-- A caretaker subscribes their own calendar app to a URL; calendar apps can't
-- log in, so the URL itself carries an unguessable token (the same trust model
-- as the signing link). Per location, so one leaked feed doesn't expose the
-- others and can be rotated on its own.
alter table locations add column if not exists ical_token uuid not null default gen_random_uuid();

comment on column locations.ical_token is
  'Secret in the iCal subscription URL (/api/ical/<code>?token=...). Rotate by setting a new gen_random_uuid() — existing subscriptions then stop working, which is the point.';

-- 3. Reminder emails ---------------------------------------------------------
-- A rule says "this many days before/after this anchor, send this template to
-- bookings in these statuses". The wording lives in mail_templates, edited in
-- the same screen as every other automated mail (/admin/mail-templates), so
-- there is one editor and one merge-field vocabulary, not two.
create table if not exists reminder_rules (
  id            uuid primary key default gen_random_uuid(),
  name          text not null,
  template_key  text not null references mail_templates (key) on delete restrict,
  -- Negative = before the anchor, positive = after. Hours are added on top,
  -- so "-1 day, +0h" is 24h before and "0 days, +2h" is two hours after.
  offset_days   int not null default 0,
  offset_hours  int not null default 0,
  anchor        text not null default 'event_start'
                check (anchor in ('event_start', 'event_end', 'payment_due')),
  -- Which booking statuses the reminder applies to. A reminder for an
  -- unpaid booking targets different statuses than a thank-you afterwards.
  statuses      booking_status[] not null default '{confirmed}',
  -- null = every location.
  location_id   uuid references locations (id) on delete cascade,
  recipient     text not null default 'customer'
                check (recipient in ('customer', 'location')),
  is_active     boolean not null default true,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);
create trigger trg_reminder_rules_updated before update on reminder_rules
  for each row execute function set_updated_at();

-- One row per (booking, rule) that actually went out. The unique constraint IS
-- the "don't send twice" guarantee: the sender inserts first and only mails on
-- a successful insert, so two overlapping cron runs can't both send.
create table if not exists reminder_sends (
  booking_id uuid not null references bookings (id) on delete cascade,
  rule_id    uuid not null references reminder_rules (id) on delete cascade,
  sent_at    timestamptz not null default now(),
  primary key (booking_id, rule_id)
);

alter table reminder_rules enable row level security;
alter table reminder_sends enable row level security;

create policy reminder_rules_read  on reminder_rules for select using (auth.uid() is not null);
create policy reminder_rules_write on reminder_rules for all
  using (is_admin()) with check (is_admin());

create policy reminder_sends_read on reminder_sends for select using (auth.uid() is not null);

grant select, insert, update, delete on reminder_rules to authenticated;
grant select on reminder_sends to authenticated;

/**
 * Bookings that are due for `p_rule_id` right now: the anchor time plus the
 * rule's offset has passed, the booking is in one of the rule's statuses, and
 * no reminder for this rule has been sent for it yet.
 *
 * `p_grace_hours` bounds how far back it will look, so turning a rule on does
 * not immediately fire it at every booking in history.
 */
create or replace function due_reminders(p_rule_id uuid, p_grace_hours int default 48)
returns setof bookings language plpgsql stable security definer set search_path = public as $$
declare
  r reminder_rules%rowtype;
begin
  select * into r from reminder_rules where id = p_rule_id and is_active;
  if not found then return; end if;

  return query
  select b.*
  from bookings b
  where b.status = any (r.statuses)
    and (r.location_id is null or b.location_id = r.location_id)
    and not exists (
      select 1 from reminder_sends s where s.booking_id = b.id and s.rule_id = r.id
    )
    and (
      case r.anchor
        when 'event_start' then b.starts_at
        when 'event_end'   then b.ends_at
        -- Payment is due 14 days before the event (docs/01-business-rules.md);
        -- the agreement prints that same date.
        else b.starts_at - interval '14 days'
      end
      + make_interval(days => r.offset_days, hours => r.offset_hours)
    ) between (now() - make_interval(hours => p_grace_hours)) and now();
end $$;

revoke all on function due_reminders(uuid, int) from public, anon, authenticated;
grant execute on function due_reminders(uuid, int) to service_role;
