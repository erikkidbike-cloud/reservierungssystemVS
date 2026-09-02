import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  canTransition,
  transitionFor,
  allowedActions,
  isActive,
  isTerminal,
} from '../src/booking-state.ts';

test('happy path is fully connected', () => {
  assert.ok(canTransition('requested', 'approve'));
  assert.ok(canTransition('approved', 'send_agreement'));
  assert.ok(canTransition('agreement_sent', 'sign'));
  assert.ok(canTransition('signed', 'mark_paid'));
  assert.ok(canTransition('paid', 'confirm'));
  assert.ok(canTransition('confirmed', 'complete'));
});

test('illegal transitions are rejected', () => {
  assert.equal(canTransition('requested', 'confirm'), false);
  assert.equal(canTransition('completed', 'cancel'), false);
  assert.equal(canTransition('rejected', 'approve'), false);
});

test('transitionFor returns the target and effect', () => {
  const t = transitionFor('paid', 'confirm');
  assert.equal(t?.to, 'confirmed');
  assert.match(t!.effect, /caretaker/);
});

test('a requested hold can be approved, rejected or expired', () => {
  assert.deepEqual(allowedActions('requested').sort(), ['approve', 'expire', 'reject']);
});

test('active vs terminal classification', () => {
  assert.ok(isActive('confirmed'));
  assert.ok(!isActive('cancelled'));
  assert.ok(isTerminal('expired'));
  assert.ok(!isTerminal('requested'));
});

test('no transition escapes a terminal status', () => {
  for (const s of ['completed', 'rejected', 'expired', 'cancelled', 'postponed'] as const) {
    assert.deepEqual(allowedActions(s), []);
  }
});
