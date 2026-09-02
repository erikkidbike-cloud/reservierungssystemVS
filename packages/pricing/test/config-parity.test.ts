// Guards against drift between the code configs (src/config.ts) and the DB seed
// (supabase/seed/seed.sql). If someone edits a price in one place but not the
// other, this fails. The seed inserts WE, then WI, then WA — same order here.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { WE_STANDARD, WI_STANDARD, WA_STANDARD } from '../src/config.ts';

const here = dirname(fileURLToPath(import.meta.url));
const seedPath = join(here, '../../../supabase/seed/seed.sql');
const seed = readFileSync(seedPath, 'utf8');

// Extract each tariff '{ ... }'::jsonb literal. Anchor on the "model" key so we
// don't accidentally match the text[] cc_emails literal ('{}') in the locations
// insert, which would otherwise start a spurious match.
const blocks = [...seed.matchAll(/'(\{\s*"model"[\s\S]*?\})'::jsonb/g)].map((m) => JSON.parse(m[1]));

test('seed.sql contains exactly three tariff configs (WE, WI, WA)', () => {
  assert.equal(blocks.length, 3);
});

test('WE seed config matches WE_STANDARD', () => {
  assert.deepEqual(blocks[0], JSON.parse(JSON.stringify(WE_STANDARD)));
});

test('WI seed config matches WI_STANDARD', () => {
  assert.deepEqual(blocks[1], JSON.parse(JSON.stringify(WI_STANDARD)));
});

test('WA seed config matches WA_STANDARD', () => {
  assert.deepEqual(blocks[2], JSON.parse(JSON.stringify(WA_STANDARD)));
});
