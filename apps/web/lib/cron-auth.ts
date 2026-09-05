// Shared authorisation for the scheduled endpoints. They run with no user
// session — a scheduler calls them — so a shared secret stands in for one.
//
// Accepts the secret three ways because the schedulers in play disagree:
// a Bearer header (most hosted schedulers), an x-cron-secret header (what
// supabase/post-deploy/*.sql sends via net.http_post), or a ?secret= query
// parameter (a plain cron plus curl). Each endpoint used to carry its own
// copy of this check and they had drifted — sync-payments accepted only the
// header, the other two only Bearer and the query string — so a scheduler
// configured once could not be pointed at all four.
//
// Fails closed: no CRON_SECRET configured means nothing is authorised, rather
// than everything.

import { timingSafeCompare } from './secrets';

export function isCronAuthorized(request: Request): boolean {
  const secret = process.env.CRON_SECRET;
  if (!secret) return false;

  const authHeader = request.headers.get('authorization');
  if (authHeader?.startsWith('Bearer ') && timingSafeCompare(authHeader.slice(7), secret)) {
    return true;
  }
  if (timingSafeCompare(request.headers.get('x-cron-secret'), secret)) return true;
  return timingSafeCompare(new URL(request.url).searchParams.get('secret'), secret);
}
