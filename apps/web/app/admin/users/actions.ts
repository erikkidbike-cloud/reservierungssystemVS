'use server';

// Role and location assignment. Replaces promoting people by hand in the SQL
// editor, which was the only way to grant access until now.
//
// As everywhere else in the admin, the session-scoped client is used so RLS is
// the real enforcement: `profiles_admin_write` and `user_locations_admin`
// (0016_roles_permissions.sql) mean a write by someone without users.manage
// simply matches zero rows.

import { cookies } from 'next/headers';
import { revalidatePath } from 'next/cache';
import { serverClient } from '@/lib/supabase';

export async function setUserRole(formData: FormData): Promise<void> {
  const userId = String(formData.get('userId') ?? '');
  const role = String(formData.get('role') ?? '');
  if (!userId || !role) return;

  const supabase = serverClient(await cookies());

  // No client-side list to validate against any more — roles are rows, and the
  // set of them changes while this page is open. The foreign key on
  // profiles.role is what rejects a value that is not a real role, so an
  // invented one fails at the database rather than passing a stale check here.
  const { error } = await supabase.from('profiles').update({ role }).eq('id', userId);
  if (error) {
    // The trigger from 0016 raises this when the last administrator would lose
    // their access; it is the one error here worth translating.
    if (error.message.includes('last_admin_protected')) {
      throw new Error(
        'Das ist die letzte aktive Administratorin bzw. der letzte aktive Administrator — ' +
          'bitte zuerst jemand anderem die Administratorrolle geben.',
      );
    }
    throw new Error(`Rolle konnte nicht geändert werden: ${error.message}`);
  }
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
  if (error) {
    if (error.message.includes('last_admin_protected')) {
      throw new Error(
        'Das Konto kann nicht deaktiviert werden: es ist die letzte aktive Administration.',
      );
    }
    throw new Error(`Konto konnte nicht geändert werden: ${error.message}`);
  }
  revalidatePath('/admin/users');
}

/**
 * Replace a user's location assignments in one go. Only meaningful for roles
 * whose `all_locations` flag is false — a role that covers everything reaches
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
