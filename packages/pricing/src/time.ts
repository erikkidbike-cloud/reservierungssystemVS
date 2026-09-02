// Small time helpers. All use LOCAL date getters, mirroring the browser code.
// The engine and its tests are timezone-independent as long as callers build
// Date objects with the local constructor `new Date(y, mIndex, d, h, min)` and
// read them with local getters (which this module does): getHours() returns the
// same wall-clock hour the Date was constructed with, in any runner timezone.
// In production, construct booking Dates in Europe/Berlin wall-clock time.

/** Minutes since local midnight. */
export function minutesOfDay(dt: Date): number {
  return dt.getHours() * 60 + dt.getMinutes();
}

/** Parse "HH:MM" to minutes since midnight. */
export function parseHmToMinutes(hm: string): number {
  const [h, m] = hm.split(':').map(Number);
  return h * 60 + (m || 0);
}

/** True if start and end fall on different calendar days (crosses midnight). */
export function crossesMidnight(start: Date, end: Date): boolean {
  return start.toDateString() !== end.toDateString();
}

/** True if any calendar day the range touches is a Saturday or Sunday. */
export function touchesWeekend(start: Date, end: Date): boolean {
  const cur = new Date(start);
  cur.setHours(0, 0, 0, 0);
  const endDay = new Date(end);
  endDay.setHours(23, 59, 59, 999);
  while (cur <= endDay) {
    const d = cur.getDay();
    if (d === 0 || d === 6) return true;
    cur.setDate(cur.getDate() + 1);
  }
  return false;
}

/** True if any calendar day the range touches is a Sunday. */
export function touchesSunday(start: Date, end: Date): boolean {
  const cur = new Date(start);
  cur.setHours(0, 0, 0, 0);
  const endDay = new Date(end);
  endDay.setHours(23, 59, 59, 999);
  while (cur <= endDay) {
    if (cur.getDay() === 0) return true;
    cur.setDate(cur.getDate() + 1);
  }
  return false;
}

/** Whole minutes between two dates. */
export function durationMinutes(start: Date, end: Date): number {
  return Math.round((end.getTime() - start.getTime()) / 60000);
}
