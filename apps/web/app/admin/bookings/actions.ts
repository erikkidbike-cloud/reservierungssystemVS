'use server';

// Booking lifecycle transitions — the plain one-click path. The 5 actions
// that send customer-facing mail (approve/reject/cancel/confirm/
// send_agreement) also have a "compose first" path at
// app/admin/bookings/[id]/send/[action], which lets staff edit the wording
// for this one send before it goes out; this action sends the template
// as-is, unedited — the quick path for when the default wording is fine.

import { cookies } from 'next/headers';
import { revalidatePath } from 'next/cache';
import { serverClient } from '@/lib/supabase';
import type { BookingAction } from '@vs/domain';
import { sendMail } from '@/lib/mail';
import {
  approvedToCustomer,
  rejectedToCustomer,
  cancelledToCustomer,
  confirmedToCustomer,
  agreementSentToCustomer,
} from '@/lib/mail-send';
import { siteOriginFromHeaders, absoluteUrl } from '@/lib/site-url';
import {
  loadBookingForTransition,
  applyStatusTransition,
  markAgreementSent,
  renderAgreementPdfForBooking,
  toMailContext,
} from '@/lib/booking-transition';

export async function transitionBooking(formData: FormData): Promise<void> {
  const bookingId = String(formData.get('bookingId') ?? '');
  const action = String(formData.get('action') ?? '') as BookingAction;
  const reason = String(formData.get('reason') ?? '').trim() || null;
  if (!bookingId || !action) return;

  const supabase = serverClient(await cookies());
  const b = await loadBookingForTransition(supabase, bookingId);
  const to = await applyStatusTransition(supabase, bookingId, b, action, reason);

  // The status-change audit row is written by the database trigger
  // (log_booking_status_change), so it records the change even if what
  // follows fails. Notification is best-effort and must never undo the
  // transition. send_agreement's documented effect (packages/domain/
  // booking-state.ts) is "email signing link to customer" — the documents
  // row is what the signing page (app/sign/[bookingId]) later updates.
  if (to === 'agreement_sent') {
    await markAgreementSent(supabase, bookingId, b.needs_id_upload);
  }

  const ctx = toMailContext(b);
  if (ctx) {
    let msg = null;
    if (to === 'approved') msg = await approvedToCustomer(supabase, ctx);
    else if (to === 'rejected') msg = await rejectedToCustomer(supabase, ctx, reason);
    else if (to === 'cancelled') msg = await cancelledToCustomer(supabase, ctx, reason);
    // confirm's documented effect (packages/domain/booking-state.ts) includes
    // "confirmation email" — the caretaker tasks it also creates are the
    // database trigger's job (0010_reference_and_tasks.sql), not this action's.
    else if (to === 'confirmed') msg = await confirmedToCustomer(supabase, ctx);
    else if (to === 'agreement_sent') {
      const origin = await siteOriginFromHeaders();
      const signingLink = absoluteUrl(origin, `/sign/${bookingId}`);
      msg = await agreementSentToCustomer(supabase, ctx, signingLink);
      if (msg) msg.attachments = await renderAgreementPdfForBooking(supabase, b, signingLink);
    }
    if (msg) await sendMail(msg);
  }

  revalidatePath('/admin/bookings');
  revalidatePath(`/admin/bookings/${bookingId}`);
  revalidatePath('/admin');
}

/** Internal notes are editable independently of any status change. */
export async function saveInternalNotes(formData: FormData): Promise<void> {
  const bookingId = String(formData.get('bookingId') ?? '');
  if (!bookingId) return;

  const supabase = serverClient(await cookies());
  const { error } = await supabase
    .from('bookings')
    .update({ internal_notes: String(formData.get('internalNotes') ?? '') })
    .eq('id', bookingId);

  if (error) throw new Error(`Notiz konnte nicht gespeichert werden: ${error.message}`);
  revalidatePath(`/admin/bookings/${bookingId}`);
}
