// Payments (backlog 4.1). Two sections:
//   - bookings awaiting payment (status = 'signed') with a manual "record
//     payment" form — this works today, with no SevDesk integration at all.
//   - recently recorded payments, for reference.
//
// The automated side (api/cron/sync-payments) uses the exact same
// lib/payments.ts#applyPayment() this form does, so a SevDesk match and a
// staff member typing an amount in by hand are recorded identically —
// the only difference is match_kind ('sevdesk' vs 'manual').

import { cookies } from 'next/headers';
import { serverClient } from '@/lib/supabase';
import { getSessionUser, canManagePayments } from '@/lib/auth';
import { fmtEuro, fmtDateTime } from '@/lib/booking-labels';
import { recordPayment } from './actions';

export const dynamic = 'force-dynamic';

interface AwaitingRow {
  id: string;
  starts_at: string;
  price_total: number | null;
  caution: number | null;
  verwendungszweck: string | null;
  locations: { code: string; name: string } | null;
  customers: { first_name: string | null; last_name: string | null; email: string | null } | null;
}

interface PaymentRow {
  id: string;
  amount: number;
  purpose: string | null;
  booked_at: string | null;
  match_kind: string | null;
  bookings: { id: string; starts_at: string; locations: { code: string } | null } | null;
}

export default async function PaymentsPage() {
  const me = await getSessionUser();
  const auth = me?.auth;

  if (!canManagePayments(auth)) {
    return (
      <>
        <h1>Zahlungen</h1>
        <div className="notice">Zahlungen sehen und erfassen können Administration und Finanzen.</div>
      </>
    );
  }

  const supabase = serverClient(await cookies());

  const [{ data: awaiting, error: awaitingError }, { data: recent }] = await Promise.all([
    supabase
      .from('bookings')
      .select(
        'id, starts_at, price_total, caution, verwendungszweck, locations(code, name), ' +
          'customers(first_name, last_name, email)',
      )
      .eq('status', 'signed')
      .order('starts_at'),
    supabase
      .from('payments')
      .select('id, amount, purpose, booked_at, match_kind, bookings(id, starts_at, locations(code))')
      .order('created_at', { ascending: false })
      .limit(20),
  ]);

  if (awaitingError) {
    return (
      <>
        <h1>Zahlungen</h1>
        <div className="notice">Konnte Buchungen nicht laden: {awaitingError.message}</div>
      </>
    );
  }

  const rows = (awaiting ?? []) as unknown as AwaitingRow[];
  const payments = (recent ?? []) as unknown as PaymentRow[];

  return (
    <>
      <h1>Zahlungen</h1>
      <p className="muted">
        Automatischer SevDesk-Abgleich ist vorbereitet, aber noch nicht produktiv (kein API-Token
        hinterlegt — siehe docs/05-open-questions.md, Frage 14). Bis dahin hier manuell erfassen: der
        Status wechselt dabei genauso auf „Bezahlt“ wie ein automatischer Treffer es täte.
      </p>

      <h2>Wartet auf Zahlung</h2>
      {rows.length === 0 ? (
        <p className="muted">Keine Buchung wartet aktuell auf eine Zahlung.</p>
      ) : (
        rows.map((b) => {
          const name = [b.customers?.first_name, b.customers?.last_name].filter(Boolean).join(' ');
          return (
            <div key={b.id} className="panel">
              <div className="row" style={{ justifyContent: 'space-between' }}>
                <div>
                  <strong>
                    {b.locations?.name} · {fmtDateTime(b.starts_at)}
                  </strong>
                  <p className="muted small" style={{ margin: '4px 0 0' }}>
                    {name || '—'} {b.customers?.email ? `· ${b.customers.email}` : ''}
                  </p>
                  <p className="muted small" style={{ margin: 0 }}>
                    Erwarteter Betrag: {fmtEuro(b.price_total)}
                    {b.caution ? ` + Kaution ${fmtEuro(b.caution)}` : ''} · Verwendungszweck:{' '}
                    <code>{b.verwendungszweck ?? '—'}</code>
                  </p>
                </div>
                <form action={recordPayment} className="row" style={{ marginBottom: 0 }}>
                  <input type="hidden" name="bookingId" value={b.id} />
                  <input type="hidden" name="purpose" value={b.verwendungszweck ?? ''} />
                  <input
                    type="number"
                    name="amount"
                    step="0.01"
                    min={0}
                    defaultValue={b.price_total ?? undefined}
                    style={{ width: 120 }}
                    required
                  />
                  <button type="submit">Als bezahlt erfassen</button>
                </form>
              </div>
            </div>
          );
        })
      )}

      <h2>Zuletzt erfasst</h2>
      {payments.length === 0 ? (
        <p className="muted">Noch keine Zahlungen erfasst.</p>
      ) : (
        <div className="table-scroll">
          <table>
            <thead>
              <tr>
                <th>Datum</th>
                <th>Standort</th>
                <th>Betrag</th>
                <th>Verwendungszweck</th>
                <th>Herkunft</th>
              </tr>
            </thead>
            <tbody>
              {payments.map((p) => (
                <tr key={p.id}>
                  <td>{p.booked_at ?? '—'}</td>
                  <td>{p.bookings?.locations?.code ?? '—'}</td>
                  <td>{fmtEuro(p.amount)}</td>
                  <td>{p.purpose ?? '—'}</td>
                  <td>{p.match_kind === 'sevdesk' ? 'SevDesk' : 'Manuell'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </>
  );
}
