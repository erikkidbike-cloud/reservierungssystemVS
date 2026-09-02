// Pins validation to the live front-end (violatesClosing index.html:1562,
// minStartDate 1558, 30-min minimum, overlap 1645/1559).

import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  violatesClosing,
  minStartDate,
  overlaps,
  validateRequest,
  type LocationRules,
} from '../src/validation.ts';

const D = (m: number, d: number, h: number, min = 0) => new Date(2026, m - 1, d, h, min);
const WE_RULES: LocationRules = { closingHour: 22, minLeadDays: 7, minDurationMinutes: 30 };
const WA_RULES: LocationRules = { closingHour: null, minLeadDays: 7, minDurationMinutes: 30 };

test('violatesClosing: none when no closing hour (WA/WI)', () => {
  assert.equal(violatesClosing(null, D(1, 7, 21), D(1, 7, 23)), false);
});

test('violatesClosing WE: end after 22:00 → true', () => {
  assert.equal(violatesClosing(22, D(1, 7, 20), D(1, 7, 23)), true);
});

test('violatesClosing WE: start at/after 22:00 → true', () => {
  assert.equal(violatesClosing(22, D(1, 7, 22), D(1, 7, 23)), true);
});

test('violatesClosing WE: start before 06:00 → true', () => {
  assert.equal(violatesClosing(22, D(1, 7, 5), D(1, 7, 9)), true);
});

test('violatesClosing WE: crosses midnight → true', () => {
  assert.equal(violatesClosing(22, D(1, 7, 20), D(1, 8, 1)), true);
});

test('violatesClosing WE: normal daytime → false', () => {
  assert.equal(violatesClosing(22, D(1, 7, 10), D(1, 7, 14)), false);
});

test('overlaps: half-open intervals', () => {
  assert.equal(overlaps(D(1, 7, 10), D(1, 7, 12), D(1, 7, 11), D(1, 7, 13)), true);
  assert.equal(overlaps(D(1, 7, 10), D(1, 7, 12), D(1, 7, 12), D(1, 7, 14)), false); // touching, not overlapping
});

test('minStartDate: today + leadDays at midnight', () => {
  const now = D(1, 7, 15, 30);
  const min = minStartDate(7, now);
  assert.equal(min.getFullYear(), 2026);
  assert.equal(min.getMonth(), 0);
  assert.equal(min.getDate(), 14); // 7 + 7
  assert.equal(min.getHours(), 0);
});

test('validateRequest: valid weekday booking passes', () => {
  const now = D(1, 1, 12);
  const res = validateRequest({ start: D(1, 20, 10), end: D(1, 20, 14), rules: WE_RULES, now });
  assert.deepEqual(res, { ok: true, errors: [] });
});

test('validateRequest: too short (<30 min)', () => {
  const now = D(1, 1, 12);
  const res = validateRequest({ start: D(1, 20, 10), end: D(1, 20, 10, 20), rules: WA_RULES, now });
  assert.ok(res.errors.includes('too_short'));
});

test('validateRequest: too soon (inside 7-day lead)', () => {
  const now = D(1, 15, 12);
  const res = validateRequest({ start: D(1, 18, 10), end: D(1, 18, 14), rules: WA_RULES, now });
  assert.ok(res.errors.includes('too_soon'));
});

test('validateRequest: closing violation for WE', () => {
  const now = D(1, 1, 12);
  const res = validateRequest({ start: D(1, 20, 20), end: D(1, 20, 23), rules: WE_RULES, now });
  assert.ok(res.errors.includes('closing_violation'));
});

test('validateRequest: overlap with existing busy range', () => {
  const now = D(1, 1, 12);
  const res = validateRequest({
    start: D(1, 20, 10),
    end: D(1, 20, 14),
    rules: WA_RULES,
    now,
    busy: [{ start: D(1, 20, 12), end: D(1, 20, 16) }],
  });
  assert.ok(res.errors.includes('overlap'));
});
