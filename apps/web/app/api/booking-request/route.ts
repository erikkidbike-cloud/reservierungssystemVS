// Public booking submission. Replaces the Netlify function + Apps Script chain.
//
// Trust model: this route runs server-side and is the boundary where an
// untrusted request becomes a booking. It recomputes the price itself and
// discards whatever the client sent, then calls create_booking_request with the
// service role. The database function re-validates and the exclusion constraint
// settles concurrent requests for the same slot.

import { NextResponse } from 'next/server';
import { adminClient } from '@/lib/supabase';
import { loadLocation, parseBerlinLocal, quote } from '@/lib/booking-pricing';
import { sendMail } from '@/lib/mail';
import {
  newRequestToLocation,
  requestReceivedToCustomer,
  type BookingMailContext,
} from '@/lib/mail-templates';
import type { TariffType } from '@/lib/db-types';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

/**
 * Absolute link back into the console for the notification mail. Prefers the
 * configured public URL and falls back to the request's own origin, so a
 * preview deploy links to itself rather than to production.
 */
function absoluteUrl(request: Request, path: string): string {
  const base = process.env.NEXT_PUBLIC_SITE_URL || new URL(request.url).origin;
  return new URL(path, base).toString();
}

/** Machine codes from create_booking_request → HTTP status + message key. */
const DB_ERRORS: Record<string, { status: number; code: string }> = {
  location_not_found: { status: 404, code: 'location_not_found' },
  not_online_bookable: { status: 400, code: 'not_online_bookable' },
  invalid_range: { status: 400, code: 'invalid_range' },
  too_short: { status: 400, code: 'too_short' },
  too_soon: { status: 400, code: 'too_soon' },
  closing_violation: { status: 400, code: 'closing_violation' },
  slot_taken: { status: 409, code: 'slot_taken' },
};

interface Body {
  school?: string;
  from?: string;
  to?: string;
  persons?: number | string;
  extras?: string[];
  bikes?: Record<string, number>;
  event_type?: string;
  message?: string;
  lang?: string;
  tariff_type?: TariffType;
  salutation?: string;
  first_name?: string;
  last_name?: string;
  organization?: string;
  email?: string;
  phone?: string;
  phone_country?: string;
  street?: string;
  house?: string;
  zip?: string;
  city?: string;
}

function bad(code: string, status = 400, detail?: unknown) {
  return NextResponse.json({ ok: false, error: code, detail }, { status });
}

export async function POST(request: Request) {
  let body: Body;
  try {
    body = await request.json();
  } catch {
    return bad('invalid_json');
  }

  const code = (body.school || '').trim().toUpperCase();
  if (!code) return bad('missing_school');

  const start = body.from ? parseBerlinLocal(body.from) : null;
  const end = body.to ? parseBerlinLocal(body.to) : null;
  if (!start || !end) return bad('invalid_range');

  const persons = Number(body.persons || 0);
  if (!Number.isFinite(persons) || persons <= 0) return bad('invalid_persons');

  const email = (body.email || '').trim();
  // Deliberately permissive: the real check is the confirmation mail bouncing.
  if (!email || !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) return bad('invalid_email');

  const lang = body.lang === 'en' ? 'en' : 'de';

  let location;
  try {
    location = await loadLocation(code);
  } catch (err) {
    return bad('server_error', 500, (err as Error).message);
  }
  if (!location) return bad('location_not_found', 404);
  if (location.online_bookability !== 'online') return bad('not_online_bookable');

  // Validate + price server-side. The client's price is ignored entirely.
  let priced;
  try {
    priced = await quote(
      location,
      { start, end, persons, extras: body.extras, bikes: body.bikes, lang },
      body.tariff_type ?? 'standard',
    );
  } catch (err) {
    return bad('pricing_failed', 500, (err as Error).message);
  }

  if (!priced.ok) {
    return bad(priced.errors[0] ?? 'invalid_request', 400, { errors: priced.errors });
  }

  const price = priced.price;
  const { data, error } = await adminClient().rpc('create_booking_request', {
    p_location_code: code,
    p_starts_at: start.toISOString(),
    p_ends_at: end.toISOString(),
    p_persons: persons,
    p_customer: {
      salutation: body.salutation ?? null,
      first_name: body.first_name ?? null,
      last_name: body.last_name ?? null,
      organization: body.organization ?? null,
      email,
      phone: body.phone ?? null,
      phone_country: body.phone_country ?? null,
      street: body.street ?? null,
      house_number: body.house ?? null,
      zip: body.zip ?? null,
      city: body.city ?? null,
      address_full: [
        [body.street, body.house].filter(Boolean).join(' '),
        [body.zip, body.city].filter(Boolean).join(' '),
      ]
        .filter(Boolean)
        .join(', '),
      lang,
    },
    p_price: price
      ? {
          total: price.total,
          caution: price.caution,
          currency: price.currency,
          breakdown: price,
        }
      : null,
    p_extras: body.extras ?? [],
    p_bikes: body.bikes ?? null,
    p_event_type: body.event_type ?? null,
    p_message: body.message ?? null,
    p_lang: lang,
    p_source: 'public_form',
    p_tariff_type: body.tariff_type ?? 'standard',
  });

  if (error) {
    const mapped = DB_ERRORS[error.message];
    if (mapped) return bad(mapped.code, mapped.status);
    console.error('create_booking_request failed', error);
    return bad('server_error', 500);
  }

  const booking = Array.isArray(data) ? data[0] : data;

  // Notification is best-effort and deliberately after the insert: the slot is
  // held whether or not the mail leaves the building (see lib/mail.ts). Awaited
  // rather than fired and forgotten, because a serverless function that has
  // already returned may be frozen before fetch completes.
  const ctx: BookingMailContext = {
    locationName: location.name,
    locationCode: location.code,
    startsAt: start,
    endsAt: end,
    persons,
    eventType: body.event_type ?? null,
    priceTotal: price?.total ?? null,
    caution: price?.caution ?? null,
    message: body.message ?? null,
    customerName:
      [body.first_name, body.last_name].filter(Boolean).join(' ').trim() || email,
    customerEmail: email,
    customerPhone: body.phone ?? null,
    holdExpiresAt: booking?.hold_expires_at ?? null,
    adminUrl: booking?.id ? absoluteUrl(request, `/admin/bookings/${booking.id}`) : null,
    lang,
  };

  await Promise.all([
    location.cc_emails?.length
      ? sendMail(newRequestToLocation(ctx, location.cc_emails))
      : Promise.resolve(),
    sendMail(requestReceivedToCustomer(ctx)),
  ]);

  return NextResponse.json({
    ok: true,
    booking: {
      id: booking?.id,
      starts_at: booking?.starts_at,
      ends_at: booking?.ends_at,
      status: booking?.status,
      hold_expires_at: booking?.hold_expires_at,
      price_total: booking?.price_total,
      caution: booking?.caution,
    },
  });
}
