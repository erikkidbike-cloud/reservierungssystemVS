// Booking list. Reads from the relation appropriate to the caller's role:
// managers/finance/admin get `bookings`; staff and caretakers get the
// column-restricted `bookings_staff` view, so contact and financial columns are
// never sent to the browser at all.

import { cookies } from 'next/headers';
import { serverClient } from '@/lib/supabase';
import { getSessionUser, bookingsRelationFor, canSeeContactData } from '@/lib/auth';
import type { Booking, StaffBooking } from '@/lib/db-types';

export const dynamic = 'force-dynamic';

const STATUS_LABEL: Record<string, string> = {
  requested: 'Angefragt',
  approved: 'Bestätigt',
  agreement_sent: 'NV versandt',
  signed: 'Unterschrieben',
  paid: 'Bezahlt',
  confirmed: 'Gebucht',
  completed: 'Abgeschlossen',
  rejected: 'Abgelehnt',
  expired: 'Abgelaufen',
  cancelled: 'Storniert',
  postponed: 'Verschoben',
};

function fmt(iso: string): string {
  return new Intl.DateTimeFormat('de-DE', {
    dateStyle: 'medium',
    timeStyle: 'short',
    timeZone: 'Europe/Berlin',
  }).format(new Date(iso));
}

function euro(n: number | null): string {
  if (n === null || n === undefined) return '–';
  return new Intl.NumberFormat('de-DE', { style: 'currency', currency: 'EUR' }).format(n);
}

export default async function BookingsPage() {
  const user = await getSessionUser();
  const role = user?.profile?.role;
  const relation = bookingsRelationFor(role);
  const showDetail = canSeeContactData(role);

  const supabase = serverClient(await cookies());
  const { data, error } = await supabase
    .from(relation)
    .select('*')
    .order('starts_at', { ascending: true })
    .limit(200);

  if (error) {
    return (
      <>
        <h1>Buchungen</h1>
        <div className="notice">Konnte Buchungen nicht laden: {error.message}</div>
      </>
    );
  }

  const rows = (data ?? []) as Array<Booking | StaffBooking>;

  return (
    <>
      <h1>Buchungen</h1>
      <p className="muted">
        {rows.length} Einträge · Ansicht: <code>{relation}</code>
      </p>

      {rows.length === 0 ? (
        <p className="muted">Noch keine Buchungen vorhanden.</p>
      ) : (
        <div className="table-scroll">
          <table>
            <thead>
              <tr>
                <th>Ort</th>
                <th>Von</th>
                <th>Bis</th>
                <th>Pers.</th>
                <th>Art</th>
                <th>Status</th>
                {showDetail && <th>Preis</th>}
                {showDetail && <th>Kaution</th>}
              </tr>
            </thead>
            <tbody>
              {rows.map((b) => (
                <tr key={b.id}>
                  <td>{b.location_code}</td>
                  <td>{fmt(b.starts_at)}</td>
                  <td>{fmt(b.ends_at)}</td>
                  <td>{b.persons ?? '–'}</td>
                  <td>{b.event_type ?? '–'}</td>
                  <td>
                    <span className="badge">{STATUS_LABEL[b.status] ?? b.status}</span>
                  </td>
                  {showDetail && <td>{euro((b as Booking).price_total)}</td>}
                  {showDetail && <td>{euro((b as Booking).caution)}</td>}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </>
  );
}
