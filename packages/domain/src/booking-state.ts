// Booking state machine. The single definition of which status transitions are
// legal and what each implies. Both the app and any automation should validate
// transitions through canTransition() so the rules can't drift. See
// docs/04-state-machine.md.

export type BookingStatus =
  | 'requested'
  | 'approved'
  | 'agreement_sent'
  | 'signed'
  | 'paid'
  | 'confirmed'
  | 'completed'
  | 'rejected'
  | 'expired'
  | 'cancelled'
  | 'postponed';

export type BookingAction =
  | 'approve'
  | 'reject'
  | 'expire'
  | 'send_agreement'
  | 'sign'
  | 'mark_paid'
  | 'confirm'
  | 'complete'
  | 'cancel'
  | 'postpone';

/** Statuses that occupy a slot (counted by the DB overlap exclusion constraint). */
export const ACTIVE_STATUSES: BookingStatus[] = [
  'requested',
  'approved',
  'agreement_sent',
  'signed',
  'paid',
  'confirmed',
];

/** Terminal statuses — no further transitions. */
export const TERMINAL_STATUSES: BookingStatus[] = [
  'completed',
  'rejected',
  'expired',
  'cancelled',
  'postponed',
];

export interface TransitionDef {
  from: BookingStatus;
  action: BookingAction;
  to: BookingStatus;
  /** Human description of the side effect the app should run on this transition. */
  effect: string;
}

export const TRANSITIONS: TransitionDef[] = [
  { from: 'requested', action: 'approve', to: 'approved', effect: 'generate Nutzungsvereinbarung draft' },
  { from: 'requested', action: 'reject', to: 'rejected', effect: 'notify customer (rejection)' },
  { from: 'requested', action: 'expire', to: 'expired', effect: 'free the slot (hold lapsed)' },

  { from: 'approved', action: 'send_agreement', to: 'agreement_sent', effect: 'email signing link to customer' },
  { from: 'approved', action: 'reject', to: 'rejected', effect: 'notify customer (rejection)' },
  { from: 'approved', action: 'cancel', to: 'cancelled', effect: 'free the slot, notify' },
  { from: 'approved', action: 'postpone', to: 'postponed', effect: 'free the slot; usually a new booking follows' },

  { from: 'agreement_sent', action: 'sign', to: 'signed', effect: 'store signed PDF + signer name/IP; require ID upload if flagged' },
  { from: 'agreement_sent', action: 'cancel', to: 'cancelled', effect: 'free the slot, notify' },
  { from: 'agreement_sent', action: 'postpone', to: 'postponed', effect: 'free the slot' },

  { from: 'signed', action: 'mark_paid', to: 'paid', effect: 'mark payment matched (from SevDesk)' },
  { from: 'signed', action: 'cancel', to: 'cancelled', effect: 'free the slot, notify' },
  { from: 'signed', action: 'postpone', to: 'postponed', effect: 'free the slot' },

  { from: 'paid', action: 'confirm', to: 'confirmed', effect: 'create caretaker open/close tasks; confirmation email' },
  { from: 'paid', action: 'cancel', to: 'cancelled', effect: 'free the slot, notify; deposit/refund handling' },
  { from: 'paid', action: 'postpone', to: 'postponed', effect: 'free the slot' },

  { from: 'confirmed', action: 'complete', to: 'completed', effect: 'create return_deposit task (14-day deadline) if deposit held' },
  { from: 'confirmed', action: 'cancel', to: 'cancelled', effect: 'free the slot, notify; deposit/refund handling' },
  { from: 'confirmed', action: 'postpone', to: 'postponed', effect: 'free the slot' },
];

const INDEX = new Map<string, TransitionDef>(
  TRANSITIONS.map((t) => [`${t.from}:${t.action}`, t]),
);

/** The transition for (status, action), or null if it is not allowed. */
export function transitionFor(from: BookingStatus, action: BookingAction): TransitionDef | null {
  return INDEX.get(`${from}:${action}`) ?? null;
}

export function canTransition(from: BookingStatus, action: BookingAction): boolean {
  return INDEX.has(`${from}:${action}`);
}

/** All actions legal from a given status. */
export function allowedActions(from: BookingStatus): BookingAction[] {
  return TRANSITIONS.filter((t) => t.from === from).map((t) => t.action);
}

export function isActive(status: BookingStatus): boolean {
  return ACTIVE_STATUSES.includes(status);
}

export function isTerminal(status: BookingStatus): boolean {
  return TERMINAL_STATUSES.includes(status);
}
