// One booking: everything about it, the actions legal from its current status,
// and its audit trail.
//
// The available actions come from packages/domain's state machine rather than
// a hand-written list per status, so this page can never offer a transition the
// machine would reject — and adding a transition there makes a button appear
// here automatically.

import Link from 'next/link';
import { notFound } from 'next/navigation';
import { cookies } from 'next/headers';
import { serverClient } from '@/lib/supabase';
import { getSessionUser, canApprove, canSeeContactData } from '@/lib/auth';
import { allowedActions, type BookingStatus } from '@vs/domain';
import {
  STATUS_LABEL,
  ACTION_LABEL,
  ACTIONS_WITH_REASON,
  DESTRUCTIVE_ACTIONS,
  statusBadgeClass,
  fmtDateTime,
  fmtEuro,
} from '@/lib/booking-labels';
import { transitionBooking, saveInternalNotes } from '../actions';
import { siteOriginFromHeaders, absoluteUrl } from '@/lib/site-url';
import { MAIL_KEY_FOR_ACTION } from '@/lib/mail-send';

export const dynamic = 'force-dynamic';

interface BookingEventRow {
  id: string;
  event_type: string;
  from_status: string | null;
  to_status: string | null;
  created_at: string;
  actor_id: string | null;
}

export default async function BookingDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const me = await getSessionUser();
  const role = me?.profile?.role;
  const supabase = serverClient(await cookies());

  const { data, error } = await supabase
    .from('bookings')
    .select(
      '*, locations(code, name, address), customers(salutation, first_name, last_name, ' +
        'organization, email, phone, address_full)',
    )
    .eq('id', id)
    .maybeSingle();

  if (error) {
    return (
      <>
        <h1>Buchung</h1>
        <div className="notice">Konnte die Buchung nicht laden: {error.message}</div>
      </>
    );
  }

  // No row can mean "doesn't exist" or "RLS says not yours" — deliberately not
  // distinguished, since telling someone a booking exists at a location they
  // have no access to is itself a small leak.
  if (!data) notFound();

  /* eslint-disable @typescript-eslint/no-explicit-any */
  const b = data as any;
  const status = b.status as BookingStatus;
  const loc = b.locations;
  const cust = b.customers;
  const showContact = canSeeContactData(role);
  const mayAct = canApprove(role);
  const actions = mayAct ? allowedActions(status) : [];

  const { data: doc } = await supabase
    .from('documents')
    .select('status, signed_at, signer_name, id_document_path')
    .eq('booking_id', id)
    .eq('type', 'nutzungsvereinbarung')
    .maybeSingle();

  const { data: events } = await supabase
    .from('booking_events')
    .select('id, event_type, from_status, to_status, created_at, actor_id')
    .eq('booking_id', id)
    .order('created_at', { ascending: false });

  const trail = (events ?? []) as BookingEventRow[];
  const signingUrl = absoluteUrl(await siteOriginFromHeaders(), `/sign/${id}`);

  return (
    <>
      <p className="small">
        <Link href="/admin/bookings">← Alle Buchungen</Link>
      </p>

      <div className="row" style={{ justifyContent: 'space-between', alignItems: 'center' }}>
        <h1 style={{ marginBottom: 0 }}>
          {loc?.name} · {fmtDateTime(b.starts_at)}
        </h1>
        <span className={statusBadgeClass(status)}>{STATUS_LABEL[status]}</span>
      </div>

      <div className="grid-2" style={{ marginTop: 24 }}>
        <div className="panel">
          <h2 style={{ marginTop: 0 }}>Veranstaltung</h2>
          <table>
            <tbody>
              <tr>
                <th>Ort</th>
                <td>{loc?.name}</td>
              </tr>
              <tr>
                <th>Von</th>
                <td>{fmtDateTime(b.starts_at)}</td>
              </tr>
              <tr>
                <th>Bis</th>
                <td>{fmtDateTime(b.ends_at)}</td>
              </tr>
              <tr>
                <th>Personen</th>
                <td>{b.persons ?? '–'}</td>
              </tr>
              <tr>
                <th>Art</th>
                <td>{b.event_type || '–'}</td>
              </tr>
              <tr>
                <th>Herkunft</th>
                <td>{b.source === 'public_form' ? 'Online-Formular' : b.source === 'internal' ? 'Intern erfasst' : 'Import'}</td>
              </tr>
              {b.hold_expires_at && status === 'requested' && (
                <tr>
                  <th>Vorgemerkt bis</th>
                  <td>{fmtDateTime(b.hold_expires_at)}</td>
                </tr>
              )}
            </tbody>
          </table>
        </div>

        {showContact ? (
          <div className="panel">
            <h2 style={{ marginTop: 0 }}>Kontakt & Preis</h2>
            <table>
              <tbody>
                <tr>
                  <th>Name</th>
                  <td>
                    {[cust?.salutation, cust?.first_name, cust?.last_name]
                      .filter(Boolean)
                      .join(' ') || '–'}
                  </td>
                </tr>
                {cust?.organization && (
                  <tr>
                    <th>Einrichtung</th>
                    <td>{cust.organization}</td>
                  </tr>
                )}
                <tr>
                  <th>E-Mail</th>
                  <td>{cust?.email ? <a href={`mailto:${cust.email}`}>{cust.email}</a> : '–'}</td>
                </tr>
                <tr>
                  <th>Telefon</th>
                  <td>{cust?.phone || '–'}</td>
                </tr>
                <tr>
                  <th>Adresse</th>
                  <td style={{ whiteSpace: 'normal' }}>{cust?.address_full || '–'}</td>
                </tr>
                <tr>
                  <th>Entgelt</th>
                  <td>{fmtEuro(b.price_total)}</td>
                </tr>
                <tr>
                  <th>Kaution</th>
                  <td>{fmtEuro(b.caution)}</td>
                </tr>
                {b.verwendungszweck && (
                  <tr>
                    <th>Verwendungszweck</th>
                    <td>{b.verwendungszweck}</td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        ) : (
          <div className="panel">
            <h2 style={{ marginTop: 0 }}>Kontakt & Preis</h2>
            <p className="muted">
              Für diese Rolle werden Kontakt- und Finanzdaten nicht geladen.
            </p>
          </div>
        )}
      </div>

      {b.message && (
        <div className="panel">
          <h2 style={{ marginTop: 0 }}>Nachricht der anfragenden Person</h2>
          <p style={{ whiteSpace: 'pre-wrap', marginBottom: 0 }}>{b.message}</p>
        </div>
      )}

      {doc && (
        <div className="panel">
          <h2 style={{ marginTop: 0 }}>Nutzungsvereinbarung</h2>
          <p style={{ marginBottom: doc.status === 'sent' ? 8 : 0 }}>
            Status: <span className={doc.status === 'signed' ? 'badge badge--ok' : 'badge'}>
              {doc.status === 'signed' ? 'Unterschrieben' : doc.status === 'sent' ? 'Versandt' : 'Entwurf'}
            </span>
            {doc.signed_at && (
              <span className="muted small">
                {' '}
                · {fmtDateTime(doc.signed_at)}
                {doc.signer_name ? ` · ${doc.signer_name}` : ''}
                {doc.id_document_path ? ' · Ausweisdokument hochgeladen' : ''}
              </span>
            )}
          </p>
          {doc.status === 'sent' && (
            <p className="muted small" style={{ marginBottom: 0 }}>
              Link zur Unterschrift: <code>{signingUrl}</code>
            </p>
          )}
        </div>
      )}

      {mayAct && actions.length > 0 && (
        <div className="panel">
          <h2 style={{ marginTop: 0 }}>Nächster Schritt</h2>
          <p className="muted small">
            Statusänderungen werden protokolliert. Bei Aktionen mit E-Mail an die anfragende
            Person kann der Text vor dem Versand bearbeitet werden.
          </p>
          <div className="row" style={{ alignItems: 'flex-start' }}>
            {actions.map((a) =>
              MAIL_KEY_FOR_ACTION[a] ? (
                <div key={a} className="row" style={{ marginBottom: 0 }}>
                  <Link href={`/admin/bookings/${b.id}/send/${a}`}>
                    <button type="button" className={DESTRUCTIVE_ACTIONS.includes(a) ? 'secondary' : undefined}>
                      {ACTION_LABEL[a]} …
                    </button>
                  </Link>
                  <form action={transitionBooking}>
                    <input type="hidden" name="bookingId" value={b.id} />
                    <input type="hidden" name="action" value={a} />
                    <button type="submit" className="secondary" title="Mit der Standard-Vorlage sofort senden">
                      Sofort senden
                    </button>
                  </form>
                </div>
              ) : (
                <form action={transitionBooking} key={a}>
                  <input type="hidden" name="bookingId" value={b.id} />
                  <input type="hidden" name="action" value={a} />
                  {ACTIONS_WITH_REASON.includes(a) && (
                    <input
                      type="text"
                      name="reason"
                      placeholder="Grund (optional, wird mitgeteilt)"
                      style={{ minWidth: 240, marginBottom: 8 }}
                    />
                  )}
                  <button type="submit" className={DESTRUCTIVE_ACTIONS.includes(a) ? 'secondary' : undefined}>
                    {ACTION_LABEL[a]}
                  </button>
                </form>
              ),
            )}
          </div>
        </div>
      )}

      {mayAct && actions.length === 0 && (
        <div className="notice">
          Dieser Status ist ein Endzustand — es gibt keine weiteren Schritte.
        </div>
      )}

      {showContact && (
        <div className="panel">
          <h2 style={{ marginTop: 0 }}>Interne Notiz</h2>
          <form action={saveInternalNotes}>
            <input type="hidden" name="bookingId" value={b.id} />
            <textarea
              name="internalNotes"
              rows={3}
              defaultValue={b.internal_notes ?? ''}
              placeholder="Nur intern sichtbar"
            />
            <button type="submit" className="secondary" style={{ marginTop: 8 }}>
              Notiz speichern
            </button>
          </form>
        </div>
      )}

      <div className="panel">
        <h2 style={{ marginTop: 0 }}>Verlauf</h2>
        {trail.length === 0 ? (
          <p className="muted">Noch keine Einträge.</p>
        ) : (
          <table>
            <thead>
              <tr>
                <th>Wann</th>
                <th>Ereignis</th>
                <th>Von → nach</th>
              </tr>
            </thead>
            <tbody>
              {trail.map((e) => (
                <tr key={e.id}>
                  <td>{fmtDateTime(e.created_at)}</td>
                  <td>{e.event_type}</td>
                  <td>
                    {e.from_status
                      ? `${STATUS_LABEL[e.from_status as BookingStatus] ?? e.from_status} → `
                      : ''}
                    {e.to_status
                      ? STATUS_LABEL[e.to_status as BookingStatus] ?? e.to_status
                      : '–'}
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
