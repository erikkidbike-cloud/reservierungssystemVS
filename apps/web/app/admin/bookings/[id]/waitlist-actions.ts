'use server';

// "Tell the waiting list this slot is free."
//
// Offered as a button on a cancelled booking rather than fired automatically by
// the cancel transition, deliberately: a cancellation is very often followed
// within the minute by the same slot being re-booked for someone else (a
// postponement entered as cancel-then-create, a date corrected). Mailing a
// dozen people the instant the first half of that happens would be worse than
// not mailing them at all — and unlike an internal notice, it cannot be undone.
//
// There is no claim token and no hold: the mail carries a deep link into the
// ordinary public form with venue and date pre-filled, and whoever submits
// first gets the slot. See 0017_waitlist_offers.sql for why that beats a
// second reservation mechanism.

import { revalidatePath } from 'next/cache';
import { adminClient } from '@/lib/supabase';
import {
  getSessionUser,
  canManageWaitlist,
  actionableLocationIds,
  mayActOnLocation,
} from '@/lib/auth';
import { sendMail } from '@/lib/mail';
import { waitlistSlotFreeToCustomer } from '@/lib/mail-send';
import type { BookingMailContext } from '@/lib/mail-vars';
import { siteOriginFromHeaders, absoluteUrl } from '@/lib/site-url';

interface WaitlistMatch {
  id: string;
  customer_name: string;
  customer_email: string;
  customer_phone: string | null;
  persons: number | null;
  starts_at: string;
  ends_at: string;
  created_at: string;
}

/** Everyone waiting for a range that overlaps this booking's. */
export async function waitlistMatchesFor(
  locationId: string,
  startsAt: string,
  endsAt: string,
): Promise<WaitlistMatch[]> {
  const { data, error } = await adminClient().rpc('waitlist_matches', {
    p_location_id: locationId,
    p_starts_at: startsAt,
    p_ends_at: endsAt,
  });
  if (error) {
    console.error('[waitlist] match lookup failed', error);
    return [];
  }
  return (data ?? []) as WaitlistMatch[];
}

function fmtSlot(startsAt: string, endsAt: string, lang: 'de' | 'en'): string {
  const locale = lang === 'en' ? 'en-GB' : 'de-DE';
  const opts: Intl.DateTimeFormatOptions = {
    timeZone: 'Europe/Berlin',
    weekday: 'long',
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  };
  const from = new Date(startsAt).toLocaleString(locale, opts);
  const to = new Date(endsAt).toLocaleString(locale, {
    timeZone: 'Europe/Berlin',
    hour: '2-digit',
    minute: '2-digit',
  });
  return `${from} – ${to}`;
}

/** The date part of an instant, in Berlin, as the public form expects it. */
function berlinDateParam(iso: string): string {
  // en-CA gives YYYY-MM-DD, which is what /book?date= parses.
  return new Date(iso).toLocaleDateString('en-CA', { timeZone: 'Europe/Berlin' });
}

export async function notifyWaitlist(formData: FormData): Promise<void> {
  const bookingId = String(formData.get('bookingId') ?? '');
  if (!bookingId) throw new Error('Missing booking id');

  const me = await getSessionUser();
  if (!me?.auth || !canManageWaitlist(me.auth)) throw new Error('Forbidden');

  const admin = adminClient();
  const { data: booking } = await admin
    .from('bookings')
    .select('id, location_id, starts_at, ends_at, status, locations(code, name)')
    .eq('id', bookingId)
    .maybeSingle();

  if (!booking) throw new Error('Not found');

  const b = booking as unknown as {
    id: string;
    location_id: string;
    starts_at: string;
    ends_at: string;
    status: string;
    locations: { code: string; name: string } | null;
  };

  // adminClient() bypasses RLS, so the location check has to happen here —
  // same reason as app/admin/waitlist/actions.ts.
  const allowed = await actionableLocationIds(me);
  if (!mayActOnLocation(allowed, b.location_id)) throw new Error('Forbidden');

  // Only a slot that is actually free. Announcing an active booking's dates
  // would send a dozen people to a form that will reject them.
  if (!['cancelled', 'postponed', 'rejected', 'expired'].includes(b.status)) {
    throw new Error('Dieser Termin ist nicht frei — es gibt nichts anzubieten.');
  }

  const matches = await waitlistMatchesFor(b.location_id, b.starts_at, b.ends_at);
  if (matches.length === 0) return;

  const origin = await siteOriginFromHeaders();
  const bookingLink = absoluteUrl(
    origin,
    `/book?school=${encodeURIComponent(b.locations?.code ?? '')}&date=${berlinDateParam(b.starts_at)}`,
  );

  let sent = 0;
  for (const m of matches) {
    // Claim BEFORE sending, exactly as the reminder cron does: the unique
    // index on (waitlist_id, starts_at, ends_at) is what makes a second press
    // of the button — or two staff pressing at once — a no-op rather than a
    // second mail. A failure here means somebody else already took this one.
    const { error: claimError } = await admin.from('waitlist_offers').insert({
      waitlist_id: m.id,
      booking_id: b.id,
      starts_at: b.starts_at,
      ends_at: b.ends_at,
      sent_by: me.id,
    });
    if (claimError) continue;

    const ctx: BookingMailContext = {
      locationName: b.locations?.name ?? '',
      locationCode: b.locations?.code ?? '',
      // The recipient's OWN requested range, not the freed one — the offer
      // itself is passed separately as slotLine.
      startsAt: m.starts_at,
      endsAt: m.ends_at,
      persons: m.persons,
      customerName: m.customer_name,
      customerEmail: m.customer_email,
      customerPhone: m.customer_phone,
      lang: 'de',
    };

    const msg = await waitlistSlotFreeToCustomer(
      admin,
      ctx,
      fmtSlot(b.starts_at, b.ends_at, 'de'),
      bookingLink,
    );
    if (msg) {
      await sendMail(msg);
      sent += 1;
    }

    // 'notified' is the person's own status; the offer row is what records
    // which slot they were told about.
    await admin
      .from('waitlist_requests')
      .update({ status: 'notified', notified_at: new Date().toISOString() })
      .eq('id', m.id)
      .eq('status', 'waiting');
  }

  console.info(`[waitlist] announced ${b.starts_at} at ${b.locations?.code} to ${sent} people`);

  revalidatePath(`/admin/bookings/${bookingId}`);
  revalidatePath('/admin/waitlist');
}
