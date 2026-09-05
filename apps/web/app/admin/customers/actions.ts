'use server';

import { revalidatePath } from 'next/cache';
import { adminClient } from '@/lib/supabase';
import { getSessionUser, canSeeContactData } from '@/lib/auth';
import type { ExperienceRating } from '@/lib/db-types';

export async function createCustomerExperience(formData: FormData): Promise<void> {
  const me = await getSessionUser();
  if (!me?.profile || !canSeeContactData(me.auth)) {
    throw new Error('Forbidden');
  }

  const rating = (String(formData.get('rating') ?? 'neutral')) as ExperienceRating;
  const matchLastName = String(formData.get('match_last_name') ?? '').trim() || null;
  const matchFirstName = String(formData.get('match_first_name') ?? '').trim() || null;
  const matchEmail = String(formData.get('match_email') ?? '').trim().toLowerCase() || null;
  const matchPhone = String(formData.get('match_phone') ?? '').trim() || null;
  const matchOrg = String(formData.get('match_organization') ?? '').trim() || null;
  const note = String(formData.get('note') ?? '').trim() || null;
  const surchargeDiscountRaw = formData.get('surcharge_or_discount');
  const surchargeDiscount = surchargeDiscountRaw ? parseFloat(String(surchargeDiscountRaw)) : null;

  if (!matchLastName && !matchEmail && !matchPhone) {
    throw new Error('Mindestens Nachname, E-Mail oder Telefonnummer erforderlich.');
  }

  const admin = adminClient();
  const { error } = await admin.from('customer_experiences').insert({
    rating,
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
  if (!me?.profile || !canSeeContactData(me.auth)) {
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
