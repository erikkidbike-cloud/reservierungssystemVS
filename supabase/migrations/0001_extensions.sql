-- 0001_extensions.sql
-- Required Postgres extensions.
--   pgcrypto   : gen_random_uuid()
--   btree_gist : lets us combine equality (location_id) with range overlap
--                (during &&) in one GiST exclusion constraint — the server-side
--                overlap guard on bookings.

create extension if not exists pgcrypto;
create extension if not exists btree_gist;
