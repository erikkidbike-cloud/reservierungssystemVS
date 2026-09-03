// "Subscribe in your own calendar app" — the iCal feed URLs for the locations
// this user may act on. Rendered wherever the people who need it already are:
// the caretaker's own task list, and the manager's events page.
//
// The token is part of the URL (calendar apps cannot log in — see
// app/api/ical/[code]/route.ts), so this is shown only to signed-in staff and
// only for their own locations, and the copy says plainly that the link is a
// key.

import { adminClient } from '@/lib/supabase';
import { actionableLocationIds, mayActOnLocation } from '@/lib/auth';
import { siteOriginFromHeaders, absoluteUrl } from '@/lib/site-url';

interface LocationFeed {
  id: string;
  code: string;
  name: string;
  ical_token: string;
}

export default async function CalendarSubscribe() {
  // ical_token lives on `locations`, which staff CAN read — but reading it
  // through the session client would expose every location's token to every
  // signed-in user. Loading with the service role and filtering to the
  // caller's own locations keeps a token scoped to whoever may use it.
  const { data } = await adminClient()
    .from('locations')
    .select('id, code, name, ical_token')
    .eq('is_active', true)
    .order('sort_order');

  const allowed = await actionableLocationIds();
  const locations = ((data ?? []) as LocationFeed[]).filter((l) => mayActOnLocation(allowed, l.id));
  if (locations.length === 0) return null;

  const origin = await siteOriginFromHeaders();

  return (
    <div className="panel">
      <h2 style={{ marginTop: 0 }}>Im eigenen Kalender abonnieren</h2>
      <p className="muted small">
        Diese Adresse in Google Kalender, Outlook oder der iPhone-Kalender-App als
        „Kalender abonnieren“ eintragen — die Termine erscheinen dann automatisch und
        aktualisieren sich von selbst. Die Adresse enthält einen Schlüssel: bitte nicht
        öffentlich teilen.
      </p>
      {locations.map((l) => (
        <p key={l.id} style={{ marginBottom: 8 }}>
          <strong>{l.name}</strong>
          <br />
          <code style={{ wordBreak: 'break-all', fontSize: 12 }}>
            {absoluteUrl(origin, `/api/ical/${l.code}?token=${l.ical_token}`)}
          </code>
        </p>
      ))}
    </div>
  );
}
