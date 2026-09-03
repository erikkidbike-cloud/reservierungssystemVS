'use server';

import { revalidatePath } from 'next/cache';
import { adminClient } from '@/lib/supabase';
import { getSessionUser, canSeeContactData } from '@/lib/auth';

export async function updateWaitlistStatus(formData: FormData): Promise<void> {
  const me = await getSessionUser();
  if (!me?.profile || !canSeeContactData(me.profile.role)) {
    throw new Error('Forbidden');
  }

  const id = String(formData.get('id') ?? '');
  const status = String(formData.get('status') ?? 'waiting');
  if (!id) throw new Error('Missing id');

  const updates: Record<string, unknown> = { status };
  if (status === 'notified') {
    updates.notified_at = new Date().toISOString();
  }

  const admin = adminClient();
  const { error } = await admin.from('waitlist_requests').update(updates).eq('id', id);

  if (error) {
    console.error('[waitlist admin] update status failed', error);
    throw new Error(error.message);
  }

  revalidatePath('/admin/waitlist');
}

export async function deleteWaitlistEntry(formData: FormData): Promise<void> {
  const me = await getSessionUser();
  if (!me?.profile || !canSeeContactData(me.profile.role)) {
    throw new Error('Forbidden');
  }

  const id = String(formData.get('id') ?? '');
  if (!id) throw new Error('Missing id');

  const admin = adminClient();
  const { error } = await admin.from('waitlist_requests').delete().eq('id', id);

  if (error) {
    console.error('[waitlist admin] delete failed', error);
    throw new Error(error.message);
  }

  revalidatePath('/admin/waitlist');
}
