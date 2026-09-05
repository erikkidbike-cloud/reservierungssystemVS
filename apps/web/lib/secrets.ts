// Constant-time comparison for the secrets that arrive in a URL or a header:
// the cron shared secret and the per-location iCal token.
//
// Over TLS, against a random UUID or a long random string, a timing attack is
// close to theoretical. It is three lines to remove the question entirely, and
// both of these values are exactly the kind that `===` should not be trusted
// with: they are the ONLY thing standing between an anonymous request and the
// data behind it.

import { timingSafeEqual } from 'node:crypto';

export function timingSafeCompare(candidate: string | null | undefined, secret: string): boolean {
  if (!candidate || !secret) return false;
  const a = Buffer.from(candidate);
  const b = Buffer.from(secret);
  // timingSafeEqual throws on a length mismatch, which is itself a (much
  // coarser) oracle — but length is not the part worth protecting here, and
  // false is what the caller wants anyway.
  if (a.length !== b.length) return false;
  return timingSafeEqual(a, b);
}
