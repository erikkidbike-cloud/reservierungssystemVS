'use server';

import { revalidatePath } from 'next/cache';
import { adminClient } from '@/lib/supabase';
import { getSessionUser, canWriteExperiences } from '@/lib/auth';
import { text, LIMITS } from '@/lib/input';
import type { ExperienceRating } from '@/lib/db-types';

export async function createCustomerExperience(formData: FormData): Promise<void> {
  const me = await getSessionUser();
  if (!me?.auth || !canWriteExperiences(me.auth)) {
    throw new Error('Forbidden');
  }

  const rating = (String(formData.get('rating') ?? 'neutral')) as ExperienceRating;
  // Capped like the public fields (lib/input.ts). Staff-authored, so abuse is
  // not the worry — but these are matched against incoming bookings and shown
  // in the booking detail, and a runaway paste should not become the row that
  // makes that screen unusable.
  const matchLastName = text(formData.get('match_last_name'));
  const matchFirstName = text(formData.get('match_first_name'));
  const matchEmail = text(formData.get('match_email'), 254)?.toLowerCase() ?? null;
  const matchPhone = text(formData.get('match_phone'), 40);
  const matchOrg = text(formData.get('match_organization'), LIMITS.medium);
  const note = text(formData.get('note'), LIMITS.message);
  const surchargeDiscountRaw = formData.get('surcharge_or_discount');
  const surchargeDiscount = surchargeDiscountRaw ? parseFloat(String(surchargeDiscountRaw)) : null;

  if (!matchLastName && !matchEmail && !matchPhone) {
    throw new Error('Mindestens Nachname, E-Mail oder Telefonnummer erforderlich.');
  }

  // Other names the same group books under. Each chip posts its own field.
  const altNames = formData
    .getAll('alt_names')
    .map((v) => text(v, LIMITS.short))
    .filter((v): v is string => !!v);

  // The booking this was written about, when it was picked rather than typed.
  const bookingId = text(formData.get('booking_id'), 64);

  const admin = adminClient();
  const { error } = await admin.from('customer_experiences').insert({
    rating,
    alt_names: altNames,
    booking_id: bookingId,
    match_last_name: matchLastName,
    match_first_name: matchFirstName,
    match_email: matchEmail,
    match_phone: matchPhone,
    match_organization: matchOrg,
    note,
    surcharge_or_discount: Number.isFinite(surchargeDiscount) ? surchargeDiscount : null,
    created_by: me.id,
  });

  if (error) {
    console.error('[customer experience] insert failed', error);
    throw new Error(error.message);
  }

  revalidatePath('/admin/customers');
  revalidatePath('/admin/bookings');
}

export async function deleteCustomerExperience(formData: FormData): Promise<void> {
  const me = await getSessionUser();
  if (!me?.auth || !canWriteExperiences(me.auth)) {
    throw new Error('Forbidden');
  }

  const id = String(formData.get('id') ?? '');
  if (!id) throw new Error('Missing ID');

  const admin = adminClient();
  const { error } = await admin.from('customer_experiences').delete().eq('id', id);

  if (error) {
    console.error('[customer experience] delete failed', error);
    throw new Error(error.message);
  }

  revalidatePath('/admin/customers');
}
