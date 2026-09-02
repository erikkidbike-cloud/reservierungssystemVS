// Console overview: open holds needing attention, per location.

import Link from 'next/link';
import { cookies } from 'next/headers';
import { serverClient } from '@/lib/supabase';
import { getSessionUser, bookingsRelationFor } from '@/lib/auth';
import type { StaffBooking } from '@/lib/db-types';

export const dynamic = 'force-dynamic';

export default async function AdminHome() {
  const user = await getSessionUser();
  const relation = bookingsRelationFor(user?.profile?.role);
  const supabase = serverClient(await cookies());

  const { data } = await supabase
    .from(relation)
    .select('*')
    .eq('status', 'requested')
    .order('starts_at', { ascending: true })
    .limit(50);

  const holds = (data ?? []) as StaffBooking[];

  const byLocation = holds.reduce<Record<string, number>>((acc, b) => {
    acc[b.location_code] = (acc[b.location_code] ?? 0) + 1;
    return acc;
  }, {});

  return (
    <>
      <h1>Übersicht</h1>
      <p className="muted">Offene Anfragen, die auf eine Entscheidung warten.</p>

      <div className="cards">
        {Object.keys(byLocation).length === 0 ? (
          <div className="card">
            <strong>Keine offenen Anfragen</strong>
            <p className="muted">Alles bearbeitet.</p>
          </div>
        ) : (
          Object.entries(byLocation).map(([code, count]) => (
            <div className="card" key={code}>
              <strong>{code}</strong>
              <p className="muted">
                {count} offene {count === 1 ? 'Anfrage' : 'Anfragen'}
              </p>
            </div>
          ))
        )}
      </div>

      <h2>Nächste offene Anfragen</h2>
      {holds.length === 0 ? (
        <p className="muted">Nichts offen.</p>
      ) : (
        <ul>
          {holds.slice(0, 10).map((b) => (
            <li key={b.id}>
              {b.location_code} ·{' '}
              {new Intl.DateTimeFormat('de-DE', {
                dateStyle: 'medium',
                timeStyle: 'short',
                timeZone: 'Europe/Berlin',
              }).format(new Date(b.starts_at))}{' '}
              · {b.persons ?? '?'} Pers.
            </li>
          ))}
        </ul>
      )}

      <p style={{ marginTop: 24 }}>
        <Link href="/admin/bookings">Alle Buchungen →</Link>
      </p>
    </>
  );
}
