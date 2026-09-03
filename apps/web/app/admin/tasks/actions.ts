'use server';

// Task actions. Both go through the session-scoped client (serverClient), so
// RLS is the real enforcement: a caretaker can only mark their OWN tasks done
// (tasks_assignee_update, 0005_rls.sql — assignee_id = auth.uid()), and only
// admin/location_manager may reassign one at all (tasks_manage). A request
// RLS disallows simply updates zero rows.

import { cookies } from 'next/headers';
import { revalidatePath } from 'next/cache';
import { serverClient } from '@/lib/supabase';

export async function markTaskDone(formData: FormData): Promise<void> {
  const taskId = String(formData.get('taskId') ?? '');
  if (!taskId) return;

  const supabase = serverClient(await cookies());
  const { error, data } = await supabase
    .from('tasks')
    .update({ status: 'done', done_at: new Date().toISOString() })
    .eq('id', taskId)
    .select('id');

  if (error) throw new Error(`Aufgabe konnte nicht abgeschlossen werden: ${error.message}`);
  if (!data || data.length === 0) {
    throw new Error('Keine Berechtigung für diese Aufgabe, oder sie wurde bereits geändert.');
  }
  revalidatePath('/admin/tasks');
}

export async function reopenTask(formData: FormData): Promise<void> {
  const taskId = String(formData.get('taskId') ?? '');
  if (!taskId) return;

  const supabase = serverClient(await cookies());
  const { error } = await supabase
    .from('tasks')
    .update({ status: 'open', done_at: null })
    .eq('id', taskId);

  if (error) throw new Error(`Aufgabe konnte nicht wiedereröffnet werden: ${error.message}`);
  revalidatePath('/admin/tasks');
}

/** Admin/location_manager only, per tasks_manage RLS — assigns or unassigns a caretaker. */
export async function reassignTask(formData: FormData): Promise<void> {
  const taskId = String(formData.get('taskId') ?? '');
  if (!taskId) return;
  const assigneeId = String(formData.get('assigneeId') ?? '').trim() || null;

  const supabase = serverClient(await cookies());
  const { error } = await supabase.from('tasks').update({ assignee_id: assigneeId }).eq('id', taskId);

  if (error) throw new Error(`Zuweisung fehlgeschlagen: ${error.message}`);
  revalidatePath('/admin/tasks');
}
