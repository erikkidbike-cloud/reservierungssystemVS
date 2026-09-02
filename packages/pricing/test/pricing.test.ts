// Pins the pricing engine to the live front-end behaviour
// (index.html:2191-2435). Dates use the LOCAL constructor new Date(y, mIdx, d,
// h, min) so the suite is timezone-independent (see src/time.ts). Anchor dates:
//   2026-01-05 Mon · 01-06 Tue · 01-07 Wed · 01-02 Fri · 01-03 Sat · 01-04 Sun.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { computePrice } from '../src/pricing.ts';
import { WE_STANDARD, WI_STANDARD, WA_STANDARD } from '../src/config.ts';

const D = (m: number, d: number, h: number, min = 0) => new Date(2026, m - 1, d, h, min);

// --- WE: multiplier model ---------------------------------------------------

test('WE 4h, weekday within window, ≤30 persons → base 100, no surcharge, no caution', () => {
  const r = computePrice({ start: D(1, 7, 10), end: D(1, 7, 14), persons: 20 }, WE_STANDARD);
  assert.equal(r.onRequest, false);
  assert.equal(r.tierHours, 4);
  assert.equal(r.base, 100);
  assert.equal(r.personsMultiplier, 1);
  assert.equal(r.timeSurcharge, 0);
  assert.equal(r.total, 100);
  assert.equal(r.caution, null);
});

test('WE start before 09:00 → 35 surcharge and 200 caution (outside window)', () => {
  const r = computePrice({ start: D(1, 7, 8), end: D(1, 7, 12), persons: 20 }, WE_STANDARD);
  assert.equal(r.timeSurcharge, 35);
  assert.equal(r.total, 135);
  assert.equal(r.caution, 200); // ≤50 but not inside window → "otherwise" 200
});

test('WE Saturday within window → 35 weekend surcharge, but caution stays null (only Sunday matters)', () => {
  const r = computePrice({ start: D(1, 3, 10), end: D(1, 3, 14), persons: 20 }, WE_STANDARD);
  assert.equal(r.timeSurcharge, 35);
  assert.equal(r.total, 135);
  assert.equal(r.caution, null);
});

test('WE 51+ persons within window → mult 1.75 and 200 caution', () => {
  const r = computePrice({ start: D(1, 7, 10), end: D(1, 7, 14), persons: 60 }, WE_STANDARD);
  assert.equal(r.personsMultiplier, 1.75);
  assert.equal(r.total, 175);
  assert.equal(r.caution, 200);
});

test('WE >100 persons → price on request, caution still computed', () => {
  const r = computePrice({ start: D(1, 7, 10), end: D(1, 7, 14), persons: 120 }, WE_STANDARD);
  assert.equal(r.onRequest, true);
  assert.equal(r.total, null);
  assert.equal(r.caution, 200);
});

test('WE extras + bikes add to the total', () => {
  const r = computePrice(
    { start: D(1, 7, 10), end: D(1, 7, 14), persons: 20, extras: ['parcours', 'grill'], bikes: { lauf: 2, r16: 3 } },
    WE_STANDARD,
  );
  assert.equal(r.extrasCost, 25); // 10 + 10 + 5 bikes * 1
  assert.equal(r.bikeCount, 5);
  assert.equal(r.total, 125);
  assert.ok(r.extrasSelected.includes('Fahrradparcours'));
  assert.ok(r.extrasSelected.some((s) => s.includes('Kinderfahrrad')));
});

test('WE runs past 22:00 (crosses midnight) → 500 caution', () => {
  const r = computePrice({ start: D(1, 5, 18), end: D(1, 6, 2), persons: 20 }, WE_STANDARD);
  assert.equal(r.caution, 500);
});

test('WE duration tiers select the right base', () => {
  const cases: Array<[number, number, number]> = [
    // [durationMinutes, expectedTierHours, expectedBase]
    [240, 4, 100],
    [360, 6, 130],
    [480, 8, 160],
    [600, 10, 190],
    [720, 12, 220],
    [960, 16, 280],
    [1440, 24, 360],
  ];
  for (const [mins, hours, base] of cases) {
    const start = D(1, 7, 6, 0);
    const end = new Date(start.getTime() + mins * 60000);
    const r = computePrice({ start, end, persons: 10 }, WE_STANDARD);
    assert.equal(r.tierHours, hours, `tier for ${mins}min`);
    assert.equal(r.base, base, `base for ${mins}min`);
  }
});

test('WE duration beyond 24h → price on request', () => {
  const start = D(1, 5, 6);
  const end = new Date(start.getTime() + 1500 * 60000); // 25h
  const r = computePrice({ start, end, persons: 10 }, WE_STANDARD);
  assert.equal(r.onRequest, true);
  assert.equal(r.total, null);
});

// --- WI: multiplier model, no extras, no caution ---------------------------

test('WI 60 persons 4h → 175, caution null', () => {
  const r = computePrice({ start: D(1, 7, 10), end: D(1, 7, 14), persons: 60 }, WI_STANDARD);
  assert.equal(r.total, 175);
  assert.equal(r.caution, null);
});

// --- WA: person-band model --------------------------------------------------

test('WA 10h, ≤45 persons → tier 12 base 140, +0, caution 50', () => {
  const r = computePrice({ start: D(1, 7, 10), end: D(1, 7, 20), persons: 30 }, WA_STANDARD);
  assert.equal(r.tierHours, 12);
  assert.equal(r.base, 140);
  assert.equal(r.personsDelta, 0);
  assert.equal(r.total, 140);
  assert.equal(r.timeSurcharge, 0); // WA never has a surcharge
  assert.equal(r.caution, 50);
  assert.equal(r.personsLabel, '≤45');
});

test('WA 10h, ≥46 persons → tier 12 +80 = 220, caution 70', () => {
  const r = computePrice({ start: D(1, 7, 10), end: D(1, 7, 20), persons: 60 }, WA_STANDARD);
  assert.equal(r.base, 140);
  assert.equal(r.personsDelta, 80);
  assert.equal(r.total, 220);
  assert.equal(r.caution, 70);
  assert.equal(r.personsLabel, '≥46');
});

test('WA 16h, ≥46 persons → tier 16 base 200 +110 = 310', () => {
  const r = computePrice({ start: D(1, 7, 6), end: D(1, 7, 22), persons: 60 }, WA_STANDARD);
  assert.equal(r.tierHours, 16);
  assert.equal(r.base, 200);
  assert.equal(r.personsDelta, 110);
  assert.equal(r.total, 310);
});

test('WA beyond 16h → price on request, caution by persons', () => {
  const start = D(1, 5, 6);
  const end = new Date(start.getTime() + 1000 * 60000); // >960
  const r = computePrice({ start, end, persons: 60 }, WA_STANDARD);
  assert.equal(r.onRequest, true);
  assert.equal(r.total, null);
  assert.equal(r.caution, 70);
});

// --- Invalid input ----------------------------------------------------------

test('end <= start → price on request, no caution', () => {
  const r = computePrice({ start: D(1, 7, 14), end: D(1, 7, 10), persons: 20 }, WE_STANDARD);
  assert.equal(r.onRequest, true);
  assert.equal(r.total, null);
});
