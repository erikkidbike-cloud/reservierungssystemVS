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
import { newRequestToLocation, requestReceivedToCustomer } from '@/lib/mail-send';
import type { BookingMailContext } from '@/lib/mail-vars';
import { siteOriginFromRequest, absoluteUrl } from '@/lib/site-url';
import { checkRateLimit, looksLikeBot, BOOKING_LIMITS } from '@/lib/rate-limit';
import { text, idList, countMap, LIMITS } from '@/lib/input';
import type { TariffType } from '@/lib/db-types';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

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
  extra_quantities?: Record<string, number>;
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

  // Abuse protection before anything else touches the database. A bot that
  // filled the honeypot gets the same shape of answer a real over-limit
  // request would, so a scraper learns nothing about which check caught it.
  if (looksLikeBot(body as Record<string, unknown>)) {
    console.warn('[booking-request] honeypot tripped, rejecting');
    return bad('rate_limited', 429);
  }
  const rate = await checkRateLimit(request, BOOKING_LIMITS);
  if (!rate.allowed) {
    console.warn(`[booking-request] rate limit hit: ${rate.tripped}`);
    return bad('rate_limited', 429);
  }

  const code = (text(body.school, 16) ?? '').toUpperCase();
  if (!code) return bad('missing_school');

  // Every free-text field is trimmed and capped before it reaches the
  // database. Rate limiting bounds how many requests arrive, not how big
  // each one is, and `text` columns have no length of their own — see
  // lib/input.ts for why truncating beats rejecting here.
  const f = {
    salutation: text(body.salutation, 32),
    firstName: text(body.first_name),
    lastName: text(body.last_name),
    organization: text(body.organization, LIMITS.medium),
    phone: text(body.phone, 40),
    phoneCountry: text(body.phone_country, 8),
    street: text(body.street, LIMITS.medium),
    house: text(body.house, 32),
    zip: text(body.zip, 16),
    city: text(body.city),
    eventType: text(body.event_type, LIMITS.medium),
    message: text(body.message, LIMITS.message),
    extras: idList(body.extras),
    extraQuantities: countMap(body.extra_quantities),
    bikes: countMap(body.bikes),
  };

  const start = body.from ? parseBerlinLocal(body.from) : null;
  const end = body.to ? parseBerlinLocal(body.to) : null;
  if (!start || !end) return bad('invalid_range');

  const persons = Number(body.persons || 0);
  // Upper bound as well as lower: the number reaches an `int` column and the
  // pricing engine's per-person arithmetic, and no venue here holds a five-digit
  // group. Without it a nonsense value becomes a raw integer-overflow error
  // from Postgres rather than a readable rejection.
  if (!Number.isFinite(persons) || persons <= 0 || persons > 10000) {
    return bad('invalid_persons');
  }

  // tariff_type reaches a Postgres enum. An unknown value would surface as an
  // unmapped 500 from the RPC, so it is narrowed to the known set here and
  // anything else falls back to the standard tariff.
  const tariffType: TariffType =
    body.tariff_type === 'kita_schule' || body.tariff_type === 'nachweis'
      ? body.tariff_type
      : 'standard';

  const email = text(body.email, 254) ?? '';
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
      { start, end, persons, extras: f.extras, extraQuantities: f.extraQuantities ?? undefined, bikes: f.bikes ?? undefined, lang },
      tariffType,
    );
  } catch (err) {
    return bad('pricing_failed', 500, (err as Error).message);
  }

  if (!priced.ok) {
    return bad(priced.errors[0] ?? 'invalid_request', 400, { errors: priced.errors });
  }

  const price = priced.price;
  const admin = adminClient();
  const { data, error } = await admin.rpc('create_booking_request', {
    p_location_code: code,
    p_starts_at: start.toISOString(),
    p_ends_at: end.toISOString(),
    p_persons: persons,
    p_customer: {
      salutation: f.salutation,
      first_name: f.firstName,
      last_name: f.lastName,
      organization: f.organization,
      email,
      phone: f.phone,
      phone_country: f.phoneCountry,
      street: f.street,
      house_number: f.house,
      zip: f.zip,
      city: f.city,
      address_full: [
        [f.street, f.house].filter(Boolean).join(' '),
        [f.zip, f.city].filter(Boolean).join(' '),
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
    p_extras: f.extras,
    p_bikes: f.bikes,
    p_event_type: f.eventType,
    p_message: f.message,
    p_lang: lang,
    p_source: 'public_form',
    p_tariff_type: tariffType,
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
    eventType: f.eventType,
    priceTotal: price?.total ?? null,
    caution: price?.caution ?? null,
    message: f.message,
    customerName: [f.firstName, f.lastName].filter(Boolean).join(' ') || email,
    customerEmail: email,
    customerPhone: f.phone,
    holdExpiresAt: booking?.hold_expires_at ?? null,
    adminUrl: booking?.id
      ? absoluteUrl(siteOriginFromRequest(request), `/admin/bookings/${booking.id}`)
      : null,
    lang,
  };

  // mail_templates' RLS requires auth.uid() is not null (0013_mail_templates.sql)
  // — this route serves anonymous visitors, so template lookups go through
  // adminClient() like every other read this route needs (locations, tariffs).
  const [locationMsg, customerMsg] = await Promise.all([
    location.cc_emails?.length ? newRequestToLocation(admin, ctx, location.cc_emails) : null,
    requestReceivedToCustomer(admin, ctx),
  ]);
  await Promise.all([locationMsg ? sendMail(locationMsg) : null, customerMsg ? sendMail(customerMsg) : null]);

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
