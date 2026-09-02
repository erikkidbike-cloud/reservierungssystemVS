// Time/booking validation. Ports violatesClosing (index.html:1562),
// minStartDate (1558), the 30-minute minimum and overlap helper (1559, 1645).
// Config-driven so it works for any location and runs server-side too — the
// current system only validates in the browser.

import { minutesOfDay, crossesMidnight } from './time.ts';

export interface LocationRules {
  /** WE = 22; null = no closing hour. */
  closingHour: number | null;
  minLeadDays: number; // 7
  minDurationMinutes: number; // 30
}

/** Overlap test: [aStart,aEnd) intersects [bStart,bEnd). */
export function overlaps(aStart: Date, aEnd: Date, bStart: Date, bEnd: Date): boolean {
  return aStart < bEnd && aEnd > bStart;
}

/** Earliest allowed start: today + minLeadDays, at local midnight. */
export function minStartDate(minLeadDays: number, now: Date = new Date()): Date {
  const d = new Date(now);
  d.setDate(d.getDate() + minLeadDays);
  d.setHours(0, 0, 0, 0);
  return d;
}

/**
 * Closing-rule violation (hard block). Only applies where closingHour is set.
 * Violates when: crosses midnight, or start >= closing, or end > closing, or
 * start before 06:00.
 */
export function violatesClosing(closingHour: number | null, start: Date, end: Date): boolean {
  if (closingHour === null) return false;
  const limitMin = closingHour * 60;
  if (crossesMidnight(start, end)) return true;
  if (minutesOfDay(start) >= limitMin) return true;
  if (minutesOfDay(end) > limitMin) return true;
  if (minutesOfDay(start) < 6 * 60) return true;
  return false;
}

export type ValidationCode =
  | 'invalid_range'
  | 'too_short'
  | 'too_soon'
  | 'closing_violation'
  | 'overlap';

export interface ValidationResult {
  ok: boolean;
  errors: ValidationCode[];
}

export interface ValidateRequestInput {
  start: Date;
  end: Date;
  rules: LocationRules;
  /** Existing busy ranges (bookings + holds) to check overlap against. */
  busy?: Array<{ start: Date; end: Date }>;
  now?: Date;
}

/**
 * Full request validation, mirroring validateTimes' time checks. Returns all
 * failing codes (not just the first) so the UI can show them together. Contact/
 * address/email checks are UI-layer concerns and not included here.
 */
export function validateRequest(input: ValidateRequestInput): ValidationResult {
  const { start, end, rules, busy = [], now } = input;
  const errors: ValidationCode[] = [];

  if (!start || !end || end.getTime() <= start.getTime()) {
    return { ok: false, errors: ['invalid_range'] };
  }
  if (end.getTime() - start.getTime() < rules.minDurationMinutes * 60000) {
    errors.push('too_short');
  }
  if (start < minStartDate(rules.minLeadDays, now)) {
    errors.push('too_soon');
  }
  if (violatesClosing(rules.closingHour, start, end)) {
    errors.push('closing_violation');
  }
  if (busy.some((b) => overlaps(start, end, b.start, b.end))) {
    errors.push('overlap');
  }

  return { ok: errors.length === 0, errors };
}
