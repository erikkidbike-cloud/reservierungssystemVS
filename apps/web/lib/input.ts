// Field limits for the anonymous endpoints (/api/booking-request,
// /api/waitlist).
//
// Rate limiting caps how MANY requests arrive; it says nothing about how big
// each one is. Postgres `text` has no length limit, so without this a single
// allowed request can store a multi-megabyte name or message — which is then
// re-read into a staff notification mail, into the Nutzungsvereinbarung, and
// into every admin list that renders it. Five of those an hour is enough to
// make the console unusable and to have Resend start rejecting mail, without
// ever tripping a counter.
//
// The caps are generous on purpose: they exist to stop abuse, not to reject a
// real customer with a long organisation name. Anything over the cap is
// TRUNCATED rather than refused — a booking request is a lead, and losing one
// because someone pasted their whole address into the message box would be a
// worse failure than storing a shortened version of it.

/** Longest sensible value for each kind of field. */
export const LIMITS = {
  /** Names, cities, event types — a line of text. */
  short: 120,
  /** Organisation, street, full address — a long line. */
  medium: 300,
  /** The free-text message a customer writes. */
  message: 4000,
  /** How many extras may be selected at once. */
  listItems: 50,
  /** How many keys a quantity/bike map may carry. */
  mapKeys: 50,
} as const;

/**
 * Trim, cap, and turn an empty result into null.
 *
 * Also strips C0 control characters (except tab and newline): they serve no
 * purpose in a name or an address, and they are what makes a log line or a CSV
 * export lie about its own structure.
 */
export function text(value: unknown, max: number = LIMITS.short): string | null {
  if (typeof value !== 'string') return null;
  const cleaned = value
    // eslint-disable-next-line no-control-regex
    .replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/g, '')
    .trim();
  if (!cleaned) return null;
  return cleaned.slice(0, max);
}

/** Same, but never null — for fields that must carry something. */
export function requiredText(value: unknown, max: number = LIMITS.short): string {
  return text(value, max) ?? '';
}

/**
 * A list of identifiers (extras keys). Anything that is not a short, plain
 * string is dropped rather than stored: these are looked up against the
 * tariff's own extras, so an entry that matches nothing is noise at best.
 */
export function idList(value: unknown, max = LIMITS.listItems): string[] {
  if (!Array.isArray(value)) return [];
  const out: string[] = [];
  for (const item of value) {
    const v = text(item, 64);
    if (v) out.push(v);
    if (out.length >= max) break;
  }
  return out;
}

/**
 * A `{ id: count }` map (bikes, extra quantities). Keys are capped in number
 * and length, values coerced to a finite non-negative integer — so a jsonb
 * column can never receive an arbitrarily deep or wide object from a stranger.
 */
export function countMap(value: unknown, max = LIMITS.mapKeys): Record<string, number> | null {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
  const out: Record<string, number> = {};
  let n = 0;
  for (const [rawKey, rawValue] of Object.entries(value as Record<string, unknown>)) {
    const key = text(rawKey, 64);
    if (!key) continue;
    const count = Math.floor(Number(rawValue));
    if (!Number.isFinite(count) || count < 0) continue;
    // A five-digit count is already absurd for bikes or extras; the pricing
    // engine's own min/max still applies on top of this.
    out[key] = Math.min(count, 99999);
    if (++n >= max) break;
  }
  return Object.keys(out).length > 0 ? out : null;
}
