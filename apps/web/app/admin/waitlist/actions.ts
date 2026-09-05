'use server';

// Waitlist administration.
//
// These run through adminClient() (service role), which BYPASSES RLS — so the
// `waitlist_write` policy that would normally scope a write to the caller's own
// locations never gets a chance to run, and this file has to do that scoping
// itself. That is the same reason actionableLocationIds() exists for bookings;
// see its comment in lib/auth.ts. Without the check below, a manager at one
// venue could change or delete another venue's waitlist.

import { revalidatePath } from 'next/cache';
import { adminClient } from '@/lib/supabase';
import {
  getSessionUser,
  canManageWaitlist,
  actionableLocationIds,
  mayActOnLocation,
} from '@/lib/auth';

/**
 * Resolve the entry and refuse it if it belongs to a location this user may
 * not act on. Returns the id only once both checks have passed.
 */
async function authorizeEntry(formData: FormData): Promise<string> {
  const me = await getSessionUser();
  if (!me?.auth || !canManageWaitlist(me.auth)) {
    throw new Error('Forbidden');
  }

  const id = String(formData.get('id') ?? '');
  if (!id) throw new Error('Missing id');

  const admin = adminClient();
  const { data: entry } = await admin
    .from('waitlist_requests')
    .select('id, location_id')
    .eq('id', id)
    .maybeSingle();

  if (!entry) throw new Error('Not found');

  const allowed = await actionableLocationIds(me);
  if (!mayActOnLocation(allowed, (entry as { location_id: string }).location_id)) {
    throw new Error('Forbidden');
  }

  return id;
}

export async function updateWaitlistStatus(formData: FormData): Promise<void> {
  const id = await authorizeEntry(formData);

  const status = String(formData.get('status') ?? 'waiting');
  const updates: Record<string, unknown> = { status };
  if (status === 'notified') {
    updates.notified_at = new Date().toISOString();
  }

  const { error } = await adminClient().from('waitlist_requests').update(updates).eq('id', id);
  if (error) {
    console.error('[waitlist admin] update status failed', error);
    throw new Error(error.message);
  }

  revalidatePath('/admin/waitlist');
}

export async function deleteWaitlistEntry(formData: FormData): Promise<void> {
  const id = await authorizeEntry(formData);

  const { error } = await adminClient().from('waitlist_requests').delete().eq('id', id);
  if (error) {
    console.error('[waitlist admin] delete failed', error);
    throw new Error(error.message);
  }

  revalidatePath('/admin/waitlist');
}
