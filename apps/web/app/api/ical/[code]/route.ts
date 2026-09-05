// iCal feed per location, so a caretaker or location manager can subscribe
// from their own calendar app instead of opening the console.
//
// Authenticated by an unguessable per-location token in the URL rather than a
// session, because calendar apps cannot log in — the same trust model as the
// signing link. The token is per location (locations.ical_token, 0015), so one
// leaked feed exposes only that location and can be rotated on its own from
// /admin/events without disturbing the others.
//
// What it exposes is deliberately close to what staff need on a phone and no
// more: time, location, event type, party size, status and — only for a
// booking that is actually going ahead — the contact name and phone, which is
// exactly what someone opening or closing the venue needs.

import { adminClient } from '@/lib/supabase';
import { timingSafeCompare } from '@/lib/secrets';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

interface FeedRow {
  id: string;
  starts_at: string;
  ends_at: string;
  status: string;
  persons: number | null;
  event_type: string | null;
  customers: { first_name: string | null; last_name: string | null; phone: string | null } | null;
}

interface BlockRow {
  id: string;
  starts_at: string;
  ends_at: string;
  title: string | null;
  kind: string;
  is_public: boolean;
  public_title: string | null;
}

/** iCal wants UTC basic-format timestamps: 20260828T140000Z. */
function icalStamp(iso: string): string {
  return new Date(iso).toISOString().replace(/[-:]/g, '').replace(/\.\d{3}/, '');
}

/**
 * RFC 5545 text escaping plus the 75-octet line folding it requires. Long
 * SUMMARY/DESCRIPTION lines are common here (a name plus a phone number), and
 * some calendar clients genuinely reject unfolded ones.
 */
function icalText(value: string): string {
  return value.replace(/\\/g, '\\\\').replace(/;/g, '\\;').replace(/,/g, '\\,').replace(/\r?\n/g, '\\n');
}

function fold(line: string): string {
  if (line.length <= 75) return line;
  const parts: string[] = [line.slice(0, 75)];
  let rest = line.slice(75);
  while (rest.length > 74) {
    parts.push(' ' + rest.slice(0, 74));
    rest = rest.slice(74);
  }
  if (rest) parts.push(' ' + rest);
  return parts.join('\r\n');
}

const STATUS_LABEL: Record<string, string> = {
  requested: 'Angefragt',
  approved: 'Bestätigt',
  agreement_sent: 'NV versandt',
  signed: 'Unterschrieben',
  paid: 'Bezahlt',
  confirmed: 'Gebucht',
  completed: 'Abgeschlossen',
};

/** Statuses whose contact details staff on site actually need. */
const SHOW_CONTACT_FOR = ['approved', 'agreement_sent', 'signed', 'paid', 'confirmed'];

export async function GET(
  request: Request,
  { params }: { params: Promise<{ code: string }> },
): Promise<Response> {
  const { code } = await params;
  const token = new URL(request.url).searchParams.get('token') ?? '';
  const locationCode = code.toUpperCase();

  const admin = adminClient();
  const { data: location } = await admin
    .from('locations')
    .select('id, code, name, ical_token')
    .eq('code', locationCode)
    .maybeSingle();

  // One answer for "no such location" and "wrong token", so the feed URL can't
  // be used to enumerate which location codes exist.
  if (!location || !timingSafeCompare(token, location.ical_token)) {
    return new Response('Not found', { status: 404 });
  }

  // A rolling window rather than all history: a calendar app re-fetches this
  // regularly and nobody needs last year's bookings on their phone.
  const from = new Date();
  from.setMonth(from.getMonth() - 1);
  const to = new Date();
  to.setFullYear(to.getFullYear() + 1);

  const [{ data: bookingRows }, { data: blockRows }] = await Promise.all([
    admin
      .from('bookings')
      .select('id, starts_at, ends_at, status, persons, event_type, customers(first_name, last_name, phone)')
      .eq('location_id', location.id)
      .gte('starts_at', from.toISOString())
      .lte('starts_at', to.toISOString())
      .in('status', ['requested', 'approved', 'agreement_sent', 'signed', 'paid', 'confirmed', 'completed'])
      .order('starts_at'),
    admin
      .from('blocks')
      .select('id, starts_at, ends_at, title, kind, is_public, public_title')
      .eq('location_id', location.id)
      .gte('starts_at', from.toISOString())
      .lte('starts_at', to.toISOString())
      .order('starts_at'),
  ]);

  const now = icalStamp(new Date().toISOString());
  const lines: string[] = [
    'BEGIN:VCALENDAR',
    'VERSION:2.0',
    'PRODID:-//KidBike e.V.//Verkehrsschulen//DE',
    'CALSCALE:GREGORIAN',
    'METHOD:PUBLISH',
    `X-WR-CALNAME:${icalText(location.name)}`,
    'X-WR-TIMEZONE:Europe/Berlin',
    // Ask clients not to hammer the endpoint; most honour one of these.
    'REFRESH-INTERVAL;VALUE=DURATION:PT1H',
    'X-PUBLISHED-TTL:PT1H',
  ];

  for (const b of ((bookingRows ?? []) as unknown as FeedRow[])) {
    const name = [b.customers?.first_name, b.customers?.last_name].filter(Boolean).join(' ');
    const showContact = SHOW_CONTACT_FOR.includes(b.status);
    const summary = [
      b.event_type || 'Buchung',
      showContact && name ? `– ${name}` : '',
      `(${STATUS_LABEL[b.status] ?? b.status})`,
    ]
      .filter(Boolean)
      .join(' ');

    const description = [
      `Status: ${STATUS_LABEL[b.status] ?? b.status}`,
      b.persons ? `Personen: ${b.persons}` : '',
      showContact && name ? `Kontakt: ${name}` : '',
      showContact && b.customers?.phone ? `Telefon: ${b.customers.phone}` : '',
    ]
      .filter(Boolean)
      .join('\n');

    lines.push(
      'BEGIN:VEVENT',
      `UID:booking-${b.id}@kidbike.de`,
      `DTSTAMP:${now}`,
      `DTSTART:${icalStamp(b.starts_at)}`,
      `DTEND:${icalStamp(b.ends_at)}`,
      fold(`SUMMARY:${icalText(summary)}`),
      fold(`DESCRIPTION:${icalText(description)}`),
      fold(`LOCATION:${icalText(location.name)}`),
      b.status === 'requested' ? 'STATUS:TENTATIVE' : 'STATUS:CONFIRMED',
      'END:VEVENT',
    );
  }

  for (const bl of ((blockRows ?? []) as BlockRow[])) {
    const title = bl.is_public ? bl.public_title || bl.title || 'Veranstaltung' : bl.title || 'Gesperrt';
    lines.push(
      'BEGIN:VEVENT',
      `UID:block-${bl.id}@kidbike.de`,
      `DTSTAMP:${now}`,
      `DTSTART:${icalStamp(bl.starts_at)}`,
      `DTEND:${icalStamp(bl.ends_at)}`,
      fold(`SUMMARY:${icalText(title)}`),
      fold(`DESCRIPTION:${icalText(`Sperrung / Termin (${bl.kind})`)}`),
      fold(`LOCATION:${icalText(location.name)}`),
      'STATUS:CONFIRMED',
      'END:VEVENT',
    );
  }

  lines.push('END:VCALENDAR');

  return new Response(lines.join('\r\n') + '\r\n', {
    status: 200,
    headers: {
      'content-type': 'text/calendar; charset=utf-8',
      'content-disposition': `inline; filename="${location.code.toLowerCase()}.ics"`,
      // The token is in the URL: never let a shared cache hold this.
      'cache-control': 'private, no-store',
    },
  });
}
