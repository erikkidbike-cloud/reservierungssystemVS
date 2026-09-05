-- check-schema.sql — "which migrations does this database actually have?"
--
-- Paste the whole file into the Supabase SQL editor and Run. It changes
-- nothing; it only reports. Safe on any version of this schema, including one
-- where almost nothing has been applied yet.
--
-- WHY THIS EXISTS
-- ---------------
-- Nothing recorded which migrations had run, so the only way to find out was
-- to use the app and read the errors — which is how a database ended up seven
-- migrations behind without anyone noticing, with the console reporting five
-- unrelated-looking faults on five different screens.
--
-- WHY IT PROBES INSTEAD OF KEEPING A LEDGER
-- -----------------------------------------
-- A `schema_migrations` table records INTENT: "somebody ran this file." This
-- checks REALITY: "the thing that file creates is present." Those differ in
-- exactly the case that matters most — a migration that aborted halfway leaves
-- a ledger entry saying it succeeded. That has already happened once in this
-- project (0014 aborted on a missing function and left the waitlist table
-- uncreated), so reality is the thing worth measuring.
--
-- Each row below names one migration and the object that file is responsible
-- for creating. Missing object = that file has not run, or did not finish.

with expected(ord, migration, object_kind, present) as (values
  (1,  '0001_extensions',              'extension btree_gist',
       exists (select 1 from pg_extension where extname = 'btree_gist')),
  (2,  '0002_enums',                   'type booking_status',
       to_regtype('public.booking_status') is not null),
  (3,  '0003_core_tables',             'table bookings',
       to_regclass('public.bookings') is not null),
  (4,  '0004_constraints_indexes',     'constraint bookings_no_overlap',
       exists (select 1 from pg_constraint where conname = 'bookings_no_overlap')),
  (5,  '0005_rls',                     'function has_location()',
       exists (select 1 from pg_proc p join pg_namespace n on n.oid = p.pronamespace
               where n.nspname = 'public' and p.proname = 'has_location')),
  (6,  '0006_views',                   'view public_availability',
       to_regclass('public.public_availability') is not null),
  (7,  '0007_functions',               'function create_booking_request()',
       exists (select 1 from pg_proc p join pg_namespace n on n.oid = p.pronamespace
               where n.nspname = 'public' and p.proname = 'create_booking_request')),
  (8,  '0008_agreements',              'table agreement_clauses',
       to_regclass('public.agreement_clauses') is not null),
  (9,  '0009_grants',                  'service_role can read locations',
       coalesce(has_table_privilege('service_role', 'public.locations', 'select'), false)),
  (10, '0010_reference_and_tasks',     'function generate_verwendungszweck()',
       exists (select 1 from pg_proc p join pg_namespace n on n.oid = p.pronamespace
               where n.nspname = 'public' and p.proname = 'generate_verwendungszweck')),
  (11, '0011_storage_buckets',         'bucket signed-documents',
       exists (select 1 from storage.buckets where id = 'signed-documents')),
  (12, '0012_events',                  'column projects.sort_order',
       exists (select 1 from information_schema.columns
               where table_schema = 'public' and table_name = 'projects'
                 and column_name = 'sort_order')),
  (13, '0013_mail_templates',          'table mail_templates',
       to_regclass('public.mail_templates') is not null),
  (14, '0014_enhancements',            'table waitlist_requests',
       to_regclass('public.waitlist_requests') is not null),
  (15, '0015_reminders_ical_ratelimit','table reminder_rules',
       to_regclass('public.reminder_rules') is not null),
  (16, '0016_roles_permissions',       'table roles',
       to_regclass('public.roles') is not null),
  (17, '0017_waitlist_offers',         'table waitlist_offers',
       to_regclass('public.waitlist_offers') is not null),
  (18, '0018_occupancy',               'function occupancy_by_month()',
       exists (select 1 from pg_proc p join pg_namespace n on n.oid = p.pronamespace
               where n.nspname = 'public' and p.proname = 'occupancy_by_month'))
)
select
  case when present then 'ok      ' else '>> FEHLT' end as status,
  migration,
  object_kind as "erwartetes Objekt"
from expected
order by ord;

-- One-line summary, so a long list does not have to be read row by row.
with expected(ord, present) as (values
  (1,  exists (select 1 from pg_extension where extname = 'btree_gist')),
  (2,  to_regtype('public.booking_status') is not null),
  (3,  to_regclass('public.bookings') is not null),
  (4,  exists (select 1 from pg_constraint where conname = 'bookings_no_overlap')),
  (5,  exists (select 1 from pg_proc p join pg_namespace n on n.oid = p.pronamespace
               where n.nspname = 'public' and p.proname = 'has_location')),
  (6,  to_regclass('public.public_availability') is not null),
  (7,  exists (select 1 from pg_proc p join pg_namespace n on n.oid = p.pronamespace
               where n.nspname = 'public' and p.proname = 'create_booking_request')),
  (8,  to_regclass('public.agreement_clauses') is not null),
  (9,  coalesce(has_table_privilege('service_role', 'public.locations', 'select'), false)),
  (10, exists (select 1 from pg_proc p join pg_namespace n on n.oid = p.pronamespace
               where n.nspname = 'public' and p.proname = 'generate_verwendungszweck')),
  (11, exists (select 1 from storage.buckets where id = 'signed-documents')),
  (12, exists (select 1 from information_schema.columns
               where table_schema = 'public' and table_name = 'projects'
                 and column_name = 'sort_order')),
  (13, to_regclass('public.mail_templates') is not null),
  (14, to_regclass('public.waitlist_requests') is not null),
  (15, to_regclass('public.reminder_rules') is not null),
  (16, to_regclass('public.roles') is not null),
  (17, to_regclass('public.waitlist_offers') is not null),
  (18, exists (select 1 from pg_proc p join pg_namespace n on n.oid = p.pronamespace
               where n.nspname = 'public' and p.proname = 'occupancy_by_month'))
)
select
  count(*) filter (where present)     as "vorhanden",
  count(*) filter (where not present) as "fehlend",
  coalesce(min(ord) filter (where not present)::text, 'keine — alles aktuell')
    as "ab dieser Nummer weiterlaufen lassen"
from expected;
