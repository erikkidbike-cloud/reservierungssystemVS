// Berlin wall-clock helpers shared by the public booking wizard (browser) and
// its supporting server code. Deliberately has zero dependencies so it is
// cheap to bundle into the client.
//
// Two different techniques are used here on purpose, for two different needs:
//
// - `parseLocalDateTime` builds a Date from a naive "YYYY-MM-DDTHH:mm" string
//   using the multi-argument LOCAL constructor, exactly like
//   lib/booking-pricing.ts's parseBerlinLocal. Reading it back with local
//   getters (getHours() etc.) then yields the same wall-clock numbers on any
//   machine, regardless of that machine's actual timezone — which is exactly
//   why this is safe to run in a visitor's browser and still agree with the
//   server (which always runs with TZ=Europe/Berlin, see .env.example) on
//   things like "is this after 22:00" or "does this fall on a weekend". The
//   naive string itself — never a Date — is what gets POSTed to the API route,
//   so no timezone conversion ever has to round-trip correctly; both sides
//   independently interpret the same digits as Berlin time.
//
// - `berlinPartsOf` reads an actual instant (an ISO timestamp from the
//   database, e.g. a booking's starts_at) and asks specifically what that
//   instant looks like in Europe/Berlin, via Intl — because here the input
//   already has a real timezone (UTC) and must be projected onto Berlin
//   regardless of the visitor's own timezone, the opposite situation from the
//   naive-string case above.

/** Parse "YYYY-MM-DDTHH:mm" (or with a space) as Berlin wall-clock time. */
export function parseLocalDateTime(value: string): Date | null {
  const m = /^(\d{4})-(\d{2})-(\d{2})[T ](\d{2}):(\d{2})/.exec(value);
  if (!m) return null;
  const [, y, mo, d, h, mi] = m;
  const dt = new Date(Number(y), Number(mo) - 1, Number(d), Number(h), Number(mi));
  return Number.isNaN(dt.getTime()) ? null : dt;
}

/** Format a Date built by parseLocalDateTime back into "YYYY-MM-DDTHH:mm". */
export function formatLocalDateTime(d: Date): string {
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

/** "YYYY-MM-DD" for a Date built by parseLocalDateTime / new Date(y,m,d). */
export function formatLocalDate(d: Date): string {
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

/** Add n calendar days to a "YYYY-MM-DD" date string. */
export function addDaysToDateString(date: string, n: number): string {
  const [y, m, d] = date.split('-').map(Number);
  const dt = new Date(y, m - 1, d + n);
  return formatLocalDate(dt);
}

/** Today's date in Berlin as "YYYY-MM-DD", independent of the visitor's timezone. */
export function todayInBerlin(): string {
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'Europe/Berlin' }).format(new Date());
}

/** Minutes since local midnight for an instant, as seen in Europe/Berlin. */
export function berlinMinutesOfDay(iso: string): number {
  const parts = new Intl.DateTimeFormat('en-GB', {
    timeZone: 'Europe/Berlin',
    hour: '2-digit',
    minute: '2-digit',
    hourCycle: 'h23',
  }).formatToParts(new Date(iso));
  const h = Number(parts.find((p) => p.type === 'hour')?.value ?? 0);
  const mi = Number(parts.find((p) => p.type === 'minute')?.value ?? 0);
  return h * 60 + mi;
}

/** The calendar date an instant falls on, as seen in Europe/Berlin ("YYYY-MM-DD"). */
export function berlinDateOf(iso: string): string {
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'Europe/Berlin' }).format(new Date(iso));
}

/**
 * Where a real instant range (e.g. a booking's starts_at/ends_at, both actual
 * UTC timestamps) falls within one visible calendar day, as minutes-of-day in
 * Berlin. A range that starts before the day is clamped to 0; one that ends
 * after it is clamped to 1440 — so a multi-day block still fills the visible
 * day's whole bar instead of drawing nonsense minute numbers.
 *
 * This is advisory only: it feeds the public wizard's day-schedule graphic and
 * its early "this looks free/busy" hint. The actual guarantee against double
 * booking is the database exclusion constraint plus create_booking_request()'s
 * server-side check (see 0004_constraints_indexes.sql, 0007_functions.sql) —
 * nothing client-side, however this function behaves, can create a conflict.
 */
export function clampToDayMinutes(startsAtIso: string, endsAtIso: string, date: string): [number, number] {
  const startMin = berlinDateOf(startsAtIso) < date ? 0 : berlinMinutesOfDay(startsAtIso);
  const endMin = berlinDateOf(endsAtIso) > date ? 24 * 60 : berlinMinutesOfDay(endsAtIso);
  return [startMin, endMin];
}
