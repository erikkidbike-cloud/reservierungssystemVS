// Loader for the editable Nutzungsvereinbarung clause text (agreement_clauses).
//
// packages/documents/src/nv-clauses.generated.ts (mechanically extracted from
// the owner's Word templates) is only ever the INITIAL import source, seeded
// once into the database by supabase/seed/nv_clauses.sql. From then on the
// database is authoritative — an admin or location_manager edits it through
// /admin/agreements, no deploy needed — which is what makes the agreement text
// actually editable rather than a fixed constant in the deployed code.

import type { SupabaseClient } from '@supabase/supabase-js';
import type { AgreementClause } from './db-types';
import type { NvClause } from '@vs/documents';

/** All clauses for a location, in document order. Empty array = no agreement yet. */
export async function loadClauses(
  supabase: SupabaseClient,
  locationId: string,
): Promise<AgreementClause[]> {
  const { data, error } = await supabase
    .from('agreement_clauses')
    .select('*')
    .eq('location_id', locationId)
    .order('sort_order', { ascending: true });

  if (error) throw new Error(`Failed to load agreement clauses: ${error.message}`);
  return (data ?? []) as AgreementClause[];
}

/** Shape the loader's rows into what @vs/documents' renderer expects. */
export function toNvClauses(rows: AgreementClause[]): NvClause[] {
  return rows.map((r) => ({
    id: r.clause_key,
    titleDe: r.title_de,
    titleEn: r.title_en,
    bodyDe: r.body_de,
    bodyEn: r.body_en,
  }));
}

/** A slug clause_key for a hand-added clause, unique within its location. */
export function slugifyClauseKey(title: string, existing: Set<string>): string {
  const base =
    title
      .toLowerCase()
      .normalize('NFD')
      .replace(/[̀-ͯ]/g, '') // strip accents
      .replace(/[^a-z0-9]+/g, '_')
      .replace(/^_+|_+$/g, '') || 'klausel';

  if (!existing.has(base)) return base;
  let n = 2;
  while (existing.has(`${base}_${n}`)) n++;
  return `${base}_${n}`;
}
