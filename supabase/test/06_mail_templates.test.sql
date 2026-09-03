-- 06_mail_templates.test.sql
-- RLS for mail_templates (0013_mail_templates.sql): read for any signed-in
-- user, write for admin only.
--
-- Self-contained test identities (each *.test.sql file runs as its own psql
-- session — a temporary table from another file would not survive here).

select assert_eq((select count(*)::int from mail_templates), 7, 'all 7 mail templates seeded');

do $$
declare admin_id uuid; staff_id uuid;
begin
  insert into auth.users (email) values ('mt-admin@example.com') returning id into admin_id;
  insert into auth.users (email) values ('mt-staff@example.com') returning id into staff_id;
  update profiles set role = 'admin' where id = admin_id;
  -- staff is the default role handle_new_user() assigns; nothing to change.

  perform set_config('request.jwt.claim.sub', staff_id::text, false);
  set local role authenticated;
  perform assert_eq((select count(*)::int from mail_templates), 7, 'staff can read mail_templates');

  update mail_templates set subject_de = 'hacked' where key = 'approved';
  perform assert_eq(
    (select count(*)::int from mail_templates where subject_de = 'hacked'), 0,
    'staff write is silently rejected by RLS (no rows matched)');
  reset role;

  perform set_config('request.jwt.claim.sub', admin_id::text, false);
  set local role authenticated;
  update mail_templates set subject_de = 'Admin-Betreff' where key = 'approved';
  perform assert_eq(
    (select subject_de from mail_templates where key = 'approved'), 'Admin-Betreff',
    'admin can edit a mail template');
  reset role;
end $$;

\echo '--- all mail template tests passed ---'
