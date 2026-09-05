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
import { canManageWaitlist } from '@/lib/auth';
import { notifyWaitlist, waitlistMatchesFor } from './waitlist-actions';

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
  const auth = me?.auth;
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
  const showContact = canSeeContactData(auth);
  const mayAct = canApprove(auth);
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

  let customerExp = null;
  if (showContact && (cust?.email || cust?.last_name)) {
    const filters = [];
    if (cust?.email) filters.push(`match_email.eq.${cust.email.toLowerCase()}`);
    if (cust?.phone) filters.push(`match_phone.eq.${cust.phone}`);
    if (cust?.last_name) filters.push(`match_last_name.ilike.${cust.last_name}`);
    if (filters.length > 0) {
      const { data: exp } = await supabase
        .from('customer_experiences')
        .select('*')
        .or(filters.join(','))
        .order('created_at', { ascending: false })
        .limit(1)
        .maybeSingle();
      customerExp = exp;
    }
  }

  // Who is waiting for THIS slot, not merely for this venue — an overlapping
  // range is the thing that makes the cancellation news worth sending.
  const slotIsFree = ['cancelled', 'postponed', 'rejected', 'expired'].includes(status);
  const waiting = slotIsFree ? await waitlistMatchesFor(b.location_id, b.starts_at, b.ends_at) : [];
  const alreadyOffered = new Set<string>();
  if (waiting.length > 0) {
    const { data: offers } = await supabase
      .from('waitlist_offers')
      .select('waitlist_id')
      .eq('starts_at', b.starts_at)
      .eq('ends_at', b.ends_at);
    for (const o of (offers ?? []) as { waitlist_id: string }[]) alreadyOffered.add(o.waitlist_id);
  }
  const toNotify = waiting.filter((w) => !alreadyOffered.has(w.id));

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
        <div className="row" style={{ alignItems: 'center', gap: 8, marginBottom: 0 }}>
          {(b.has_overlap || b.allow_overlap) && (
            <span className="badge badge--warn" title="Dieser Termin überschneidet sich mit einer anderen Buchung">
              ⚠️ Doppelbelegung
            </span>
          )}
          <span className={statusBadgeClass(status)}>{STATUS_LABEL[status]}</span>
          {showContact && (
            <Link href={`/admin/bookings/${id}/edit`}>
              <button type="button" className="secondary" style={{ padding: '4px 12px' }}>
                Bearbeiten …
              </button>
            </Link>
          )}
        </div>
      </div>

      {customerExp && (
        <div
          className="notice"
          style={{
            background: customerExp.rating === 'do_not_rent' || customerExp.rating === 'negative' ? '#fff0f0' : '#f0f7ff',
            border: `1px solid ${customerExp.rating === 'do_not_rent' || customerExp.rating === 'negative' ? '#e03e3e' : '#70a0d0'}`,
            color: '#16181a',
            marginTop: 16,
          }}
        >
          <strong style={{ color: customerExp.rating === 'do_not_rent' || customerExp.rating === 'negative' ? '#c92a2a' : 'inherit' }}>
            {customerExp.rating === 'do_not_rent'
              ? '⛔ SPERRE (Do-Not-Rent) / Warnung zu dieser Person'
              : customerExp.rating === 'negative'
                ? '⚠️ Negative Vorerfahrung zu dieser Person'
                : customerExp.rating === 'positive'
                  ? '✨ Positive Vorerfahrung'
                  : 'ℹ️ Vermerk zu dieser Person'}
          </strong>
          {customerExp.note && <p style={{ margin: '4px 0 0' }}>{customerExp.note}</p>}
          <p className="muted small" style={{ margin: '6px 0 0' }}>
            <Link href="/admin/customers">Zur Kundenverwaltung →</Link>
          </p>
        </div>
      )}

      {slotIsFree && waiting.length > 0 && (
        <div className="notice" style={{ marginTop: 12 }}>
          <strong>Warteliste:</strong>{' '}
          {waiting.length === 1
            ? 'Eine Person wartet'
            : `${waiting.length} Personen warten`}{' '}
          auf einen Termin, der sich mit diesem überschneidet.
          {alreadyOffered.size > 0 && (
            <>
              {' '}Davon {alreadyOffered.size === 1 ? 'wurde eine' : `wurden ${alreadyOffered.size}`}{' '}
              bereits über genau diesen Termin informiert.
            </>
          )}{' '}
          <Link href="/admin/waitlist">Warteliste öffnen →</Link>
          {canManageWaitlist(auth) && toNotify.length > 0 && (
            <form action={notifyWaitlist} style={{ marginTop: 12 }}>
              <input type="hidden" name="bookingId" value={id} />
              <button type="submit" className="secondary">
                {toNotify.length === 1
                  ? '1 wartende Person benachrichtigen'
                  : `${toNotify.length} wartende Personen benachrichtigen`}
              </button>
              <p className="muted small" style={{ marginTop: 6, marginBottom: 0 }}>
                Alle bekommen denselben Link auf das öffentliche Formular, mit Ort und
                Datum vorausgefüllt. Der Termin wird für niemanden reserviert — wer
                zuerst bucht, bekommt ihn. Der Text ist unter{' '}
                <Link href="/admin/mail-templates">E-Mail-Vorlagen</Link> änderbar.
              </p>
            </form>
          )}
        </div>
      )}

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
          {doc.status === 'signed' && (
            <div className="row" style={{ marginTop: 12, gap: 8 }}>
              <a
                href={`/api/admin/bookings/${id}/document/signature`}
                target="_blank"
                rel="noreferrer"
              >
                <button type="button" className="secondary" style={{ padding: '6px 12px' }}>
                  Unterschrift ansehen →
                </button>
              </a>
              {doc.id_document_path && (
                <a
                  href={`/api/admin/bookings/${id}/document/id`}
                  target="_blank"
                  rel="noreferrer"
                >
                  <button type="button" className="secondary" style={{ padding: '6px 12px' }}>
                    Ausweisdokument ansehen / herunterladen →
                  </button>
                </a>
              )}
            </div>
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
