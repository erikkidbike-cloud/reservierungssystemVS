'use server';

// Server actions for editing the Nutzungsvereinbarung text. Every write goes
// through the session-scoped Supabase client (serverClient), so the
// agreement_clauses RLS policy — admin everywhere, location_manager only for
// their own location(s) — is the actual enforcement. These actions do not
// themselves check the caller's role; a request from someone RLS disallows
// simply updates zero rows (see the "staff write is silently rejected"
// behaviour proven in supabase/test/02_agreements.test.sql).

import { cookies } from 'next/headers';
import { revalidatePath } from 'next/cache';
import { serverClient } from '@/lib/supabase';
import { loadClauses, slugifyClauseKey } from '@/lib/agreements';
import { NV_CLAUSE_SETS } from '@vs/documents';

export async function saveClause(formData: FormData): Promise<void> {
  const id = String(formData.get('clauseId') ?? '');
  const locationCode = String(formData.get('locationCode') ?? '');
  if (!id) throw new Error('Missing clauseId');

  const supabase = serverClient(await cookies());
  const { error } = await supabase
    .from('agreement_clauses')
    .update({
      title_de: String(formData.get('titleDe') ?? ''),
      title_en: String(formData.get('titleEn') ?? ''),
      body_de: String(formData.get('bodyDe') ?? ''),
      body_en: String(formData.get('bodyEn') ?? ''),
    })
    .eq('id', id);

  if (error) throw new Error(`Speichern fehlgeschlagen: ${error.message}`);
  revalidatePath(`/admin/agreements/${locationCode}`);
}

export async function addClause(formData: FormData): Promise<void> {
  const locationId = String(formData.get('locationId') ?? '');
  const locationCode = String(formData.get('locationCode') ?? '');
  const title = String(formData.get('newTitleDe') ?? '').trim();
  if (!locationId || !title) return;

  const supabase = serverClient(await cookies());
  const existing = await loadClauses(supabase, locationId);
  const key = slugifyClauseKey(title, new Set(existing.map((c) => c.clause_key)));
  const nextSort = existing.reduce((max, c) => Math.max(max, c.sort_order), 0) + 1;

  const { error } = await supabase.from('agreement_clauses').insert({
    location_id: locationId,
    clause_key: key,
    sort_order: nextSort,
    title_de: title,
    title_en: String(formData.get('newTitleEn') ?? ''),
    body_de: '',
    body_en: '',
  });

  if (error) throw new Error(`Klausel konnte nicht angelegt werden: ${error.message}`);
  revalidatePath(`/admin/agreements/${locationCode}`);
}

export async function deleteClause(formData: FormData): Promise<void> {
  const id = String(formData.get('clauseId') ?? '');
  const locationCode = String(formData.get('locationCode') ?? '');
  if (!id) return;

  const supabase = serverClient(await cookies());
  const { error } = await supabase.from('agreement_clauses').delete().eq('id', id);
  if (error) throw new Error(`Löschen fehlgeschlagen: ${error.message}`);
  revalidatePath(`/admin/agreements/${locationCode}`);
}

/**
 * One-time convenience for a location that already has a Word-imported clause
 * set (WE, WA) but has since had its database rows cleared, or a fresh location
 * whose contract is being started from that same known-good text. Never
 * overwrites an existing clause_key (ON CONFLICT DO NOTHING, mirroring
 * supabase/seed/nv_clauses.sql) — importing twice is always safe.
 */
export async function importDefaults(formData: FormData): Promise<void> {
  const locationId = String(formData.get('locationId') ?? '');
  const locationCode = String(formData.get('locationCode') ?? '');
  const defaults = NV_CLAUSE_SETS[locationCode];
  if (!locationId || !defaults) return;

  const supabase = serverClient(await cookies());
  const existing = await loadClauses(supabase, locationId);
  const existingKeys = new Set(existing.map((c) => c.clause_key));
  let nextSort = existing.reduce((max, c) => Math.max(max, c.sort_order), 0);

  const toInsert = defaults
    .filter((c) => !existingKeys.has(c.id))
    .map((c) => ({
      location_id: locationId,
      clause_key: c.id,
      sort_order: ++nextSort,
      title_de: c.titleDe,
      title_en: c.titleEn,
      body_de: c.bodyDe,
      body_en: c.bodyEn,
    }));

  if (toInsert.length === 0) return;

  const { error } = await supabase.from('agreement_clauses').insert(toInsert);
  if (error) throw new Error(`Import fehlgeschlagen: ${error.message}`);
  revalidatePath(`/admin/agreements/${locationCode}`);
}
