-- 0004_constraints_indexes.sql
-- The server-side overlap guard and supporting indexes.

-- No two ACTIVE bookings at the same location may overlap in time. This is the
-- structural fix for the current browser-only overlap check: two simultaneous
-- requests for the same slot can no longer both succeed. Terminal / freed
-- statuses (rejected, expired, cancelled, postponed) are excluded so a released
-- slot is immediately bookable again.
alter table bookings
  add constraint bookings_no_overlap
  exclude using gist (
    location_id with =,
    during      with &&
  )
  where (status in ('requested','approved','agreement_sent','signed','paid','confirmed'));

-- Common lookups.
create index idx_bookings_location_time on bookings (location_id, starts_at);
create index idx_bookings_status        on bookings (status);
create index idx_bookings_customer      on bookings (customer_id);
create index idx_bookings_hold_expiry   on bookings (hold_expires_at)
  where status = 'requested';

-- Range indexes for availability queries and block overlap checks.
create index idx_bookings_during on bookings using gist (during);
create index idx_blocks_during   on blocks   using gist (during);
create index idx_blocks_location on blocks (location_id, starts_at);
