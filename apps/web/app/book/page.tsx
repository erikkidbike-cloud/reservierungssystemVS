// Public booking entry point — no login, this is what the kidbike.de iframe
// (backlog 2.5 / C3) points at once cutover happens. Two things read from the
// database here and nothing else does:
//
//   - `public_availability` — granted to anon (see 0006_views.sql), the one
//     table-like thing a visitor may query directly. No personal data in it by
//     construction.
//   - `locations` and `tariffs` — NOT granted to anon (their RLS requires
//     auth.uid() is not null), so this page reads them through adminClient()
//     (via lib/booking-pricing.ts's loadLocation/loadActiveLocations/
//     loadTariffConfig) and hands the browser only the safe subset it needs.
//     Submission itself still goes through /api/booking-request, which
//     recomputes and stores the price server-side — nothing this page sends to
//     the browser is trusted back.

import { cookies } from 'next/headers';
import { serverClient } from '@/lib/supabase';
import { loadActiveLocations, loadTariffConfig } from '@/lib/booking-pricing';
import { todayInBerlin, addDaysToDateString, berlinDateOf } from '@/lib/berlin-time';
import type { Location } from '@/lib/db-types';
import BookingWizard, { type DayBlock, type PublicLocation } from './BookingWizard';
import { PublicShell } from '../PublicShell';

export const dynamic = 'force-dynamic';

/** The wizard never sees cc_emails, hold_business_days or any other internal field. */
function toPublicLocation(l: Location): PublicLocation {
  return {
    code: l.code,
    name: l.name,
    address: l.address,
    phone: l.phone,
    onlineBookability: l.online_bookability,
    closingHour: l.closing_hour,
    minLeadDays: l.min_lead_days,
    minDurationMinutes: l.min_duration_minutes,
    gridMinHour: l.grid_min_hour,
    gridMaxEndHour: l.grid_max_end_hour,
  };
}

/** How many days ahead the "has bookings" dots on the date picker look. */
const BROWSE_WINDOW_DAYS = 60;

function isValidDateString(s: string): boolean {
  return /^\d{4}-\d{2}-\d{2}$/.test(s);
}

export default async function BookPage({
  searchParams,
}: {
  searchParams: Promise<{ school?: string; date?: string }>;
}) {
  const params = await searchParams;
  const locations = await loadActiveLocations();
  const publicLocations = locations.map(toPublicLocation);

  const code = (params.school ?? '').trim().toUpperCase();
  const location = locations.find((l) => l.code === code) ?? null;

  if (!location) {
    return (
      <PublicShell width={720}>
        <div className="pagehead">
          <div className="pagehead__text">
            <h1>Termin anfragen</h1>
            <p className="pagehead__sub">
              Bitte wählen Sie zuerst Ihre Verkehrsschule.
            </p>
          </div>
        </div>
        <div className="cards">
          {publicLocations.map((l) => (
            <a key={l.code} href={`/book?school=${l.code}`} style={{ textDecoration: 'none', color: 'inherit' }}>
              <div className="card">
                <h3 style={{ marginTop: 0 }}>{l.name}</h3>
                <p className="muted small" style={{ margin: 0 }}>
                  {l.address}
                </p>
                <span
                  className={l.onlineBookability === 'online' ? 'badge badge--ok' : 'badge'}
                  style={{ marginTop: 8, display: 'inline-block' }}
                >
                  {l.onlineBookability === 'online'
                    ? 'Online buchbar'
                    : l.onlineBookability === 'phone_only'
                      ? 'Telefonisch buchbar'
                      : 'Derzeit nicht buchbar'}
                </span>
              </div>
            </a>
          ))}
        </div>
      </PublicShell>
    );
  }

  const today = todayInBerlin();
  const date = params.date && isValidDateString(params.date) ? params.date : today;

  // Server runs with TZ=Europe/Berlin (see .env.example), so the local
  // multi-argument Date constructor here already yields the correct Berlin
  // midnight instant — the same technique lib/booking-pricing.ts's
  // parseBerlinLocal uses, just for a bare date instead of a date+time.
  const [y, m, d] = date.split('-').map(Number);
  const dayStart = new Date(y, m - 1, d);
  const dayEnd = new Date(y, m - 1, d + 1);
  const [ty, tm, td] = today.split('-').map(Number);
  const browseStart = new Date(ty, tm - 1, td);
  const browseEnd = new Date(ty, tm - 1, td + BROWSE_WINDOW_DAYS);

  const supabase = serverClient(await cookies());

  const [{ data: dayRows, error: dayError }, { data: rangeRows }] = await Promise.all([
    supabase
      .from('public_availability')
      .select('starts_at, ends_at, kind, public_title, public_link, color, public_description')
      .eq('location_code', location.code)
      .lt('starts_at', dayEnd.toISOString())
      .gt('ends_at', dayStart.toISOString())
      .order('starts_at'),
    supabase
      .from('public_availability')
      .select('starts_at, ends_at')
      .eq('location_code', location.code)
      .lt('starts_at', browseEnd.toISOString())
      .gt('ends_at', browseStart.toISOString()),
  ]);

  if (dayError) {
    return (
      <PublicShell width={720}>
        <h1>{location.name}</h1>
        <div className="notice">Kalender konnte nicht geladen werden: {dayError.message}</div>
      </PublicShell>
    );
  }

  const dayBlocks: DayBlock[] = ((dayRows ?? []) as Array<{
    starts_at: string;
    ends_at: string;
    kind: DayBlock['kind'];
    public_title: string | null;
    public_link: string | null;
    color: string | null;
    public_description: string | null;
  }>).map((r) => ({
    startsAt: r.starts_at,
    endsAt: r.ends_at,
    kind: r.kind,
    publicTitle: r.public_title,
    publicLink: r.public_link,
    color: r.color,
    publicDescription: r.public_description,
  }));

  const bookedDates = new Set<string>();
  for (const r of (rangeRows ?? []) as Array<{ starts_at: string; ends_at: string }>) {
    let cur = berlinDateOf(r.starts_at);
    const last = berlinDateOf(r.ends_at);
    let guard = 0;
    while (cur <= last && guard < 120) {
      bookedDates.add(cur);
      cur = addDaysToDateString(cur, 1);
      guard++;
    }
  }

  let tariffConfig = null;
  let tariffError: string | null = null;
  if (location.online_bookability === 'online') {
    try {
      tariffConfig = await loadTariffConfig(location.id, 'standard');
    } catch (err) {
      tariffError = (err as Error).message;
    }
  }

  return (
    <PublicShell width={720}>
      <p className="small">
        <a href="/book">← Alle Standorte</a>
      </p>
      <h1 style={{ marginBottom: 4 }}>{location.name}</h1>
      <p className="muted small" style={{ marginTop: 0 }}>
        {location.address}
      </p>

      <BookingWizard
        location={toPublicLocation(location)}
        date={date}
        dayBlocks={dayBlocks}
        bookedDates={Array.from(bookedDates)}
        tariffConfig={tariffConfig}
        tariffError={tariffError}
      />
    </PublicShell>
  );
}
