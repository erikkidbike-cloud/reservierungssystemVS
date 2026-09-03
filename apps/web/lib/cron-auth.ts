// Shared authorisation for the scheduled endpoints. They run with no user
// session — a scheduler calls them — so a shared secret stands in for one.
//
// Accepts the secret either as a Bearer header (what most schedulers send) or
// as a ?secret= query parameter (what a plain cron + curl, or Supabase's
// pg_net, can manage). Fails closed: no CRON_SECRET configured means nothing
// is authorised, rather than everything.

export function isCronAuthorized(request: Request): boolean {
  const secret = process.env.CRON_SECRET;
  if (!secret) return false;

  if (request.headers.get('authorization') === `Bearer ${secret}`) return true;
  if (request.headers.get('x-cron-secret') === secret) return true;
  return new URL(request.url).searchParams.get('secret') === secret;
}
