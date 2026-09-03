// Shared core of a booking lifecycle transition — used by the plain one-click
// buttons (app/admin/bookings/actions.ts) AND the compose-before-send screen
// (app/admin/bookings/[id]/send/[action]), so the two paths can never disagree
// about what a transition IS, only about whether the outgoing mail's wording
// was auto-generated or hand-edited first.
//
// The legality of a transition is decided by packages/domain's state machine —
// the single definition of what may follow what — and NOT duplicated in SQL
// (see 0007_functions.sql's note). RLS remains the access control: admin
// everywhere, location_manager only for their own locations. A caller RLS
// disallows updates zero rows, and that is detected rather than reporting a
// success that didn't happen.

import type { SupabaseClient } from '@supabase/supabase-js';
import { canTransition, transitionFor, type BookingAction, type BookingStatus } from '@vs/domain';
import type { BookingMailContext } from './mail-vars';
import type { MailAttachment } from './mail';
import { bookingToNvData } from './nv-data';
import { loadClauses, toNvClauses } from './agreements';
import { renderAgreementPdfSafely } from './pdf';

/** Booking + the joined bits the mail templates (and, for agreement_sent, the PDF) need. */
export interface BookingForTransition {
  id: string;
  location_id: string;
  status: BookingStatus;
  starts_at: string;
  ends_at: string;
  persons: number | null;
  event_type: string | null;
  price_total: number | null;
  caution: number | null;
  verwendungszweck: string | null;
  lang: string;
  needs_id_upload: boolean;
  locations: { name: string; code: string; address: string | null; phone: string | null } | null;
  customers: {
    salutation: string | null;
    first_name: string | null;
    last_name: string | null;
    organization: string | null;
    address_full: string | null;
    email: string | null;
    phone: string | null;
  } | null;
}

export const BOOKING_SELECT_FOR_TRANSITION =
  'id, location_id, status, starts_at, ends_at, persons, event_type, price_total, caution, ' +
  'verwendungszweck, lang, needs_id_upload, locations(name, code, address, phone), ' +
  'customers(salutation, first_name, last_name, organization, address_full, email, phone)';

export async function loadBookingForTransition(
  supabase: SupabaseClient,
  bookingId: string,
): Promise<BookingForTransition> {
  const { data: booking, error } = await supabase
    .from('bookings')
    .select(BOOKING_SELECT_FOR_TRANSITION)
    .eq('id', bookingId)
    .maybeSingle();

  if (error) throw new Error(`Buchung konnte nicht geladen werden: ${error.message}`);
  if (!booking) throw new Error('Buchung nicht gefunden oder kein Zugriff darauf.');
  return booking as unknown as BookingForTransition;
}

export function toMailContext(b: BookingForTransition): BookingMailContext | null {
  const email = b.customers?.email;
  if (!email) return null;
  const name = [b.customers?.first_name, b.customers?.last_name].filter(Boolean).join(' ') || email;

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

/**
 * documents has no unique constraint on (booking_id, type) — an agreement can
 * legitimately be re-sent (a correction, a customer who lost the email), and
 * each send should still leave exactly one row per booking, not accumulate
 * duplicates. Manual check-then-write rather than .upsert(), same shape as
 * lib/agreements.ts's clause helpers.
 */
export async function markAgreementSent(
  supabase: SupabaseClient,
  bookingId: string,
  needsIdUpload: boolean,
): Promise<void> {
  const { data: existing } = await supabase
    .from('documents')
    .select('id')
    .eq('booking_id', bookingId)
    .eq('type', 'nutzungsvereinbarung')
    .maybeSingle();

  if (existing) {
    const { error } = await supabase
      .from('documents')
      .update({ status: 'sent', id_document_required: needsIdUpload })
      .eq('id', existing.id);
    if (error) throw new Error(`Dokument konnte nicht aktualisiert werden: ${error.message}`);
  } else {
    const { error } = await supabase.from('documents').insert({
      booking_id: bookingId,
      type: 'nutzungsvereinbarung',
      status: 'sent',
      id_document_required: needsIdUpload,
    });
    if (error) throw new Error(`Dokument konnte nicht angelegt werden: ${error.message}`);
  }
}

/**
 * The signed-agreement PDF for one booking, ready to attach to the
 * agreement_sent email. Best-effort (see lib/pdf.ts) — an empty array means
 * "send the email anyway, just without the attachment", not an error.
 * Returns nothing if the location has no agreement text yet (a location
 * newly onboarded with no clauses configured — see /admin/agreements).
 */
export async function renderAgreementPdfForBooking(
  supabase: SupabaseClient,
  b: BookingForTransition,
  signingLink: string,
): Promise<MailAttachment[]> {
  if (!b.locations) return [];
  const clauseRows = await loadClauses(supabase, b.location_id);
  if (clauseRows.length === 0) return [];

  const nvData = bookingToNvData(b, b.locations, b.customers, signingLink);
  return renderAgreementPdfSafely(nvData, toNvClauses(clauseRows));
}

/**
 * Writes the new status (with the standard side-effects: freeing the slot on
 * a terminal negative outcome, recording a reason). Does NOT send mail or
 * touch `documents` — callers decide that, since the compose screen wants to
 * send mail with edited text instead of the template's own.
 */
export async function applyStatusTransition(
  supabase: SupabaseClient,
  bookingId: string,
  b: BookingForTransition,
  action: BookingAction,
  reason?: string | null,
): Promise<BookingStatus> {
  if (!canTransition(b.status, action)) {
    throw new Error(`"${action}" ist aus dem Status "${b.status}" nicht möglich.`);
  }
  const target = transitionFor(b.status, action)!;

  const patch: Record<string, unknown> = { status: target.to };
  if (['rejected', 'cancelled', 'postponed', 'expired'].includes(target.to)) {
    patch.hold_expires_at = null;
  }
  if (reason) patch.internal_notes = reason;

  const { data: updated, error } = await supabase
    .from('bookings')
    .update(patch)
    .eq('id', bookingId)
    // Guards against two people acting on the same booking at once: if the
    // status moved since it was loaded, this matches nothing.
    .eq('status', b.status)
    .select('id');

  if (error) throw new Error(`Statuswechsel fehlgeschlagen: ${error.message}`);
  if (!updated || updated.length === 0) {
    throw new Error(
      'Statuswechsel nicht möglich — entweder fehlt die Berechtigung, oder die ' +
        'Buchung wurde inzwischen von jemand anderem geändert. Seite neu laden.',
    );
  }

  return target.to;
}
