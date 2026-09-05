import Link from 'next/link';
import { cookies } from 'next/headers';
import { serverClient } from '@/lib/supabase';
import { getSessionUser, canSeeContactData, actionableLocationIds, mayActOnLocation } from '@/lib/auth';
import type { WaitlistRow, Location } from '@/lib/db-types';
import { updateWaitlistStatus, deleteWaitlistEntry } from './actions';

export const dynamic = 'force-dynamic';

function fmtDateTime(iso: string): string {
  const d = new Date(iso);
  return d.toLocaleString('de-DE', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

function waitlistBadge(status: string) {
  switch (status) {
    case 'waiting':
      return <span className="badge badge--warn">Wartend</span>;
    case 'notified':
      return <span className="badge badge--ok">Benachrichtigt</span>;
    case 'converted':
      return <span className="badge badge--ok">Gebucht</span>;
    case 'cancelled':
      return <span className="badge">Storniert</span>;
    default:
      return <span className="badge">{status}</span>;
  }
}

export default async function WaitlistAdminPage({
  searchParams,
}: {
  searchParams: Promise<{ status?: string }>;
}) {
  const { status: filterStatus = 'waiting' } = await searchParams;
  const me = await getSessionUser();
  if (!me?.profile || !canSeeContactData(me.auth)) {
    return (
      <div className="notice">
        Zugriff auf die Warteliste ist nur für Administratorinnen und Standortleitungen gestattet.
      </div>
    );
  }

  const supabase = serverClient(await cookies());

  let query = supabase
    .from('waitlist_requests')
    .select('*, locations:location_id (code, name)')
    .order('created_at', { ascending: false });

  if (filterStatus && filterStatus !== 'all') {
    query = query.eq('status', filterStatus);
  }

  const { data, error } = await query;
  const allowed = await actionableLocationIds();
  const rawItems = (data ?? []) as (WaitlistRow & { locations: Location | null })[];
  const items = rawItems.filter((it) => mayActOnLocation(allowed, it.location_id));

  return (
    <>
      <div className="row" style={{ justifyContent: 'space-between', alignItems: 'center' }}>
        <h1 style={{ marginBottom: 0 }}>Warteliste</h1>
      </div>
      <p className="muted small">
        Hier finden Sie Personen, die für bereits belegte Termine auf der Warteliste stehen.
        Wird ein Termin storniert, können Sie Personen von hier direkt kontaktieren oder eine Buchung anlegen.
      </p>

      <div className="tabs" style={{ marginTop: 16, marginBottom: 16 }}>
        <Link
          href="/admin/waitlist?status=waiting"
          className={filterStatus === 'waiting' ? 'active' : ''}
        >
          Wartend
        </Link>
        <Link
          href="/admin/waitlist?status=notified"
          className={filterStatus === 'notified' ? 'active' : ''}
        >
          Benachrichtigt
        </Link>
        <Link
          href="/admin/waitlist?status=all"
          className={filterStatus === 'all' ? 'active' : ''}
        >
          Alle
        </Link>
      </div>

      {error && <div className="notice">Fehler beim Laden: {error.message}</div>}

      <div className="panel">
        {items.length === 0 ? (
          <p className="muted small">Keine Einträge für diesen Filter.</p>
        ) : (
          <table>
            <thead>
              <tr>
                <th>Status</th>
                <th>Standort</th>
                <th>Wunschtermin</th>
                <th>Kontakt</th>
                <th>Pers.</th>
                <th>Nachricht</th>
                <th>Aktionen</th>
              </tr>
            </thead>
            <tbody>
              {items.map((row) => {
                const locCode = row.locations?.code || '';
                const fromDate = row.starts_at ? new Date(row.starts_at).toISOString().slice(0, 16) : '';
                const toDate = row.ends_at ? new Date(row.ends_at).toISOString().slice(0, 16) : '';
                const newBookingUrl = `/admin/bookings/new?school=${locCode}&from=${fromDate}&to=${toDate}&email=${encodeURIComponent(row.customer_email)}&last_name=${encodeURIComponent(row.customer_name)}&phone=${encodeURIComponent(row.customer_phone || '')}&persons=${row.persons || ''}`;

                return (
                  <tr key={row.id}>
                    <td>{waitlistBadge(row.status)}</td>
                    <td>
                      <strong>{row.locations?.name || '–'}</strong>
                      <div className="small muted">({row.locations?.code})</div>
                    </td>
                    <td>
                      <div><strong>{fmtDateTime(row.starts_at)}</strong></div>
                      <div className="small muted">bis {fmtDateTime(row.ends_at)}</div>
                    </td>
                    <td>
                      <div><strong>{row.customer_name}</strong></div>
                      <div className="small"><a href={`mailto:${row.customer_email}`}>{row.customer_email}</a></div>
                      {row.customer_phone && <div className="small muted">{row.customer_phone}</div>}
                    </td>
                    <td>{row.persons ?? '–'}</td>
                    <td style={{ maxWidth: 220 }}>{row.message || '–'}</td>
                    <td>
                      <div className="row" style={{ gap: 6, marginBottom: 0 }}>
                        {row.status === 'waiting' && (
                          <form action={updateWaitlistStatus} style={{ margin: 0 }}>
                            <input type="hidden" name="id" value={row.id} />
                            <input type="hidden" name="status" value="notified" />
                            <button
                              type="submit"
                              className="secondary"
                              style={{ padding: '2px 8px', fontSize: '0.8rem' }}
                            >
                              Benachrichtigt
                            </button>
                          </form>
                        )}
                        <Link href={newBookingUrl}>
                          <button
                            type="button"
                            style={{ padding: '2px 8px', fontSize: '0.8rem' }}
                          >
                            Buchen →
                          </button>
                        </Link>
                        <form action={deleteWaitlistEntry} style={{ margin: 0 }}>
                          <input type="hidden" name="id" value={row.id} />
                          <button
                            type="submit"
                            className="secondary"
                            style={{ padding: '2px 8px', fontSize: '0.8rem' }}
                          >
                            Entfernen
                          </button>
                        </form>
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
      </div>
    </>
  );
}
