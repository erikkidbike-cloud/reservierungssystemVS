-- 0002_enums.sql
-- Domain enums. Locations are intentionally NOT an enum (they are a table) so a
-- fourth location is data, not a migration.

create type online_bookability as enum ('online', 'phone_only', 'offline');

create type tariff_type as enum ('standard', 'kita_schule', 'nachweis');

create type app_role as enum ('admin', 'location_manager', 'staff', 'finance', 'hausmeister');

create type booking_status as enum (
  'requested',
  'approved',
  'agreement_sent',
  'signed',
  'paid',
  'confirmed',
  'completed',
  'rejected',
  'expired',
  'cancelled',
  'postponed'
);

create type booking_source as enum ('public_form', 'internal', 'import');

create type experience_rating as enum ('do_not_rent', 'negative', 'neutral', 'positive');

create type task_type as enum ('open_venue', 'close_venue', 'return_deposit', 'send_agreement', 'other');

create type task_status as enum ('open', 'done', 'cancelled');

create type document_type as enum ('nutzungsvereinbarung', 'sammel_nutzungsvereinbarung');

create type document_status as enum ('draft', 'sent', 'signed');

create type block_kind as enum ('project', 'maintenance', 'training', 'other');
