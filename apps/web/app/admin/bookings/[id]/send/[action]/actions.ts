'use server';

// Sends the EDITED subject/body from the compose screen, rather than
// re-rendering the template — what the person reviewed on screen is exactly
// what goes out. The transition itself re-validates from scratch (the
// booking may have changed since the compose page was loaded), sharing the
// exact same applyStatusTransition() the quick one-click path uses.

import { cookies } from 'next/headers';
import { redirect } from 'next/navigation';
import { revalidatePath } from 'next/cache';
import { serverClient } from '@/lib/supabase';
import { sendMail } from '@/lib/mail';
import type { BookingAction } from '@vs/domain';
import {
  loadBookingForTransition,
  applyStatusTransition,
  markAgreementSent,
  renderAgreementPdfForBooking,
  toMailContext,
} from '@/lib/booking-transition';
import { siteOriginFromHeaders, absoluteUrl } from '@/lib/site-url';

export async function sendComposedMail(formData: FormData): Promise<void> {
  const bookingId = String(formData.get('bookingId') ?? '');
  const action = String(formData.get('action') ?? '') as BookingAction;
  const reason = String(formData.get('reason') ?? '').trim() || null;
  const subject = String(formData.get('subject') ?? '').trim();
  const body = String(formData.get('body') ?? '');
  if (!bookingId || !action || !subject || !body.trim()) {
    throw new Error('Betreff und Text dürfen nicht leer sein.');
  }

  const supabase = serverClient(await cookies());
  const b = await loadBookingForTransition(supabase, bookingId);
  const ctx = toMailContext(b);
  if (!ctx) throw new Error('Für diese Buchung ist keine E-Mail-Adresse hinterlegt.');

  const to = await applyStatusTransition(supabase, bookingId, b, action, reason);

  let attachments;
  if (to === 'agreement_sent') {
    await markAgreementSent(supabase, bookingId, b.needs_id_upload);
    const signingLink = absoluteUrl(await siteOriginFromHeaders(), `/sign/${bookingId}`);
    attachments = await renderAgreementPdfForBooking(supabase, b, signingLink);
  }

  await sendMail({ to: [ctx.customerEmail], subject, text: body, attachments });

  revalidatePath('/admin/bookings');
  revalidatePath(`/admin/bookings/${bookingId}`);
  revalidatePath('/admin');
  redirect(`/admin/bookings/${bookingId}`);
}
