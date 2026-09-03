// Applying a matched payment: one insert into `payments` plus the
// signed→paid transition, used identically whether the match came from a
// staff member typing it in (admin/payments) or from the SevDesk sync route
// (api/cron/sync-payments) — one place decides what "this booking got paid"
// means, so the two paths can't record it differently.

import type { SupabaseClient } from '@supabase/supabase-js';
import { canTransition, transitionFor } from '@vs/domain';

export interface ApplyPaymentInput {
  bookingId: string;
  amount: number;
  purpose: string | null;
  sevdeskId?: string | null;
  matchKind: 'manual' | 'sevdesk';
  /** ISO date (YYYY-MM-DD). Defaults to today. */
  bookedAt?: string;
}

export type ApplyPaymentResult = { ok: true } | { ok: false; error: string };

export async function applyPayment(
  supabase: SupabaseClient,
  input: ApplyPaymentInput,
): Promise<ApplyPaymentResult> {
  const { data: booking, error: loadError } = await supabase
    .from('bookings')
    .select('id, status')
    .eq('id', input.bookingId)
    .maybeSingle();
  if (loadError) return { ok: false, error: loadError.message };
  if (!booking) return { ok: false, error: 'Buchung nicht gefunden.' };
  if (!canTransition(booking.status, 'mark_paid')) {
    return { ok: false, error: `Kann aus Status "${booking.status}" nicht als bezahlt markiert werden.` };
  }

  const { error: payError } = await supabase.from('payments').insert({
    booking_id: input.bookingId,
    sevdesk_id: input.sevdeskId ?? null,
    amount: input.amount,
    purpose: input.purpose,
    booked_at: input.bookedAt ?? new Date().toISOString().slice(0, 10),
    matched: true,
    match_kind: input.matchKind,
  });
  if (payError) return { ok: false, error: payError.message };

  const target = transitionFor(booking.status, 'mark_paid')!;
  const { data: updated, error: updateError } = await supabase
    .from('bookings')
    .update({ status: target.to })
    .eq('id', input.bookingId)
    // Same optimistic-concurrency guard as admin/bookings/actions.ts.
    .eq('status', booking.status)
    .select('id');
  if (updateError) return { ok: false, error: updateError.message };
  if (!updated || updated.length === 0) {
    return { ok: false, error: 'Buchung wurde inzwischen von jemand anderem geändert.' };
  }

  return { ok: true };
}
