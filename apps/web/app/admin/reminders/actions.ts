'use server';

// Reminder rules. `reminder_rules_write` RLS (0015) is admin-only, matching
// canManageMailTemplates() in the page — a reminder is wording plus a
// schedule, and both are brand/legal concerns shared across every location.

import { cookies } from 'next/headers';
import { revalidatePath } from 'next/cache';
import { serverClient } from '@/lib/supabase';

function str(formData: FormData, key: string): string | null {
  const v = String(formData.get(key) ?? '').trim();
  return v || null;
}

export async function saveReminderRule(formData: FormData): Promise<void> {
  const id = String(formData.get('id') ?? '');
  const supabase = serverClient(await cookies());

  const statuses = formData.getAll('statuses').map(String).filter(Boolean);
  if (statuses.length === 0) {
    throw new Error('Mindestens ein Status muss ausgewählt sein.');
  }

  const patch = {
    name: str(formData, 'name'),
    template_key: str(formData, 'template_key'),
    offset_days: Number(formData.get('offset_days') ?? 0) || 0,
    offset_hours: Number(formData.get('offset_hours') ?? 0) || 0,
    anchor: str(formData, 'anchor') ?? 'event_start',
    statuses,
    location_id: str(formData, 'location_id'),
    recipient: str(formData, 'recipient') ?? 'customer',
    is_active: formData.get('is_active') !== null,
  };
  if (!patch.name || !patch.template_key) {
    throw new Error('Name und Vorlage sind erforderlich.');
  }

  const { error } = id
    ? await supabase.from('reminder_rules').update(patch).eq('id', id)
    : await supabase.from('reminder_rules').insert(patch);

  if (error) throw new Error(`Regel konnte nicht gespeichert werden: ${error.message}`);
  revalidatePath('/admin/reminders');
}

export async function deleteReminderRule(formData: FormData): Promise<void> {
  const id = String(formData.get('id') ?? '');
  if (!id) return;
  const supabase = serverClient(await cookies());
  const { error } = await supabase.from('reminder_rules').delete().eq('id', id);
  if (error) throw new Error(`Regel konnte nicht gelöscht werden: ${error.message}`);
  revalidatePath('/admin/reminders');
}
