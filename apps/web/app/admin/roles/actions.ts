'use server';

// Creating and re-permissioning roles.
//
// Every write here goes through the session-scoped client, so `roles_write`
// and `role_permissions_write` (0016) are the real enforcement: without
// roles.manage the statements match zero rows or are refused outright. The
// canManageRoles() check on the page is only there to show a readable message
// instead of a screen that silently does nothing.
//
// The guard rails are triggers, not checks in this file, and that is
// deliberate: this is the one screen that can take away its own permission, so
// the protection has to live somewhere it cannot reach. See protect_admin_role
// and protect_system_roles in 0016.

import { cookies } from 'next/headers';
import { revalidatePath } from 'next/cache';
import { serverClient } from '@/lib/supabase';

/** Turn a Postgres error into something a person can act on. */
function friendly(message: string, fallback: string): string {
  if (message.includes('admin_role_protected')) {
    return 'Der Administratorrolle können „Vollzugriff“ und „Rollen verwalten“ nicht entzogen werden — sonst käme niemand mehr an diese Seite.';
  }
  if (message.includes('system_role_protected')) {
    return 'Diese Rolle gehört fest zum System. Bezeichnung und Berechtigungen lassen sich ändern, der Schlüssel und das Löschen nicht.';
  }
  if (message.includes('roles_key_check')) {
    return 'Der Schlüssel darf nur Kleinbuchstaben, Ziffern und Unterstriche enthalten und muss mit einem Buchstaben beginnen.';
  }
  if (message.includes('duplicate key') || message.includes('roles_pkey')) {
    return 'Diesen Schlüssel gibt es schon.';
  }
  if (message.includes('violates foreign key')) {
    return 'Diese Rolle ist noch Personen zugewiesen. Bitte diese zuerst umtragen.';
  }
  return `${fallback}: ${message}`;
}

export async function createRole(formData: FormData): Promise<void> {
  const key = String(formData.get('key') ?? '').trim().toLowerCase();
  const labelDe = String(formData.get('label_de') ?? '').trim();
  if (!key || !labelDe) return;

  const supabase = serverClient(await cookies());
  const { error } = await supabase.from('roles').insert({
    key,
    label_de: labelDe,
    description: String(formData.get('description') ?? '').trim() || null,
    all_locations: formData.get('all_locations') === 'on',
  });

  if (error) throw new Error(friendly(error.message, 'Rolle konnte nicht angelegt werden'));
  revalidatePath('/admin/roles');
  revalidatePath('/admin/users');
}

export async function saveRole(formData: FormData): Promise<void> {
  const key = String(formData.get('key') ?? '');
  if (!key) return;

  const supabase = serverClient(await cookies());

  const { error } = await supabase
    .from('roles')
    .update({
      label_de: String(formData.get('label_de') ?? '').trim(),
      description: String(formData.get('description') ?? '').trim() || null,
      all_locations: formData.get('all_locations') === 'on',
    })
    .eq('key', key);

  if (error) throw new Error(friendly(error.message, 'Rolle konnte nicht gespeichert werden'));

  // The permission set arrives as the full list of ticked boxes, so it is
  // replaced wholesale rather than diffed: a box that is no longer ticked is
  // simply absent, and computing the difference here would just be a second
  // place for the two to disagree.
  const wanted = new Set(formData.getAll('permissions').map(String).filter(Boolean));

  const { data: current } = await supabase
    .from('role_permissions')
    .select('permission_key')
    .eq('role_key', key);

  const have = new Set((current ?? []).map((r) => (r as { permission_key: string }).permission_key));

  const toAdd = [...wanted].filter((p) => !have.has(p));
  const toRemove = [...have].filter((p) => !wanted.has(p));

  if (toAdd.length > 0) {
    const { error: addErr } = await supabase
      .from('role_permissions')
      .insert(toAdd.map((permission_key) => ({ role_key: key, permission_key })));
    if (addErr) throw new Error(friendly(addErr.message, 'Berechtigung konnte nicht gesetzt werden'));
  }

  if (toRemove.length > 0) {
    const { error: rmErr } = await supabase
      .from('role_permissions')
      .delete()
      .eq('role_key', key)
      .in('permission_key', toRemove);
    if (rmErr) throw new Error(friendly(rmErr.message, 'Berechtigung konnte nicht entfernt werden'));
  }

  revalidatePath('/admin/roles');
  revalidatePath('/admin/users');
}

export async function deleteRole(formData: FormData): Promise<void> {
  const key = String(formData.get('key') ?? '');
  if (!key) return;

  const supabase = serverClient(await cookies());
  const { error } = await supabase.from('roles').delete().eq('key', key);
  if (error) throw new Error(friendly(error.message, 'Rolle konnte nicht gelöscht werden'));

  revalidatePath('/admin/roles');
  revalidatePath('/admin/users');
}
