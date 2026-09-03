// Booking list. Reads from the relation appropriate to the caller's role:
// managers/finance/admin get `bookings`; staff and caretakers get the
// column-restricted `bookings_staff` view, so contact and financial columns are
// never sent to the browser at all.

import Link from 'next/link';
import { cookies } from 'next/headers';
import { serverClient } from '@/lib/supabase';
import { getSessionUser, bookingsRelationFor, canSeeContactData } from '@/lib/auth';
import type { Booking, StaffBooking } from '@/lib/db-types';
import type { BookingStatus } from '@vs/domain';
import { STATUS_LABEL, statusBadgeClass, fmtDateTime, fmtEuro } from '@/lib/booking-labels';

export const dynamic = 'force-dynamic';

/** Filters offered above the table. `open` is the default working view. */
const FILTERS: Record<string, { label: string; statuses?: BookingStatus[] }> = {
  open: {
    label: 'Offen',
    statuses: ['requested', 'approved', 'agreement_sent', 'signed', 'paid'],
  },
  requested: { label: 'Nur Anfragen', statuses: ['requested'] },
  confirmed: { label: 'Gebucht', statuses: ['confirmed'] },
  all: { label: 'Alle' },
};

export default async function BookingsPage({
  searchParams,
}: {
  searchParams: Promise<{ filter?: string }>;
}) {
  const { filter = 'open' } = await searchParams;
  const active = FILTERS[filter] ? filter : 'open';

  const user = await getSessionUser();
  const role = user?.profile?.role;
  const relation = bookingsRelationFor(role);
  const showDetail = canSeeContactData(role);

  const supabase = serverClient(await cookies());
  let query = supabase.from(relation).select('*').order('starts_at', { ascending: true }).limit(300);

  const statuses = FILTERS[active].statuses;
  if (statuses) query = query.in('status', statuses);

  const { data, error } = await query;

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
      <div className="row" style={{ justifyContent: 'space-between', alignItems: 'center' }}>
        <h1 style={{ marginBottom: 0 }}>Buchungen</h1>
        <Link href="/admin/bookings/new">
          <button type="button">Buchung erfassen</button>
        </Link>
      </div>

      <div className="row" style={{ margin: '16px 0' }}>
        {Object.entries(FILTERS).map(([key, f]) => (
          <Link key={key} href={`/admin/bookings?filter=${key}`}>
            <span className={key === active ? 'badge badge--ok' : 'badge'}>{f.label}</span>
          </Link>
        ))}
        <span className="spacer" />
        <span className="muted small">
          {rows.length} {rows.length === 1 ? 'Eintrag' : 'Einträge'} · Ansicht{' '}
          <code>{relation}</code>
        </span>
      </div>

      {rows.length === 0 ? (
        <p className="muted">Keine Buchungen in dieser Ansicht.</p>
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
                {showDetail && <th />}
              </tr>
            </thead>
            <tbody>
              {rows.map((b) => (
                <tr key={b.id}>
                  <td>{b.location_code}</td>
                  <td>{fmtDateTime(b.starts_at)}</td>
                  <td>{fmtDateTime(b.ends_at)}</td>
                  <td>{b.persons ?? '–'}</td>
                  <td>{b.event_type ?? '–'}</td>
                  <td>
                    <span className={statusBadgeClass(b.status as BookingStatus)}>
                      {STATUS_LABEL[b.status as BookingStatus] ?? b.status}
                    </span>
                  </td>
                  {showDetail && <td>{fmtEuro((b as Booking).price_total)}</td>}
                  {showDetail && <td>{fmtEuro((b as Booking).caution)}</td>}
                  {showDetail && (
                    <td>
                      <Link href={`/admin/bookings/${b.id}`}>Öffnen →</Link>
                    </td>
                  )}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </>
  );
}
