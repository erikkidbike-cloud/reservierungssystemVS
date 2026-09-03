-- 0013_mail_templates.sql
-- Editable email wording. Mirrors agreement_clauses' shape and intent exactly
-- (0008_agreements.sql): the text customers actually receive should be
-- editable with no deploy, not a constant baked into the TypeScript.
--
-- {{placeholders}} are filled by apps/web/lib/mail-vars.ts at send time — see
-- that file for the full variable list per template key. A template row
-- missing a placeholder just renders it blank; there is no validation here
-- that every placeholder used in a template body actually exists, the same
-- trade-off agreement_clauses makes for its merge fields.
create table mail_templates (
  key         text primary key,
  subject_de  text not null,
  subject_en  text not null,
  body_de     text not null,
  body_en     text not null,
  updated_by  uuid references profiles (id),
  updated_at  timestamptz not null default now()
);
create trigger trg_mail_templates_updated before update on mail_templates
  for each row execute function set_updated_at();

alter table mail_templates enable row level security;

-- Readable by any signed-in user (the compose-before-send screen needs to
-- render the current template for any staff role that can trigger a
-- transition); writable by admin only — wording is a brand/legal concern
-- shared across every location, unlike agreement_clauses which is
-- per-location and so lets location_manager edit their own.
create policy mail_templates_read  on mail_templates for select using (auth.uid() is not null);
create policy mail_templates_write on mail_templates for all using (is_admin()) with check (is_admin());
