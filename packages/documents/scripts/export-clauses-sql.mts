#!/usr/bin/env node --experimental-strip-types
// Turns the mechanically-imported clause text (nv-clauses.generated.ts) into a
// one-time SQL seed for the `agreement_clauses` table.
//
// This is an INITIAL import, not a sync: every INSERT is ON CONFLICT (location,
// clause_key) DO NOTHING, so re-running this after re-importing a Word template
// never clobbers edits an admin has since made in /admin/agreements. To pull a
// genuinely updated Word template's wording into the database, either edit the
// affected clauses by hand in the admin UI, or delete that location's rows from
// agreement_clauses and re-run this seed.
//
// Usage (from packages/documents):
//   node --experimental-strip-types scripts/export-clauses-sql.mts \
//     > ../../supabase/seed/nv_clauses.sql

import { NV_CLAUSE_SETS } from '../src/nv-clauses.generated.ts';

function sqlStr(s: string): string {
  return "'" + s.replace(/'/g, "''") + "'";
}

const lines: string[] = [
  '-- nv_clauses.sql',
  '-- GENERATED FILE — do not edit by hand.',
  '-- Produced by packages/documents/scripts/export-clauses-sql.mts from',
  '-- src/nv-clauses.generated.ts (itself extracted from the Word templates by',
  "-- import-nv-docx.py). Seeds each location's INITIAL, editable copy of its",
  '-- Nutzungsvereinbarung into agreement_clauses. Apply AFTER seed.sql (needs',
  '-- the locations to already exist). Every insert is ON CONFLICT DO NOTHING —',
  '-- an edit made later in /admin/agreements is never overwritten by re-seeding.',
  '',
];

for (const [code, clauses] of Object.entries(NV_CLAUSE_SETS)) {
  lines.push(`-- ${code}: ${clauses.length} clauses`);
  clauses.forEach((c, i) => {
    lines.push(
      'insert into agreement_clauses (location_id, clause_key, sort_order, title_de, title_en, body_de, body_en)',
      `select id, ${sqlStr(c.id)}, ${i + 1}, ${sqlStr(c.titleDe)}, ${sqlStr(c.titleEn)}, ${sqlStr(c.bodyDe)}, ${sqlStr(c.bodyEn)}`,
      `from locations where code = ${sqlStr(code)}`,
      'on conflict (location_id, clause_key) do nothing;',
      '',
    );
  });
}

process.stdout.write(lines.join('\n') + '\n');
