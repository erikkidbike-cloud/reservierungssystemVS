// Console overview. Answers two questions in that order: "what needs me
// today" (the action tiles and the week's agenda) and "how are we doing" (the
// twelve-month chart and the money tiles, for the roles allowed to see money).
//
// Every count is a link to the screen that resolves it — a dashboard number
// you cannot act on is decoration.
//
// The chart is server-rendered inline SVG: one series, one hue, no library and
// no client JavaScript, matching how the rest of this console is built.

import Link from 'next/link';
import { cookies } from 'next/headers';
import { serverClient } from '@/lib/supabase';
import {
  getSessionUser,
  bookingsRelationFor,
  canSeeContactData,
  canManagePayments,
  canSeeTasks,
} from '@/lib/auth';
import { fmtEuro, STATUS_LABEL, statusBadgeClass } from '@/lib/booking-labels';
import type { BookingStatus } from '@/lib/db-types';

export const dynamic = 'force-dynamic';

interface AgendaRow {
  id: string;
  location_code: string;
  starts_at: string;
  ends_at: string;
  persons: number | null;
  event_type: string | null;
  status: BookingStatus;
}

/** Berlin-local day/time, the only clock this system reasons in. */
const dayFmt = new Intl.DateTimeFormat('de-DE', {
  weekday: 'short',
  day: '2-digit',
  month: '2-digit',
  timeZone: 'Europe/Berlin',
});
const timeFmt = new Intl.DateTimeFormat('de-DE', {
  hour: '2-digit',
  minute: '2-digit',
  timeZone: 'Europe/Berlin',
});
const monthFmt = new Intl.DateTimeFormat('de-DE', { month: 'short', timeZone: 'Europe/Berlin' });

function StatTile({
  label,
  value,
  href,
  hint,
  tone = 'neutral',
}: {
  label: string;
  value: string | number;
  href?: string;
  hint?: string;
  tone?: 'neutral' | 'attention' | 'ok';
}) {
  const body = (
    <div className={`stat stat--${tone}`}>
      <span className="stat__value">{value}</span>
      <span className="stat__label">{label}</span>
      {hint && <span className="stat__hint">{hint}</span>}
    </div>
  );
  return href ? (
    <Link href={href} className="stat__link">
      {body}
    </Link>
  ) : (
    body
  );
}

/**
 * Twelve months of booking counts as a bar chart. Single series, so no legend
 * (the heading names it) and only the tallest bar carries a direct label —
 * a number over every bar is noise, and the axis already gives the scale.
 */
function MonthlyChart({ data }: { data: Array<{ label: string; count: number }> }) {
  const max = Math.max(1, ...data.map((d) => d.count));
  const w = 100 / data.length;

  if (data.every((d) => d.count === 0)) {
    return <p className="muted">Noch keine Buchungen im letzten Jahr.</p>;
  }

  return (
    <div className="chart">
      <div className="chart__plot" role="img" aria-label="Buchungen pro Monat, letzte zwölf Monate">
        {data.map((d, i) => {
          const h = (d.count / max) * 100;
          return (
            <div key={i} className="chart__col" style={{ width: `${w}%` }}>
              {d.count === max && d.count > 0 && <span className="chart__peak">{d.count}</span>}
              <div
                className="chart__bar"
                style={{ height: `${Math.max(h, d.count > 0 ? 4 : 0)}%` }}
                title={`${d.label}: ${d.count}`}
              />
            </div>
          );
        })}
      </div>
      <div className="chart__axis">
        {data.map((d, i) => (
          <span key={i} style={{ width: `${w}%` }}>
            {d.label}
          </span>
        ))}
      </div>
    </div>
  );
}

export default async function AdminHome() {
  const user = await getSessionUser();
  const auth = user?.auth;
  const relation = bookingsRelationFor(auth);
  const showMoney = canSeeContactData(auth);
  const supabase = serverClient(await cookies());

  const now = new Date();
  const weekAhead = new Date(now);
  weekAhead.setDate(weekAhead.getDate() + 7);
  const yearAgo = new Date(now);
  yearAgo.setMonth(yearAgo.getMonth() - 11, 1);
  yearAgo.setHours(0, 0, 0, 0);
  const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);

  const [
    { count: openRequests },
    { count: awaitingPayment },
    { data: agendaRows },
    { count: openTasks },
    { count: waitlistCount },
    { data: yearRows },
    { data: monthRevenueRows },
  ] = await Promise.all([
    supabase.from(relation).select('id', { count: 'exact', head: true }).eq('status', 'requested'),
    supabase.from(relation).select('id', { count: 'exact', head: true }).eq('status', 'signed'),
    supabase
      .from(relation)
      .select('id, location_code, starts_at, ends_at, persons, event_type, status')
      .gte('starts_at', now.toISOString())
      .lte('starts_at', weekAhead.toISOString())
      .order('starts_at')
      .limit(25),
    canSeeTasks(auth)
      ? supabase.from('tasks').select('id', { count: 'exact', head: true }).eq('status', 'open')
      : Promise.resolve({ count: 0 }),
    showMoney
      ? supabase
          .from('waitlist_requests')
          .select('id', { count: 'exact', head: true })
          .eq('status', 'waiting')
      : Promise.resolve({ count: 0 }),
    supabase
      .from(relation)
      .select('starts_at, status')
      .gte('starts_at', yearAgo.toISOString())
      .lte('starts_at', now.toISOString())
      .limit(2000),
    showMoney
      ? supabase
          .from('bookings')
          .select('price_total')
          .gte('starts_at', monthStart.toISOString())
          .in('status', ['paid', 'confirmed', 'completed'])
          .limit(1000)
      : Promise.resolve({ data: [] }),
  ]);

  const agenda = (agendaRows ?? []) as AgendaRow[];

  // Twelve buckets ending with the current month, so the axis always reads
  // left-to-right up to "now" regardless of how much history exists.
  const buckets: Array<{ label: string; count: number; key: string }> = [];
  for (let i = 11; i >= 0; i--) {
    const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
    buckets.push({ label: monthFmt.format(d), count: 0, key: `${d.getFullYear()}-${d.getMonth()}` });
  }
  const byKey = new Map(buckets.map((b) => [b.key, b]));
  for (const r of (yearRows ?? []) as Array<{ starts_at: string; status: BookingStatus }>) {
    if (['rejected', 'expired', 'cancelled'].includes(r.status)) continue;
    const d = new Date(r.starts_at);
    const bucket = byKey.get(`${d.getFullYear()}-${d.getMonth()}`);
    if (bucket) bucket.count += 1;
  }

  const monthRevenue = ((monthRevenueRows ?? []) as Array<{ price_total: number | null }>).reduce(
    (sum, r) => sum + (r.price_total ?? 0),
    0,
  );

  return (
    <>
      <h1>Übersicht</h1>

      <h2 className="section-title">Braucht Aufmerksamkeit</h2>
      <div className="stats">
        <StatTile
          label="Offene Anfragen"
          value={openRequests ?? 0}
          href="/admin/bookings?filter=requested"
          tone={(openRequests ?? 0) > 0 ? 'attention' : 'neutral'}
          hint="warten auf Zu- oder Absage"
        />
        <StatTile
          label="Wartet auf Zahlung"
          value={awaitingPayment ?? 0}
          href={canManagePayments(auth) ? '/admin/payments' : '/admin/bookings'}
          hint="unterschrieben, noch nicht bezahlt"
        />
        {canSeeTasks(auth) && (
          <StatTile label="Offene Aufgaben" value={openTasks ?? 0} href="/admin/tasks" hint="Öffnen, Schließen, Kaution" />
        )}
        {showMoney && (
          <StatTile label="Warteliste" value={waitlistCount ?? 0} href="/admin/waitlist" hint="wartet auf einen freien Termin" />
        )}
      </div>

      <h2 className="section-title">Die nächsten 7 Tage</h2>
      {agenda.length === 0 ? (
        <p className="muted">Nichts geplant in den nächsten sieben Tagen.</p>
      ) : (
        <div className="agenda">
          {agenda.map((b) => (
            <Link key={b.id} href={`/admin/bookings/${b.id}`} className="agenda__row">
              <span className="agenda__when">
                <strong>{dayFmt.format(new Date(b.starts_at))}</strong>
                <span className="muted small">
                  {timeFmt.format(new Date(b.starts_at))}–{timeFmt.format(new Date(b.ends_at))}
                </span>
              </span>
              <span className="agenda__what">
                <strong>{b.location_code}</strong> · {b.event_type || 'Buchung'}
                {b.persons ? ` · ${b.persons} Pers.` : ''}
              </span>
              <span className={statusBadgeClass(b.status)}>{STATUS_LABEL[b.status] ?? b.status}</span>
            </Link>
          ))}
        </div>
      )}

      <h2 className="section-title">Buchungen pro Monat</h2>
      <div className="panel">
        <MonthlyChart data={buckets} />
      </div>

      {showMoney && (
        <>
          <h2 className="section-title">Entgelte</h2>
          <div className="stats">
            <StatTile
              label="Diesen Monat"
              value={fmtEuro(monthRevenue)}
              tone="ok"
              hint="bezahlte, gebuchte und abgeschlossene Termine"
            />
            <StatTile
              label="Termine gesamt (12 Mon.)"
              value={buckets.reduce((s, b) => s + b.count, 0)}
              hint="ohne abgesagte und abgelaufene"
            />
          </div>
        </>
      )}
    </>
  );
}
