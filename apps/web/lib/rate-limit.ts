// Abuse protection for the anonymous public endpoints (/api/booking-request,
// /api/waitlist). Without this, anyone with curl can fill every calendar with
// junk holds — each one blocking a real slot for the hold period and mailing
// the location team about it.
//
// Counting happens in Postgres (check_rate_limit, 0015), not in process
// memory: these run as serverless functions, so an in-memory counter would
// reset on every cold start and be per-instance — no protection at all.
//
// Two limits are applied together, deliberately:
//   - per IP, which stops one script; and
//   - per endpoint globally, which stops a distributed one from drowning the
//     locations' inbox even when no single IP looks abusive.

import { adminClient } from './supabase';

export interface RateLimitRule {
  /** Distinct name per endpoint, so limits don't share a counter. */
  name: string;
  limit: number;
  windowSeconds: number;
}

export const BOOKING_LIMITS = {
  perIp: { name: 'booking:ip', limit: 5, windowSeconds: 3600 },
  global: { name: 'booking:all', limit: 60, windowSeconds: 3600 },
} as const;

export const WAITLIST_LIMITS = {
  perIp: { name: 'waitlist:ip', limit: 5, windowSeconds: 3600 },
  global: { name: 'waitlist:all', limit: 60, windowSeconds: 3600 },
} as const;

/**
 * The client's address as seen through Netlify's proxy. Spoofable in theory —
 * an attacker controls their own X-Forwarded-For — but the platform appends
 * the real peer as the LAST entry, so the last one is the trustworthy hop.
 */
export function clientIp(request: Request): string {
  const xff = request.headers.get('x-nf-client-connection-ip') ?? request.headers.get('x-real-ip');
  if (xff) return xff.trim();
  const forwarded = request.headers.get('x-forwarded-for');
  if (forwarded) {
    const parts = forwarded.split(',').map((p) => p.trim()).filter(Boolean);
    if (parts.length > 0) return parts[parts.length - 1];
  }
  return 'unknown';
}

async function checkOne(bucket: string, rule: RateLimitRule): Promise<boolean> {
  const { data, error } = await adminClient().rpc('check_rate_limit', {
    p_bucket: bucket,
    p_limit: rule.limit,
    p_window_seconds: rule.windowSeconds,
  });
  if (error) {
    // Fail open: a broken rate limiter must not take the booking form down.
    console.error(`[rate-limit] check failed for ${bucket}, allowing:`, error.message);
    return true;
  }
  return data !== false;
}

export interface RateLimitResult {
  allowed: boolean;
  /** Which rule tripped, for the log line. Never shown to the visitor. */
  tripped?: string;
}

/** Apply a per-IP and a global limit to one request. */
export async function checkRateLimit(
  request: Request,
  limits: { perIp: RateLimitRule; global: RateLimitRule },
): Promise<RateLimitResult> {
  const ip = clientIp(request);

  const [ipOk, globalOk] = await Promise.all([
    checkOne(`${limits.perIp.name}:${ip}`, limits.perIp),
    checkOne(limits.global.name, limits.global),
  ]);

  if (!ipOk) return { allowed: false, tripped: `${limits.perIp.name} (${ip})` };
  if (!globalOk) return { allowed: false, tripped: limits.global.name };
  return { allowed: true };
}

// The honeypot check lives in lib/honeypot.ts (client-safe — the wizard needs
// the field name too) and is re-exported here so a route handler can import
// its whole abuse-protection toolkit from one place.
export { HONEYPOT_FIELD, looksLikeBot } from './honeypot';
