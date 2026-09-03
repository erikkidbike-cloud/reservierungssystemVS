// Lists every location and how many Nutzungsvereinbarung clauses it has. A
// location with zero clauses (Wiener Straße today) isn't broken — it simply
// has no agreement text yet. Adding one later, for WI or any future location,
// is "an admin opens it and starts typing (or imports a Word template the same
// way WE/WA were)", not a schema or code change.

import Link from 'next/link';
import { cookies } from 'next/headers';
import { serverClient } from '@/lib/supabase';
import type { Location } from '@/lib/db-types';

export const dynamic = 'force-dynamic';

export default async function AgreementsPage() {
  const supabase = serverClient(await cookies());

  const [{ data: locations, error: locError }, { data: counts, error: countError }] =
    await Promise.all([
      supabase.from('locations').select('*').eq('is_active', true).order('sort_order'),
      supabase.from('agreement_clauses').select('location_id'),
    ]);

  if (locError) {
    return (
      <>
        <h1>Verträge</h1>
        <div className="notice">Standorte konnten nicht geladen werden: {locError.message}</div>
      </>
    );
  }
  if (countError) {
    return (
      <>
        <h1>Verträge</h1>
        <div className="notice">Klauseln konnten nicht geladen werden: {countError.message}</div>
      </>
    );
  }

  const clauseCount = new Map<string, number>();
  for (const row of counts ?? []) {
    clauseCount.set(row.location_id, (clauseCount.get(row.location_id) ?? 0) + 1);
  }

  return (
    <>
      <h1>Verträge</h1>
      <p className="muted">
        Nutzungsvereinbarung je Standort — hier bearbeitbar, ohne dass ein Deploy nötig ist.
      </p>

      <div className="cards">
        {(locations as Location[]).map((l) => {
          const n = clauseCount.get(l.id) ?? 0;
          return (
            <div className="card" key={l.id}>
              <strong>{l.name}</strong>
              <p className="muted">
                {n > 0 ? (
                  <>{n} {n === 1 ? 'Klausel' : 'Klauseln'}</>
                ) : (
                  <span className="badge">noch kein Vertrag</span>
                )}
              </p>
              <p>
                <Link href={`/admin/agreements/${l.code}`}>
                  {n > 0 ? 'Bearbeiten →' : 'Vertrag anlegen →'}
                </Link>
                {n > 0 && (
                  <>
                    {'  ·  '}
                    <a
                      href={`/admin/agreements/${l.code}/preview`}
                      target="_blank"
                      rel="noreferrer"
                    >
                      Vorschau
                    </a>
                  </>
                )}
              </p>
            </div>
          );
        })}
      </div>
    </>
  );
}
