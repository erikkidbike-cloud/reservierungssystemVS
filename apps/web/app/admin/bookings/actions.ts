'use server';

// Booking lifecycle transitions.
//
// The legality of a transition is decided by packages/domain's state machine —
// the single definition of what may follow what — and NOT duplicated in SQL
// (see 0007_functions.sql's note). So this action must check it before writing:
// the database will happily accept any status you give it, and the audit
// trigger will faithfully record a nonsensical jump.
//
// RLS remains the access control: admin everywhere, location_manager only for
// their own locations. A caller RLS disallows updates zero rows, and we detect
// that rather than reporting a success that didn't happen.

import { cookies } from 'next/headers';
import { revalidatePath } from 'next/cache';
import { serverClient } from '@/lib/supabase';
import { canTransition, transitionFor, type BookingAction, type BookingStatus } from '@vs/domain';
import { sendMail } from '@/lib/mail';
import {
  approvedToCustomer,
  rejectedToCustomer,
  cancelledToCustomer,
  type BookingMailContext,
} from '@/lib/mail-templates';

/** Booking + the joined bits the mail templates need. */
interface BookingForTransition {
  id: string;
  status: BookingStatus;
  starts_at: string;
  ends_at: string;
  persons: number | null;
  event_type: string | null;
  price_total: number | null;
  caution: number | null;
  lang: string;
  locations: { name: string; code: string } | null;
  customers: {
    first_name: string | null;
    last_name: string | null;
    email: string | null;
    phone: string | null;
  } | null;
}

function toMailContext(b: BookingForTransition): BookingMailContext | null {
  const email = b.customers?.email;
  if (!email) return null;
  const name =
    [b.customers?.first_name, b.customers?.last_name].filter(Boolean).join(' ') || email;

  return {
    locationName: b.locations?.name ?? '',
    locationCode: b.locations?.code ?? '',
    startsAt: b.starts_at,
    endsAt: b.ends_at,
    persons: b.persons,
    eventType: b.event_type,
    priceTotal: b.price_total,
    caution: b.caution,
    customerName: name,
    customerEmail: email,
    customerPhone: b.customers?.phone,
    lang: b.lang === 'en' ? 'en' : 'de',
  };
}

export async function transitionBooking(formData: FormData): Promise<void> {
  const bookingId = String(formData.get('bookingId') ?? '');
  const action = String(formData.get('action') ?? '') as BookingAction;
  const reason = String(formData.get('reason') ?? '').trim() || null;
  if (!bookingId || !action) return;

  const supabase = serverClient(await cookies());

  const { data: booking, error: loadError } = await supabase
    .from('bookings')
    .select(
      'id, status, starts_at, ends_at, persons, event_type, price_total, caution, lang, ' +
        'locations(name, code), customers(first_name, last_name, email, phone)',
    )
    .eq('id', bookingId)
    .maybeSingle();

  if (loadError) throw new Error(`Buchung konnte nicht geladen werden: ${loadError.message}`);
  if (!booking) throw new Error('Buchung nicht gefunden oder kein Zugriff darauf.');

  const b = booking as unknown as BookingForTransition;

  // The guard the database deliberately does not provide.
  if (!canTransition(b.status, action)) {
    throw new Error(
      `"${action}" ist aus dem Status "${b.status}" nicht möglich.`,
    );
  }
  const target = transitionFor(b.status, action)!;

  const patch: Record<string, unknown> = { status: target.to };
  // A booking that is no longer going ahead should stop holding its slot.
  if (['rejected', 'cancelled', 'postponed', 'expired'].includes(target.to)) {
    patch.hold_expires_at = null;
  }
  if (reason) {
    patch.internal_notes = reason;
  }

  const { data: updated, error: updateError } = await supabase
    .from('bookings')
    .update(patch)
    .eq('id', bookingId)
    // Guards against two people acting on the same booking at once: if the
    // status moved since we loaded it, this matches nothing.
    .eq('status', b.status)
    .select('id');

  if (updateError) throw new Error(`Statuswechsel fehlgeschlagen: ${updateError.message}`);
  if (!updated || updated.length === 0) {
    throw new Error(
      'Statuswechsel nicht möglich — entweder fehlt die Berechtigung, oder die ' +
        'Buchung wurde inzwischen von jemand anderem geändert. Seite neu laden.',
    );
  }

  // The status-change audit row is written by the database trigger
  // (log_booking_status_change), so it records the change even if what follows
  // fails. Notification is best-effort and must never undo the transition.
  const ctx = toMailContext(b);
  if (ctx) {
    if (target.to === 'approved') await sendMail(approvedToCustomer(ctx));
    else if (target.to === 'rejected') await sendMail(rejectedToCustomer(ctx, reason));
    else if (target.to === 'cancelled') await sendMail(cancelledToCustomer(ctx, reason));
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
