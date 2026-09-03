// Shared German labels and formatting for bookings, so the list, the detail
// page and the overview can't drift apart in how they name the same thing.

import type { BookingAction, BookingStatus } from '@vs/domain';

export const STATUS_LABEL: Record<BookingStatus, string> = {
  requested: 'Angefragt',
  approved: 'Bestätigt',
  agreement_sent: 'NV versandt',
  signed: 'Unterschrieben',
  paid: 'Bezahlt',
  confirmed: 'Gebucht',
  completed: 'Abgeschlossen',
  rejected: 'Abgelehnt',
  expired: 'Abgelaufen',
  cancelled: 'Storniert',
  postponed: 'Verschoben',
};

/** Button wording for each transition, from the acting staff member's view. */
export const ACTION_LABEL: Record<BookingAction, string> = {
  approve: 'Bestätigen',
  reject: 'Ablehnen',
  expire: 'Als abgelaufen markieren',
  send_agreement: 'Nutzungsvereinbarung versandt',
  sign: 'Als unterschrieben markieren',
  mark_paid: 'Als bezahlt markieren',
  confirm: 'Endgültig buchen',
  complete: 'Als abgeschlossen markieren',
  cancel: 'Stornieren',
  postpone: 'Verschieben',
};

/** Actions that are destructive or tell the customer bad news. */
export const DESTRUCTIVE_ACTIONS: BookingAction[] = ['reject', 'cancel', 'postpone', 'expire'];

/** Actions where a short reason is worth capturing (and goes into the email). */
export const ACTIONS_WITH_REASON: BookingAction[] = ['reject', 'cancel', 'postpone'];

export function statusBadgeClass(status: BookingStatus): string {
  if (['approved', 'paid', 'confirmed', 'completed', 'signed'].includes(status)) {
    return 'badge badge--ok';
  }
  if (['rejected', 'expired', 'cancelled', 'postponed'].includes(status)) {
    return 'badge badge--warn';
  }
  return 'badge';
}

export function fmtDateTime(iso: string): string {
  return new Intl.DateTimeFormat('de-DE', {
    dateStyle: 'medium',
    timeStyle: 'short',
    timeZone: 'Europe/Berlin',
  }).format(new Date(iso));
}

export function fmtEuro(n: number | null | undefined): string {
  if (n === null || n === undefined) return '–';
  return new Intl.NumberFormat('de-DE', { style: 'currency', currency: 'EUR' }).format(n);
}
