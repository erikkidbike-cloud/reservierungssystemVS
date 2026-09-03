-- 0011_storage_buckets.sql
-- Two private buckets for backlog 3.3 (the signing page): the signed
-- Nutzungsvereinbarung signature image, and an optional ID document upload.
--
-- Both PRIVATE. Nothing here is ever fetched with a public/anon URL — every
-- read and write goes through a server route using adminClient() (service
-- role): app/api/sign/[bookingId]/route.ts writes them at signing time, and a
-- staff-only route reads them back for review. That is also why there is no
-- storage.objects RLS policy: the bucket is simply never reached by anything
-- but the trusted server, the same trust model 0009_grants.sql already applies
-- to locations/tariffs/customers (readable only through a server boundary that
-- has already decided what a caller may see).
insert into storage.buckets (id, name, public)
values ('signed-documents', 'signed-documents', false)
on conflict (id) do nothing;

insert into storage.buckets (id, name, public)
values ('id-uploads', 'id-uploads', false)
on conflict (id) do nothing;
