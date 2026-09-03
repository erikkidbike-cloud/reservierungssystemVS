// The honeypot field name, in its own module because BOTH sides need it: the
// public wizard (a client component) renders the hidden input, and the API
// route checks it. lib/rate-limit.ts imports adminClient — service-role code
// that must never be pulled into a browser bundle — so the shared constant
// cannot live there.
//
// Named to look like a field a scraper would expect rather than "honeypot".
export const HONEYPOT_FIELD = 'company_website';

export function looksLikeBot(body: Record<string, unknown>): boolean {
  const v = body[HONEYPOT_FIELD];
  return typeof v === 'string' && v.trim().length > 0;
}
