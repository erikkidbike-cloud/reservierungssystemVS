-- 0017_waitlist_offers.sql
-- Closing the loop on the waitlist: when a slot frees up, tell the people who
-- asked for it.
--
-- Until now the waitlist was a list somebody had to remember to look at. The
-- moment that matters — a booking being cancelled — happened on a different
-- screen and left no trace on the waitlist at all.
--
-- WHY THERE IS NO CLAIM TOKEN
-- ---------------------------
-- The obvious design is a short-lived link that holds the slot for whoever
-- clicks first. That was considered and rejected: holding a slot for someone
-- who may not read their mail for two days is exactly the situation the
-- 5-business-day hold already causes trouble with, and it would mean a second
-- reservation mechanism sitting beside `bookings`, with its own expiry, its own
-- conflict rules and its own way of going wrong. Instead the mail carries a
-- deep link into the ordinary public form with the venue and date pre-filled.
-- First to submit wins, which is what the venue does on the phone anyway, and
-- the exclusion constraint already settles a tie.

-- Who is waiting for a slot that has just come free? -------------------------
--
-- "Waiting for" is deliberately loose: any waiting entry at that location whose
-- requested range OVERLAPS the freed one. Someone who asked for Saturday
-- 10:00–14:00 is plainly interested in Saturday 12:00–16:00 becoming free, and
-- a stricter rule would silently drop the people the feature exists for.
create or replace function waitlist_matches(
  p_location_id uuid,
  p_starts_at   timestamptz,
  p_ends_at     timestamptz
)
returns table (
  id             uuid,
  customer_name  text,
  customer_email text,
  customer_phone text,
  persons        int,
  starts_at      timestamptz,
  ends_at        timestamptz,
  created_at     timestamptz
)
language sql stable security definer set search_path = public as $$
  select w.id, w.customer_name, w.customer_email, w.customer_phone,
         w.persons, w.starts_at, w.ends_at, w.created_at
  from waitlist_requests w
  where w.location_id = p_location_id
    and w.status = 'waiting'
    and w.starts_at < p_ends_at
    and w.ends_at   > p_starts_at
  -- Longest-waiting first: the only fair order when the slot is first-come.
  order by w.created_at;
$$;

revoke all on function waitlist_matches(uuid, timestamptz, timestamptz) from public, anon;
grant execute on function waitlist_matches(uuid, timestamptz, timestamptz)
  to authenticated, service_role;

-- Record of what was offered, so the same slot is not announced twice ---------
--
-- The status column already has 'notified', but it says nothing about WHICH
-- slot the person was told about. Without that, a second cancellation at the
-- same venue would either skip everyone already notified once (wrong) or mail
-- them again about a slot they had already declined (also wrong).
create table if not exists waitlist_offers (
  id           uuid primary key default gen_random_uuid(),
  waitlist_id  uuid not null references waitlist_requests (id) on delete cascade,
  booking_id   uuid references bookings (id) on delete set null,
  starts_at    timestamptz not null,
  ends_at      timestamptz not null,
  sent_at      timestamptz not null default now(),
  sent_by      uuid references profiles (id) on delete set null
);

-- One announcement per waiting person per freed slot. This is the duplicate
-- guard, and it is a constraint rather than a check in the application because
-- two staff members can press the button at the same moment.
create unique index if not exists waitlist_offers_once
  on waitlist_offers (waitlist_id, starts_at, ends_at);

create index if not exists idx_waitlist_offers_waitlist on waitlist_offers (waitlist_id);

alter table waitlist_offers enable row level security;

create policy waitlist_offers_read on waitlist_offers for select using (
  exists (
    select 1 from waitlist_requests w
    where w.id = waitlist_offers.waitlist_id
      and can_at('bookings.read', w.location_id)
  )
);

create policy waitlist_offers_write on waitlist_offers for all using (
  exists (
    select 1 from waitlist_requests w
    where w.id = waitlist_offers.waitlist_id
      and can_at('waitlist.manage', w.location_id)
  )
) with check (
  exists (
    select 1 from waitlist_requests w
    where w.id = waitlist_offers.waitlist_id
      and can_at('waitlist.manage', w.location_id)
  )
);

grant select, insert, update, delete on waitlist_offers to authenticated;
grant all on waitlist_offers to service_role;

-- The wording, editable at /admin/mail-templates like every other mail --------
insert into mail_templates (key, subject_de, subject_en, body_de, body_en) values
(
  'waitlist_slot_free',
  'Ein Termin ist frei geworden — {{locationName}}',
  'A slot has opened up — {{locationName}}',
  'Hallo {{customerName}},

Sie stehen bei uns auf der Warteliste für die {{locationName}}.

Für den folgenden Zeitraum ist gerade ein Termin frei geworden:

{{slotLine}}

Wenn der Termin für Sie passt, buchen Sie ihn hier direkt:

{{bookingLink}}

Bitte beachten Sie: Der Termin ist nicht für Sie reserviert. Es gilt, wer
zuerst bucht. Andere Personen von der Warteliste haben dieselbe Nachricht
erhalten.

Viele Grüße
KidBike e.V.',
  'Hello {{customerName}},

you are on our waiting list for {{locationName}}.

A slot has just become available:

{{slotLine}}

If it suits you, you can book it directly here:

{{bookingLink}}

Please note: the slot is not reserved for you. Whoever books first gets it —
everyone on the waiting list received this same message.

Kind regards
KidBike e.V.'
)
on conflict (key) do nothing;
