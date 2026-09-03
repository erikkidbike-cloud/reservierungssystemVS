'use server';

// Manual payment entry — works today with no SevDesk token at all. Runs
// through the session-scoped client, so `payments_access` RLS (admin/finance
// only, 0005_rls.sql) is the real enforcement; canManagePayments() in the page
// just decides whether to show the form.

import { cookies } from 'next/headers';
import { revalidatePath } from 'next/cache';
import { serverClient } from '@/lib/supabase';
import { applyPayment } from '@/lib/payments';

export async function recordPayment(formData: FormData): Promise<void> {
  const bookingId = String(formData.get('bookingId') ?? '');
  const amount = Number(formData.get('amount') ?? 0);
  if (!bookingId) return;
  if (!Number.isFinite(amount) || amount <= 0) {
    throw new Error('Bitte einen Betrag größer als 0 angeben.');
  }
  const purpose = String(formData.get('purpose') ?? '').trim() || null;

  const supabase = serverClient(await cookies());
  const result = await applyPayment(supabase, {
    bookingId,
    amount,
    purpose,
    matchKind: 'manual',
  });
  if (!result.ok) throw new Error(`Zahlung konnte nicht erfasst werden: ${result.error}`);

  revalidatePath('/admin/payments');
  revalidatePath(`/admin/bookings/${bookingId}`);
  revalidatePath('/admin/bookings');
}
