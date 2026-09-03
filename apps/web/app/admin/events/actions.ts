'use server';

// Categories (projects) and special events (public blocks). Both run through
// the session-scoped client, so RLS is the real gate: `projects_write` is
// admin-only, `blocks_write` is admin everywhere / location_manager their own
// location — canManageCategories()/canManageEvents() in the page just decide
// what to render, matching every other admin screen in this app.

import { cookies } from 'next/headers';
import { revalidatePath } from 'next/cache';
import { serverClient } from '@/lib/supabase';
import { parseBerlinLocal } from '@/lib/booking-pricing';

function str(formData: FormData, key: string): string | null {
  const v = String(formData.get(key) ?? '').trim();
  return v || null;
}

export async function saveCategory(formData: FormData): Promise<void> {
  const id = String(formData.get('id') ?? '');
  const supabase = serverClient(await cookies());

  const patch = {
    code: str(formData, 'code'),
    name: str(formData, 'name'),
    color: str(formData, 'color'),
    public_title: str(formData, 'public_title'),
    public_description: str(formData, 'public_description'),
    public_link: str(formData, 'public_link'),
  };
  if (!patch.code || !patch.name) throw new Error('Code und Name sind erforderlich.');

  const { error } = id
    ? await supabase.from('projects').update(patch).eq('id', id)
    : await supabase.from('projects').insert(patch);

  if (error) throw new Error(`Kategorie konnte nicht gespeichert werden: ${error.message}`);
  revalidatePath('/admin/events');
}

export async function deleteCategory(formData: FormData): Promise<void> {
  const id = String(formData.get('id') ?? '');
  if (!id) return;
  const supabase = serverClient(await cookies());
  // Blocks referencing this category have project_id set to null on delete
  // (see 0003_core_tables.sql's `on delete set null`) — they keep existing,
  // just without a category, rather than silently disappearing.
  const { error } = await supabase.from('projects').delete().eq('id', id);
  if (error) throw new Error(`Kategorie konnte nicht gelöscht werden: ${error.message}`);
  revalidatePath('/admin/events');
}

export async function saveEvent(formData: FormData): Promise<void> {
  const id = String(formData.get('id') ?? '');
  const supabase = serverClient(await cookies());

  // Naive "YYYY-MM-DDTHH:mm" from a <input type=datetime-local>, interpreted as
  // Berlin wall-clock — same technique as lib/booking-pricing.ts's
  // parseBerlinLocal (the server runs with TZ=Europe/Berlin), so an event
  // entered here lines up with the booking calendar's own times exactly.
  const starts = parseBerlinLocal(String(formData.get('starts_at') ?? ''));
  const ends = parseBerlinLocal(String(formData.get('ends_at') ?? ''));
  if (!starts || !ends) throw new Error('Von/Bis sind erforderlich.');
  if (ends <= starts) throw new Error('Ende muss nach dem Beginn liegen.');

  const patch = {
    location_id: String(formData.get('location_id') ?? ''),
    project_id: str(formData, 'project_id'),
    starts_at: starts.toISOString(),
    ends_at: ends.toISOString(),
    title: str(formData, 'title'),
    kind: (str(formData, 'kind') ?? 'other') as
      | 'project'
      | 'maintenance'
      | 'training'
      | 'other',
    is_public: formData.get('is_public') !== null,
    public_title: str(formData, 'public_title'),
    public_link: str(formData, 'public_link'),
    color: str(formData, 'color'),
    public_description: str(formData, 'public_description'),
  };
  if (!patch.location_id) throw new Error('Standort ist erforderlich.');

  const { error } = id
    ? await supabase.from('blocks').update(patch).eq('id', id)
    : await supabase.from('blocks').insert(patch);

  if (error) throw new Error(`Termin konnte nicht gespeichert werden: ${error.message}`);
  revalidatePath('/admin/events');
}

export async function deleteEvent(formData: FormData): Promise<void> {
  const id = String(formData.get('id') ?? '');
  if (!id) return;
  const supabase = serverClient(await cookies());
  const { error } = await supabase.from('blocks').delete().eq('id', id);
  if (error) throw new Error(`Termin konnte nicht gelöscht werden: ${error.message}`);
  revalidatePath('/admin/events');
}
