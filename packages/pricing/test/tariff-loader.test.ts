import { test } from 'node:test';
import assert from 'node:assert/strict';
import { parseTariffConfig, TariffConfigError } from '../src/tariff-loader.ts';
import { computePrice } from '../src/pricing.ts';
import { WE_STANDARD, WA_STANDARD, WI_STANDARD } from '../src/config.ts';

const D = (m: number, d: number, h: number, min = 0) => new Date(2026, m - 1, d, h, min);

// Round-tripping the shipped configs through JSON (as Postgres would return
// them) must yield configs that price identically.
test('round-trips the WE config through JSON unchanged', () => {
  const parsed = parseTariffConfig(JSON.parse(JSON.stringify(WE_STANDARD)));
  assert.deepEqual(parsed, WE_STANDARD);
});

test('round-trips WA and WI configs unchanged', () => {
  assert.deepEqual(parseTariffConfig(JSON.parse(JSON.stringify(WA_STANDARD))), WA_STANDARD);
  assert.deepEqual(parseTariffConfig(JSON.parse(JSON.stringify(WI_STANDARD))), WI_STANDARD);
});

test('a DB-loaded config prices identically to the in-code config', () => {
  const fromDb = parseTariffConfig(JSON.parse(JSON.stringify(WE_STANDARD)));
  const req = { start: D(1, 7, 10), end: D(1, 7, 14), persons: 60, extras: ['grill'] };
  assert.deepEqual(computePrice(req, fromDb), computePrice(req, WE_STANDARD));
});

test('tiers are sorted ascending even when the DB returns them out of order', () => {
  const shuffled = {
    ...JSON.parse(JSON.stringify(WE_STANDARD)),
    durationTiers: [
      { maxMin: 1440, hoursLabel: 24, base: 360 },
      { maxMin: 240, hoursLabel: 4, base: 100 },
      { maxMin: 720, hoursLabel: 12, base: 220 },
    ],
    personTiers: [
      { max: 100, mult: 2.0 },
      { max: 30, mult: 1.0 },
    ],
  };
  const cfg = parseTariffConfig(shuffled);
  assert.deepEqual(cfg.durationTiers.map((t) => t.maxMin), [240, 720, 1440]);
  assert.deepEqual(cfg.personTiers!.map((t) => t.max), [30, 100]);
  // and it prices off the correct (smallest matching) tier
  const r = computePrice({ start: D(1, 7, 10), end: D(1, 7, 14), persons: 10 }, cfg);
  assert.equal(r.base, 100);
});

// --- rejection cases --------------------------------------------------------

const bad: Array<[string, unknown, RegExp]> = [
  ['not an object', 42, /must be an object/],
  ['unknown model', { ...WE_STANDARD, model: 'guesswork' }, /unknown model/],
  ['empty durationTiers', { ...WE_STANDARD, durationTiers: [] }, /must not be empty/],
  ['non-numeric base', {
    ...WE_STANDARD,
    durationTiers: [{ maxMin: 240, hoursLabel: 4, base: '100' }],
  }, /durationTiers\[0\]\.base must be a finite number/],
  ['zero maxMin', {
    ...WE_STANDARD,
    durationTiers: [{ maxMin: 0, hoursLabel: 4, base: 100 }],
  }, /maxMin must be > 0/],
  ['unknown surcharge type', {
    ...WE_STANDARD,
    surcharge: { type: 'sometimes' },
  }, /unknown surcharge\.type/],
  ['malformed window time', {
    ...WE_STANDARD,
    surcharge: { type: 'window_or_weekend', amount: 35, windowStart: '9am', windowEnd: '17:30' },
  }, /windowStart must be "HH:MM"/],
  ['unknown caution type', { ...WE_STANDARD, caution: { type: 'maybe' } }, /unknown caution\.type/],
  ['duplicate extra id', {
    ...WE_STANDARD,
    extras: [
      { id: 'grill', price: 10, labelDe: 'Grill', labelEn: 'Grill' },
      { id: 'grill', price: 12, labelDe: 'Grill 2', labelEn: 'Grill 2' },
    ],
  }, /duplicate extra id/],
  ['multiplier model without personTiers', {
    ...WE_STANDARD,
    personTiers: undefined,
  }, /personTiers must be an array/],
];

for (const [label, input, pattern] of bad) {
  test(`rejects: ${label}`, () => {
    assert.throws(() => parseTariffConfig(input), (err: unknown) => {
      assert.ok(err instanceof TariffConfigError, `expected TariffConfigError, got ${err}`);
      assert.match((err as Error).message, pattern);
      return true;
    });
  });
}

test('rejects a person-band config whose band is missing a duration tier', () => {
  const broken = {
    ...JSON.parse(JSON.stringify(WA_STANDARD)),
    personBands: [
      { max: 45, addByTier: { '12': 0, '16': 0 } },
      { max: 9999, addByTier: { '12': 80 } }, // missing the 16h entry
    ],
  };
  assert.throws(() => parseTariffConfig(broken), /missing an entry for tier "16"/);
});

test('bikePricePerUnit is optional and preserved', () => {
  const withBikes = parseTariffConfig(JSON.parse(JSON.stringify(WE_STANDARD)));
  assert.equal(withBikes.bikePricePerUnit, 1);
  const withoutBikes = parseTariffConfig(JSON.parse(JSON.stringify(WI_STANDARD)));
  assert.equal(withoutBikes.bikePricePerUnit, undefined);
});
