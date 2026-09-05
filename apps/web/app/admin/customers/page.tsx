import { cookies } from 'next/headers';
import { serverClient } from '@/lib/supabase';
import { getSessionUser, canSeeContactData } from '@/lib/auth';
import type { CustomerExperience } from '@/lib/db-types';
import { createCustomerExperience, deleteCustomerExperience } from './actions';
import { VermerkForm, type PickableBooking } from './VermerkForm';

export const dynamic = 'force-dynamic';

function ratingBadge(rating: string) {
  switch (rating) {
    case 'do_not_rent':
      return <span className="badge" style={{ background: '#e03e3e', color: '#fff' }}>⛔ SPERRE (Do-Not-Rent)</span>;
    case 'negative':
      return <span className="badge badge--warn">⚠️ Negativ</span>;
    case 'positive':
      return <span className="badge badge--ok">✨ Positiv</span>;
    default:
      return <span className="badge">ℹ️ Neutral</span>;
  }
}

export default async function CustomersAdminPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string }>;
}) {
  const { q } = await searchParams;
  const me = await getSessionUser();
  if (!me?.profile || !canSeeContactData(me.auth)) {
    return (
      <div className="notice">
        Zugriff auf Kundenbewertungen und Sperrvermerke ist nur für Administratorinnen und Standortleitungen gestattet.
      </div>
    );
  }

  const supabase = serverClient(await cookies());

  let query = supabase
    .from('customer_experiences')
    .select('*')
    .order('created_at', { ascending: false });

  if (q?.trim()) {
    const term = `%${q.trim()}%`;
    query = query.or(`match_last_name.ilike.${term},match_email.ilike.${term},match_organization.ilike.${term}`);
  }

  const { data: experiences, error } = await query;
  const items = (experiences ?? []) as CustomerExperience[];

  // Bookings the note can be written ABOUT. Past ones first, because that is
  // the ordinary case; a handful of upcoming ones are included too, flagged in
  // the picker, for the deposit that bounced before the day.
  const [{ data: pastRows }, { data: futureRows }] = await Promise.all([
    supabase
      .from('bookings')
      .select('id, starts_at, ends_at, event_type, status, locations(code), customers(first_name, last_name, email, phone, organization)')
      .lt('starts_at', new Date().toISOString())
      .order('starts_at', { ascending: false })
      .limit(150),
    supabase
      .from('bookings')
      .select('id, starts_at, ends_at, event_type, status, locations(code), customers(first_name, last_name, email, phone, organization)')
      .gte('starts_at', new Date().toISOString())
      .order('starts_at')
      .limit(50),
  ]);

  type Row = {
    id: string;
    starts_at: string;
    ends_at: string;
    event_type: string | null;
    status: string;
    locations: { code: string } | null;
    customers: {
      first_name: string | null;
      last_name: string | null;
      email: string | null;
      phone: string | null;
      organization: string | null;
    } | null;
  };

  const toPickable = (r: Row): PickableBooking => ({
    id: r.id,
    startsAt: r.starts_at,
    endsAt: r.ends_at,
    locationCode: r.locations?.code ?? '—',
    eventType: r.event_type,
    status: r.status,
    firstName: r.customers?.first_name ?? null,
    lastName: r.customers?.last_name ?? null,
    email: r.customers?.email ?? null,
    phone: r.customers?.phone ?? null,
    organization: r.customers?.organization ?? null,
  });

  const pickable: PickableBooking[] = [
    ...((pastRows ?? []) as unknown as Row[]).map(toPickable),
    ...((futureRows ?? []) as unknown as Row[]).map(toPickable),
  ];

  return (
    <>
      <div className="row" style={{ justifyContent: 'space-between', alignItems: 'center' }}>
        <h1 style={{ marginBottom: 0 }}>Kundenvermerke & Sperrliste</h1>
      </div>
      <p className="muted small">
        Hier hinterlegte Vermerke und Einstufungen („Do-Not-Rent“, negative oder positive Vorerfahrungen)
        werden bei Buchungen automatisch als Warnhinweis eingeblendet.
      </p>

      <div className="panel" style={{ marginTop: 16 }}>
        <h2 style={{ marginTop: 0 }}>Neuen Vermerk anlegen</h2>
        <form action={createCustomerExperience}>
          <VermerkForm bookings={pickable} />
        </form>
      </div>

      <div className="panel" style={{ marginTop: 24 }}>
        <div className="row" style={{ justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
          <h2 style={{ margin: 0 }}>Gespeicherte Vermerke ({items.length})</h2>
          <form method="GET" style={{ margin: 0 }}>
            <input
              type="search"
              name="q"
              placeholder="Suchen nach Name, E-Mail..."
              defaultValue={q ?? ''}
              style={{ padding: '6px 10px', width: 220 }}
            />
          </form>
        </div>

        {error && <div className="notice">Fehler beim Laden: {error.message}</div>}

        {items.length === 0 ? (
          <p className="muted small">Keine Vermerke gefunden.</p>
        ) : (
          <table>
            <thead>
              <tr>
                <th>Status</th>
                <th>Name / Kontakt</th>
                <th>Organisation</th>
                <th>Notiz</th>
                <th>Datum</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {items.map((it) => (
                <tr key={it.id}>
                  <td>{ratingBadge(it.rating)}</td>
                  <td>
                    <strong>{[it.match_first_name, it.match_last_name].filter(Boolean).join(' ') || '–'}</strong>
                    {it.match_email && <div className="small muted">{it.match_email}</div>}
                    {it.match_phone && <div className="small muted">{it.match_phone}</div>}
                  </td>
                  <td>{it.match_organization || '–'}</td>
                  <td style={{ maxWidth: 320 }}>{it.note || '–'}</td>
                  <td className="small muted">
                    {new Date(it.created_at).toLocaleDateString('de-DE')}
                  </td>
                  <td style={{ textAlign: 'right' }}>
                    <form action={deleteCustomerExperience} style={{ margin: 0 }}>
                      <input type="hidden" name="id" value={it.id} />
                      <button
                        type="submit"
                        className="secondary"
                        style={{ padding: '2px 8px', fontSize: '0.8rem' }}
                      >
                        Löschen
                      </button>
                    </form>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </>
  );
}
