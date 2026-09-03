'use server';

import { redirect } from 'next/navigation';
import { revalidatePath } from 'next/cache';
import { adminClient } from '@/lib/supabase';
import { getSessionUser, canSeeContactData, actionableLocationIds, mayActOnLocation } from '@/lib/auth';
import { parseBerlinLocal } from '@/lib/booking-pricing';

export async function updateBookingAndCustomer(formData: FormData): Promise<void> {
  const me = await getSessionUser();
  if (!me?.profile || !canSeeContactData(me.profile.role)) {
    throw new Error('Forbidden');
  }

  const bookingId = String(formData.get('booking_id') ?? '');
  if (!bookingId) throw new Error('Missing booking_id');

  const admin = adminClient();
  const { data: booking, error: bErr } = await admin
    .from('bookings')
    .select('id, location_id, customer_id, starts_at, ends_at')
    .eq('id', bookingId)
    .single();

  if (bErr || !booking) throw new Error('Booking not found');

  const allowed = await actionableLocationIds();
  if (!mayActOnLocation(allowed, booking.location_id)) {
    throw new Error('Forbidden for this location');
  }

  // Extract customer fields
  const salutation = String(formData.get('salutation') ?? '') || null;
  const firstName = String(formData.get('first_name') ?? '') || null;
  const lastName = String(formData.get('last_name') ?? '') || null;
  const organization = String(formData.get('organization') ?? '') || null;
  const email = String(formData.get('email') ?? '') || null;
  const phone = String(formData.get('phone') ?? '') || null;
  const street = String(formData.get('street') ?? '') || null;
  const house = String(formData.get('house_number') ?? '') || null;
  const zip = String(formData.get('zip') ?? '') || null;
  const city = String(formData.get('city') ?? '') || null;

  const addressFull = [
    [street, house].filter(Boolean).join(' '),
    [zip, city].filter(Boolean).join(' '),
  ]
    .filter(Boolean)
    .join(', ') || null;

  if (booking.customer_id) {
    const { error: custErr } = await admin
      .from('customers')
      .update({
        salutation,
        first_name: firstName,
        last_name: lastName,
        organization,
        email,
        phone,
        street,
        house_number: house,
        zip,
        city,
        address_full: addressFull,
      })
      .eq('id', booking.customer_id);

    if (custErr) console.error('[edit booking] update customer failed', custErr);
  }

  // Extract booking event fields
  const eventType = String(formData.get('event_type') ?? '') || null;
  const personsRaw = formData.get('persons');
  const persons = personsRaw ? parseInt(String(personsRaw), 10) : null;
  const message = String(formData.get('message') ?? '') || null;
  const internalNotes = String(formData.get('internal_notes') ?? '') || null;

  // Optional start/end time updates
  const fromRaw = formData.get('from');
  const toRaw = formData.get('to');
  const start = fromRaw ? parseBerlinLocal(String(fromRaw)) : null;
  const end = toRaw ? parseBerlinLocal(String(toRaw)) : null;

  const bookingUpdates: Record<string, unknown> = {
    event_type: eventType,
    persons: Number.isFinite(persons) ? persons : null,
    message,
    internal_notes: internalNotes,
    updated_at: new Date().toISOString(),
  };

  if (start && end && end > start) {
    bookingUpdates.starts_at = start.toISOString();
    bookingUpdates.ends_at = end.toISOString();
  }

  const { error: updateErr } = await admin
    .from('bookings')
    .update(bookingUpdates)
    .eq('id', bookingId);

  if (updateErr) {
    console.error('[edit booking] update booking failed', updateErr);
    throw new Error(updateErr.message);
  }

  // Log audit event
  await admin.from('booking_events').insert({
    booking_id: bookingId,
    event_type: 'edit',
    actor_id: me.user.id,
    payload: {
      edited_by: me.profile.email,
      customer_updated: !!booking.customer_id,
      fields: Object.keys(bookingUpdates),
    },
  });

  revalidatePath(`/admin/bookings/${bookingId}`);
  revalidatePath('/admin/bookings');
  redirect(`/admin/bookings/${bookingId}`);
}
