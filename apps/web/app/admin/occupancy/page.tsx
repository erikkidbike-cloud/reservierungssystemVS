// Occupancy: how full each Verkehrsschule actually was, month by month.
//
// The dashboard chart counts BOOKINGS, which flatters a venue taking many
// short ones and punishes one taking a few long ones. This page answers the
// question a board actually asks — hours sold against hours available — using
// each location's own bookable window as the denominator. See
// 0018_occupancy.sql for why blocks are reported beside that number rather
// than subtracted from it.
//
// Server-rendered bars, one hue per row, no chart library and no client
// JavaScript — the same way the dashboard chart is built.

import Link from 'next/link';
import { cookies } from 'next/headers';
import { serverClient } from '@/lib/supabase';
import { getSessionUser, can } from '@/lib/auth';

export const dynamic = 'force-dynamic';

interface OccupancyRow {
  location_id: string;
  location_code: string;
  location_name: string;
  month: string;
  booked_hours: number;
  blocked_hours: number;
  available_hours: number;
  booked_pct: number;
}

const monthFmt = new Intl.DateTimeFormat('de-DE', {
  month: 'short',
  year: '2-digit',
  timeZone: 'Europe/Berlin',
});

const num = new Intl.NumberFormat('de-DE', { maximumFractionDigits: 0 });
const pct = new Intl.NumberFormat('de-DE', { maximumFractionDigits: 1 });

/** The twelve months ending with the current one. */
function defaultRange(): { from: string; to: string } {
  const now = new Date();
  const to = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1));
  const from = new Date(Date.UTC(to.getUTCFullYear(), to.getUTCMonth() - 11, 1));
  const iso = (d: Date) => d.toISOString().slice(0, 10);
  return { from: iso(from), to: iso(to) };
}

export default async function OccupancyPage({
  searchParams,
}: {
  searchParams: Promise<{ from?: string; to?: string }>;
}) {
  const me = await getSessionUser();
  const auth = me?.auth;

  if (!can(auth, 'bookings.read')) {
    return (
      <>
        <h1>Auslastung</h1>
        <div className="notice">Für diese Rolle gibt es keine Auslastungszahlen.</div>
      </>
    );
  }

  const params = await searchParams;
  const fallback = defaultRange();
  const isDate = (s: string | undefined) => !!s && /^\d{4}-\d{2}-\d{2}$/.test(s);
  const from = isDate(params.from) ? params.from! : fallback.from;
  const to = isDate(params.to) ? params.to! : fallback.to;

  const supabase = serverClient(await cookies());
  const { data, error } = await supabase.rpc('occupancy_by_month', { p_from: from, p_to: to });

  if (error) {
    return (
      <>
        <h1>Auslastung</h1>
        <div className="notice">Konnte die Auslastung nicht berechnen: {error.message}</div>
      </>
    );
  }

  const rows = (data ?? []) as OccupancyRow[];

  // Group by location, keeping the month order the function returned.
  const byLocation = new Map<string, OccupancyRow[]>();
  for (const r of rows) {
    const list = byLocation.get(r.location_code) ?? [];
    list.push(r);
    byLocation.set(r.location_code, list);
  }

  // One scale across every venue, so the bars are comparable between the
  // panels — a per-venue scale would make a quiet month at a big venue look
  // like a busy one at a small venue.
  const peak = Math.max(1, ...rows.map((r) => r.booked_pct));

  return (
    <>
      <h1>Auslastung</h1>
      <p className="muted">
        Gebuchte Stunden gegen die buchbaren Stunden des Standorts (sein eigenes
        Zeitfenster × Tage im Monat). Gesperrte Zeiten stehen daneben und werden{' '}
        <em>nicht</em> abgezogen — eine Schließung ist kein volles Haus.
      </p>

      <form className="row" style={{ alignItems: 'flex-end', gap: 12, marginTop: 16 }}>
        <label style={{ marginBottom: 0 }}>
          Von
          <input type="date" name="from" defaultValue={from} />
        </label>
        <label style={{ marginBottom: 0 }}>
          Bis
          <input type="date" name="to" defaultValue={to} />
        </label>
        <button type="submit" className="secondary">
          Zeitraum anzeigen
        </button>
      </form>

      {rows.length === 0 && (
        <p className="muted" style={{ marginTop: 24 }}>
          Für diesen Zeitraum gibt es noch keine Zahlen.
        </p>
      )}

      {[...byLocation.entries()].map(([code, months]) => {
        const totalBooked = months.reduce((s, m) => s + Number(m.booked_hours), 0);
        const totalAvailable = months.reduce((s, m) => s + Number(m.available_hours), 0);
        const totalBlocked = months.reduce((s, m) => s + Number(m.blocked_hours), 0);
        const overall = totalAvailable > 0 ? (totalBooked * 100) / totalAvailable : 0;

        return (
          <div className="panel" key={code}>
            <div className="row" style={{ justifyContent: 'space-between', alignItems: 'baseline' }}>
              <h2 style={{ marginTop: 0, marginBottom: 0 }}>
                {months[0].location_name} <span className="muted small">({code})</span>
              </h2>
              <span className="muted small">
                Gesamt {pct.format(overall)} % · {num.format(totalBooked)} von{' '}
                {num.format(totalAvailable)} h
                {totalBlocked > 0 && <> · {num.format(totalBlocked)} h gesperrt</>}
              </span>
            </div>

            <table style={{ marginTop: 16 }}>
              <thead>
                <tr>
                  <th style={{ width: '5.5rem' }}>Monat</th>
                  <th>Auslastung</th>
                  <th style={{ width: '4.5rem', textAlign: 'right' }}>%</th>
                  <th style={{ width: '7rem', textAlign: 'right' }}>Gebucht</th>
                  <th style={{ width: '7rem', textAlign: 'right' }}>Gesperrt</th>
                </tr>
              </thead>
              <tbody>
                {months.map((m) => (
                  <tr key={m.month}>
                    <td style={{ whiteSpace: 'nowrap' }}>
                      {monthFmt.format(new Date(`${m.month}T12:00:00Z`))}
                    </td>
                    <td>
                      <div className="occ__track">
                        <div
                          className="occ__fill"
                          style={{ width: `${(Number(m.booked_pct) / peak) * 100}%` }}
                        />
                      </div>
                    </td>
                    <td style={{ textAlign: 'right', fontVariantNumeric: 'tabular-nums' }}>
                      {pct.format(Number(m.booked_pct))}
                    </td>
                    <td className="muted" style={{ textAlign: 'right', fontVariantNumeric: 'tabular-nums' }}>
                      {num.format(Number(m.booked_hours))} h
                    </td>
                    <td className="muted" style={{ textAlign: 'right', fontVariantNumeric: 'tabular-nums' }}>
                      {Number(m.blocked_hours) > 0 ? `${num.format(Number(m.blocked_hours))} h` : '—'}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        );
      })}

      <p className="muted small" style={{ marginTop: 24 }}>
        Das buchbare Zeitfenster je Standort wird unter{' '}
        <Link href="/admin/tariffs">Preise</Link> gepflegt. Wird es geändert,
        ändert sich diese Prozentzahl rückwirkend mit — sie ist immer relativ zum
        heutigen Fenster.
      </p>
    </>
  );
}
