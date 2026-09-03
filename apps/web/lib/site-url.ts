// Absolute-URL helper for server code that needs to build a link back into
// this app — a signing link or an admin link inside a notification email.
// Two call shapes because the two kinds of caller differ in what they have on
// hand: a Route Handler gets a Request; a Server Action only gets next/headers.

import { headers } from 'next/headers';

/** Prefer the configured public URL; fall back to the incoming request's own origin. */
export function siteOriginFromRequest(request: Request): string {
  return process.env.NEXT_PUBLIC_SITE_URL || new URL(request.url).origin;
}

/** Same, for a Server Action — no Request object, so it reads next/headers instead. */
export async function siteOriginFromHeaders(): Promise<string> {
  if (process.env.NEXT_PUBLIC_SITE_URL) return process.env.NEXT_PUBLIC_SITE_URL;
  const h = await headers();
  const origin = h.get('origin');
  if (origin) return origin;
  const host = h.get('host');
  return host ? `https://${host}` : 'http://localhost:3000';
}

export function absoluteUrl(origin: string, path: string): string {
  return new URL(path, origin).toString();
}
