// Booking list & monthly calendar view.
// Reads from the relation appropriate to the caller's role:
// managers/finance/admin get `bookings`; staff and caretakers get the
// column-restricted `bookings_staff` view, so contact and financial columns are
// never sent to the browser at all.

import Link from 'next/link';
import { cookies } from 'next/headers';
import { serverClient } from '@/lib/supabase';
import { getSessionUser, bookingsRelationFor, canSeeContactData } from '@/lib/auth';
import type { Booking, StaffBooking, BlockRow } from '@/lib/db-types';
import type { BookingStatus } from '@vs/domain';
import { STATUS_LABEL, statusBadgeClass, fmtDateTime, fmtEuro } from '@/lib/booking-labels';
import CalendarView from './CalendarView';

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
  searchParams: Promise<{ filter?: string; view?: string; month?: string; location?: string }>;
}) {
  const { filter = 'open', view = 'table', month: monthParam, location: locationParam } = await searchParams;
  const active = FILTERS[filter] ? filter : 'open';

  const user = await getSessionUser();
  const auth = user?.auth;
  const relation = bookingsRelationFor(auth);
  const showDetail = canSeeContactData(auth);

  const supabase = serverClient(await cookies());

  // Date calculations for calendar view
  const now = new Date();
  let calYear = now.getFullYear();
  let calMonth = now.getMonth(); // 0-11
  if (monthParam && /^\d{4}-\d{2}$/.test(monthParam)) {
    const [y, m] = monthParam.split('-').map(Number);
    if (y >= 2000 && m >= 1 && m <= 12) {
      calYear = y;
      calMonth = m - 1;
    }
  }

  let rows: Array<Booking | StaffBooking> = [];
  let blocks: BlockRow[] = [];

  if (view === 'calendar') {
    // Start from 7 days before month start to 7 days after month end to cover calendar padding
    const monthStart = new Date(calYear, calMonth, -7).toISOString();
    const monthEnd = new Date(calYear, calMonth + 1, 14).toISOString();

    let calQuery = supabase
      .from(relation)
      .select('*')
      .gte('starts_at', monthStart)
      .lte('starts_at', monthEnd)
      .order('starts_at', { ascending: true });

    if (locationParam) {
      calQuery = calQuery.eq('location_code', locationParam);
    }

    const [{ data: bData }, { data: blData }] = await Promise.all([
      calQuery,
      supabase
        .from('blocks')
        .select('*')
        .gte('starts_at', monthStart)
        .lte('starts_at', monthEnd)
        .order('starts_at', { ascending: true }),
    ]);

    rows = (bData ?? []) as Array<Booking | StaffBooking>;
    blocks = (blData ?? []) as BlockRow[];
  } else {
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
    rows = (data ?? []) as Array<Booking | StaffBooking>;
  }

  return (
    <>
      <div className="row" style={{ justifyContent: 'space-between', alignItems: 'center' }}>
        <h1 style={{ marginBottom: 0 }}>Buchungen</h1>
        <div className="row" style={{ alignItems: 'center', gap: 12, marginBottom: 0 }}>
          <div className="row" style={{ gap: 4, marginBottom: 0 }}>
            <Link href={`/admin/bookings?view=table&filter=${active}`}>
              <button
                type="button"
                className={view !== 'calendar' ? undefined : 'secondary'}
                style={{ padding: '4px 12px' }}
              >
                Tabelle
              </button>
            </Link>
            <Link href="/admin/bookings?view=calendar">
              <button
                type="button"
                className={view === 'calendar' ? undefined : 'secondary'}
                style={{ padding: '4px 12px' }}
              >
                Kalender
              </button>
            </Link>
          </div>
          <Link href="/admin/bookings/new">
            <button type="button">Buchung erfassen</button>
          </Link>
        </div>
      </div>

      {view === 'calendar' ? (
        <CalendarView
          bookings={rows}
          blocks={blocks}
          year={calYear}
          month={calMonth}
          locationFilter={locationParam}
        />
      ) : (
        <>
          <div className="row" style={{ margin: '16px 0' }}>
            {Object.entries(FILTERS).map(([key, f]) => (
              <Link key={key} href={`/admin/bookings?view=table&filter=${key}`}>
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
                    <th></th>
                  </tr>
                </thead>
                <tbody>
                  {rows.map((b) => (
                    <tr key={b.id}>
                      <td>
                        <strong>{b.location_code}</strong>
                        {b.has_overlap && (
                          <span
                            className="badge badge--warn"
                            style={{ marginLeft: 6, fontSize: '0.7rem' }}
                            title="Doppelbelegung"
                          >
                            ⚠️
                          </span>
                        )}
                      </td>
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
                      <td style={{ textAlign: 'right' }}>
                        <Link href={`/admin/bookings/${b.id}`}>Öffnen →</Link>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </>
      )}
    </>
  );
}
