'use server';

// Role and location assignment. Replaces promoting people by hand in the SQL
// editor, which was the only way to grant access until now.
//
// As everywhere else in the admin, the session-scoped client is used so RLS is
// the real enforcement: `profiles_admin_write` and `user_locations_admin`
// (0005_rls.sql) mean a non-admin's write here simply matches zero rows.

import { cookies } from 'next/headers';
import { revalidatePath } from 'next/cache';
import { serverClient } from '@/lib/supabase';
import { ALL_ROLES } from '@/lib/auth';
import type { AppRole } from '@/lib/db-types';

export async function setUserRole(formData: FormData): Promise<void> {
  const userId = String(formData.get('userId') ?? '');
  const role = String(formData.get('role') ?? '') as AppRole;
  if (!userId || !ALL_ROLES.includes(role)) return;

  const supabase = serverClient(await cookies());
  const { error } = await supabase.from('profiles').update({ role }).eq('id', userId);
  if (error) throw new Error(`Rolle konnte nicht geändert werden: ${error.message}`);
  revalidatePath('/admin/users');
}

export async function setUserActive(formData: FormData): Promise<void> {
  const userId = String(formData.get('userId') ?? '');
  const isActive = String(formData.get('isActive') ?? '') === 'true';
  if (!userId) return;

  const supabase = serverClient(await cookies());
  const { error } = await supabase
    .from('profiles')
    .update({ is_active: isActive })
    .eq('id', userId);
  if (error) throw new Error(`Konto konnte nicht geändert werden: ${error.message}`);
  revalidatePath('/admin/users');
}

/**
 * Replace a user's location assignments in one go. Only meaningful for the
 * scoped roles (location_manager, staff, hausmeister) — admin and finance see
 * every location regardless, by has_location()'s own definition.
 */
export async function setUserLocations(formData: FormData): Promise<void> {
  const userId = String(formData.get('userId') ?? '');
  if (!userId) return;
  const locationIds = formData.getAll('locationIds').map(String).filter(Boolean);

  const supabase = serverClient(await cookies());

  const { error: delError } = await supabase
    .from('user_locations')
    .delete()
    .eq('user_id', userId);
  if (delError) throw new Error(`Standorte konnten nicht gesetzt werden: ${delError.message}`);

  if (locationIds.length > 0) {
    const { error: insError } = await supabase
      .from('user_locations')
      .insert(locationIds.map((location_id) => ({ user_id: userId, location_id })));
    if (insError) throw new Error(`Standorte konnten nicht gesetzt werden: ${insError.message}`);
  }

  revalidatePath('/admin/users');
}
