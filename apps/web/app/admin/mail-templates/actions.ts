'use server';

// Editing a mail template. `mail_templates_write` RLS (0013_mail_templates.sql)
// is admin-only, matching canManageMailTemplates() in the page.

import { cookies } from 'next/headers';
import { revalidatePath } from 'next/cache';
import { serverClient } from '@/lib/supabase';

export async function saveMailTemplate(formData: FormData): Promise<void> {
  const key = String(formData.get('key') ?? '');
  if (!key) return;

  const supabase = serverClient(await cookies());
  const {
    data: { user },
  } = await supabase.auth.getUser();

  const { error } = await supabase
    .from('mail_templates')
    .update({
      subject_de: String(formData.get('subject_de') ?? ''),
      subject_en: String(formData.get('subject_en') ?? ''),
      body_de: String(formData.get('body_de') ?? ''),
      body_en: String(formData.get('body_en') ?? ''),
      updated_by: user?.id ?? null,
    })
    .eq('key', key);

  if (error) throw new Error(`Vorlage konnte nicht gespeichert werden: ${error.message}`);
  revalidatePath('/admin/mail-templates');
}
