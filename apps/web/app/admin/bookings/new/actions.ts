'use server';

// Creating a booking from inside the office: someone phones up, or the booking
// is for Wiener Straße, which takes no online requests at all.
//
// It goes through the very same create_booking_request() the public form uses,
// with p_source='internal'. That is the point: one insert path means one place
// where overlap, closing hours and the customer upsert are decided, so an
// internally entered booking cannot quietly break a rule the public form
// enforces. The two differences are deliberate and live in the function itself:
// internal entry skips the lead-time rule (staff may enter tomorrow's booking)
// and may book a phone-only location.
//
// Access control cannot lean on RLS here. create_booking_request is EXECUTE-able
// only by service_role, so this action runs with adminClient() and RLS never
// sees the write — the role and location checks below stand in for the
// bookings_manager_write policy, mirroring has_location().

import { redirect } from 'next/navigation';
import { revalidatePath } from 'next/cache';
import { adminClient } from '@/lib/supabase';
import { loadLocation, parseBerlinLocal, quote } from '@/lib/booking-pricing';
import {
  getSessionUser,
  canApprove,
  actionableLocationIds,
  mayActOnLocation,
} from '@/lib/auth';
import { transitionFor } from '@vs/domain';
import { sendMail } from '@/lib/mail';
import { requestReceivedToCustomer, approvedToCustomer } from '@/lib/mail-send';
import type { BookingMailContext } from '@/lib/mail-vars';
import type { TariffType } from '@/lib/db-types';

/** Fields worth handing back so a rejected form doesn't have to be retyped. */
const ECHO_FIELDS = [
  'school',
  'tariff_type',
  'from',
  'to',
  'persons',
  'event_type',
  'bikes',
  'lang',
  'salutation',
  'first_name',
  'last_name',
  'organization',
  'email',
  'phone',
  'street',
  'house',
  'zip',
  'city',
  'message',
  'internal_notes',
];

function backWithError(formData: FormData, code: string): never {
  const params = new URLSearchParams();
  params.set('error', code);
  for (const field of ECHO_FIELDS) {
    const value = String(formData.get(field) ?? '');
    if (value) params.set(field, value);
  }
  for (const extra of formData.getAll('extras')) {
    params.append('extras', String(extra));
  }
  for (const [key, value] of formData.entries()) {
    if (key.startsWith('extra_qty_') && String(value)) params.set(key, String(value));
  }
  for (const flag of ['approve', 'notify', 'allow_overlap']) {
    if (formData.get(flag)) params.set(flag, 'on');
  }
  redirect(`/admin/bookings/new?${params.toString()}`);
}

/** Reads every `extra_qty_<id>` field into { id: quantity }, dropping zero/blank entries. */
function readExtraQuantities(formData: FormData): Record<string, number> {
  const out: Record<string, number> = {};
  for (const [key, value] of formData.entries()) {
    if (!key.startsWith('extra_qty_')) continue;
    const n = Number(value);
    if (Number.isFinite(n) && n > 0) out[key.slice('extra_qty_'.length)] = n;
  }
  return out;
}

export async function createInternalBooking(formData: FormData): Promise<void> {
  const me = await getSessionUser();
  if (!canApprove(me?.profile?.role)) backWithError(formData, 'forbidden');

  const code = String(formData.get('school') ?? '')
    .trim()
    .toUpperCase();
  if (!code) backWithError(formData, 'missing_location');

  const start = parseBerlinLocal(String(formData.get('from') ?? ''));
  const end = parseBerlinLocal(String(formData.get('to') ?? ''));
  if (!start || !end) backWithError(formData, 'invalid_range');

  const persons = Number(formData.get('persons') ?? 0);
  if (!Number.isFinite(persons) || persons <= 0) backWithError(formData, 'invalid_persons');

  const email = String(formData.get('email') ?? '').trim();
  // An email is optional here — a phone booking may genuinely have none — but
  // if one is given it has to look like one, or the confirmation silently
  // bounces into nowhere.
  if (email && !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) {
    backWithError(formData, 'invalid_email');
  }

  const lang = formData.get('lang') === 'en' ? 'en' : 'de';
  const tariffType = (String(formData.get('tariff_type') ?? 'standard') ||
    'standard') as TariffType;
  const extras = formData.getAll('extras').map(String).filter(Boolean);
  const extraQuantities = readExtraQuantities(formData);
  const bikeCount = Number(formData.get('bikes') ?? 0);
  const bikes = Number.isFinite(bikeCount) && bikeCount > 0 ? { total: bikeCount } : null;

  const location = await loadLocation(code);
  if (!location) backWithError(formData, 'location_not_found');

  const allowed = await actionableLocationIds();
  if (!mayActOnLocation(allowed, location.id)) backWithError(formData, 'forbidden');

  // Price server-side with the shared engine, exactly as the public route does.
  // enforceLeadTime: false matches what create_booking_request does for
  // p_source='internal' — otherwise this would reject a booking the database
  // is about to accept.
  let priced;
  try {
    priced = await quote(
      location,
      { start, end, persons, extras, extraQuantities, bikes: bikes ?? undefined, lang },
      tariffType,
      { enforceLeadTime: false },
    );
  } catch (err) {
    console.error('[internal booking] pricing failed', err);
    backWithError(formData, 'pricing_failed');
  }
  if (!priced.ok) backWithError(formData, priced.errors[0] ?? 'invalid_range');

  const price = priced.price;
  const street = String(formData.get('street') ?? '');
  const house = String(formData.get('house') ?? '');
  const zip = String(formData.get('zip') ?? '');
  const city = String(formData.get('city') ?? '');

  const { data, error } = await adminClient().rpc('create_booking_request', {
    p_location_code: code,
    p_starts_at: start.toISOString(),
    p_ends_at: end.toISOString(),
    p_persons: persons,
    p_customer: {
      salutation: String(formData.get('salutation') ?? '') || null,
      first_name: String(formData.get('first_name') ?? '') || null,
      last_name: String(formData.get('last_name') ?? '') || null,
      organization: String(formData.get('organization') ?? '') || null,
      email: email || null,
      phone: String(formData.get('phone') ?? '') || null,
      street: street || null,
      house_number: house || null,
      zip: zip || null,
      city: city || null,
      address_full: [
        [street, house].filter(Boolean).join(' '),
        [zip, city].filter(Boolean).join(' '),
      ]
        .filter(Boolean)
        .join(', '),
      lang,
    },
    p_price: price
      ? { total: price.total, caution: price.caution, currency: price.currency, breakdown: price }
      : null,
    p_extras: extras,
    p_bikes: bikes,
    p_event_type: String(formData.get('event_type') ?? '') || null,
    p_message: String(formData.get('message') ?? '') || null,
    p_lang: lang,
    p_source: 'internal',
    p_tariff_type: tariffType,
    p_allow_overlap: formData.get('allow_overlap') === 'on',
  });

  if (error) {
    console.error('[internal booking] create_booking_request failed', error);
    backWithError(formData, error.message);
  }

  const booking = (Array.isArray(data) ? data[0] : data) as
    | { id: string; status: string }
    | null;
  if (!booking?.id) backWithError(formData, 'server_error');

  const admin = adminClient();

  const internalNotes = String(formData.get('internal_notes') ?? '').trim();
  if (internalNotes) {
    await admin.from('bookings').update({ internal_notes: internalNotes }).eq('id', booking.id);
  }

  // "Direkt bestätigen" is the common case for a phone booking: the person on
  // the phone already said yes. The target status still comes from the state
  // machine rather than being written literally, so this cannot drift from what
  // the detail page's Bestätigen button does.
  const approveNow = formData.get('approve') !== null;
  const target = approveNow ? transitionFor('requested', 'approve') : null;
  let finalStatus = booking.status;
  if (target) {
    const { error: approveError } = await admin
      .from('bookings')
      .update({ status: target.to, hold_expires_at: null })
      .eq('id', booking.id)
      .eq('status', 'requested');
    if (approveError) {
      console.error('[internal booking] direct approval failed', approveError);
    } else {
      finalStatus = target.to;
    }
  }

  // Best-effort, as everywhere: a booking that exists stays booked whether or
  // not the mail goes out (see lib/mail.ts).
  if (email && formData.get('notify') !== null) {
    const ctx: BookingMailContext = {
      locationName: location.name,
      locationCode: location.code,
      startsAt: start,
      endsAt: end,
      persons,
      eventType: String(formData.get('event_type') ?? '') || null,
      priceTotal: price?.total ?? null,
      caution: price?.caution ?? null,
      customerName:
        [formData.get('first_name'), formData.get('last_name')]
          .map((v) => String(v ?? '').trim())
          .filter(Boolean)
          .join(' ') || email,
      customerEmail: email,
      customerPhone: String(formData.get('phone') ?? '') || null,
      lang,
    };
    const msg =
      finalStatus === 'approved'
        ? await approvedToCustomer(admin, ctx)
        : await requestReceivedToCustomer(admin, ctx);
    if (msg) await sendMail(msg);
  }

  revalidatePath('/admin/bookings');
  revalidatePath('/admin');
  redirect(`/admin/bookings/${booking.id}`);
}
