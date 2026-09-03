import { test } from 'node:test';
import assert from 'node:assert/strict';
import { matchPayments, type PaymentTransaction, type PayableBooking } from '../src/matching.ts';

const booking = (over: Partial<PayableBooking> = {}): PayableBooking => ({
  id: 'b1',
  status: 'signed',
  verwendungszweck: 'FWE041DOLU',
  priceTotal: 130,
  ...over,
});

const tx = (over: Partial<PaymentTransaction> = {}): PaymentTransaction => ({
  id: 't1',
  amount: 130,
  purpose: 'Verwendungszweck FWE041DOLU Miete Verkehrsschule',
  bookedAt: '2026-03-01',
  ...over,
});

test('matches a transaction whose purpose contains the reference and amount agrees', () => {
  const matches = matchPayments([tx()], [booking()]);
  assert.equal(matches.length, 1);
  assert.deepEqual(matches[0], { transactionId: 't1', bookingId: 'b1', amount: 130 });
});

test('ignores whitespace differences in the reference', () => {
  const matches = matchPayments(
    [tx({ purpose: 'FWE 041 DOLU' })],
    [booking()],
  );
  assert.equal(matches.length, 1);
});

test('is case-insensitive', () => {
  const matches = matchPayments([tx({ purpose: 'fwe041dolu' })], [booking()]);
  assert.equal(matches.length, 1);
});

test('rejects an amount mismatch, even with a matching reference', () => {
  const matches = matchPayments([tx({ amount: 100 })], [booking()]);
  assert.equal(matches.length, 0);
});

test('rejects a transaction with no reference in its purpose', () => {
  const matches = matchPayments([tx({ purpose: 'Danke für die Party' })], [booking()]);
  assert.equal(matches.length, 0);
});

test('never proposes a booking that is not "signed"', () => {
  const matches = matchPayments([tx()], [booking({ status: 'paid' })]);
  assert.equal(matches.length, 0);
});

test('skips ambiguous matches rather than guessing', () => {
  const b1 = booking({ id: 'b1', verwendungszweck: 'FWE041DOLU', priceTotal: 130 });
  const b2 = booking({ id: 'b2', verwendungszweck: 'FWE042DOLU', priceTotal: 130 });
  // A purpose text that happens to contain neither reference distinctly is not
  // realistic, but the guard is: two candidates with the SAME reference and
  // amount (e.g. a duplicate booking) must not be resolved by picking one.
  const dup = booking({ id: 'b2', verwendungszweck: 'FWE041DOLU', priceTotal: 130 });
  const matches = matchPayments([tx()], [b1, dup]);
  assert.equal(matches.length, 0);
  void b2;
});

test('does not double-spend one booking across two transactions', () => {
  const matches = matchPayments([tx({ id: 't1' }), tx({ id: 't2' })], [booking()]);
  assert.equal(matches.length, 1);
  assert.equal(matches[0].transactionId, 't1');
});

test('matches multiple independent transactions to their own bookings', () => {
  const b2 = booking({ id: 'b2', verwendungszweck: 'FWA007OXAX', priceTotal: 140 });
  const matches = matchPayments(
    [tx({ id: 't1' }), tx({ id: 't2', amount: 140, purpose: 'Ref FWA007OXAX' })],
    [booking(), b2],
  );
  assert.equal(matches.length, 2);
  assert.deepEqual(
    matches.map((m) => m.bookingId).sort(),
    ['b1', 'b2'],
  );
});

test('a booking with no verwendungszweck is never matched', () => {
  const matches = matchPayments([tx()], [booking({ verwendungszweck: null })]);
  assert.equal(matches.length, 0);
});
