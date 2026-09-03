// Edit one location's Nutzungsvereinbarung clauses. Plain HTML forms bound to
// server actions — no client-side state, so an edit that RLS rejects (a
// location_manager for a different location, say) just silently doesn't apply
// rather than needing to be caught in the browser.

import { cookies } from 'next/headers';
import { notFound } from 'next/navigation';
import { serverClient } from '@/lib/supabase';
import { loadClauses } from '@/lib/agreements';
import { hasClausesForLocation } from '@vs/documents';
import { saveClause, addClause, deleteClause, importDefaults } from '../actions';
import type { Location } from '@/lib/db-types';

export const dynamic = 'force-dynamic';

export default async function EditAgreementPage({
  params,
}: {
  params: Promise<{ code: string }>;
}) {
  const { code } = await params;
  const locationCode = code.toUpperCase();
  const supabase = serverClient(await cookies());

  const { data: location, error: locError } = await supabase
    .from('locations')
    .select('*')
    .eq('code', locationCode)
    .maybeSingle();

  if (locError) {
    return <div className="notice">Standort konnte nicht geladen werden: {locError.message}</div>;
  }
  if (!location) notFound();

  const loc = location as Location;
  const clauses = await loadClauses(supabase, loc.id);
  const hasImportableDefaults = hasClausesForLocation(locationCode);

  return (
    <>
      <h1>Vertrag — {loc.name}</h1>
      <p className="muted">
        Änderungen gelten sofort für neu generierte Verträge. Bereits verschickte
        PDFs werden nicht rückwirkend geändert.
      </p>

      {clauses.length > 0 && (
        <p>
          <a href={`/admin/agreements/${loc.code}/preview`} target="_blank" rel="noreferrer">
            Vorschau öffnen (Deutsch) →
          </a>
          {'  ·  '}
          <a
            href={`/admin/agreements/${loc.code}/preview?lang=en`}
            target="_blank"
            rel="noreferrer"
          >
            English →
          </a>
          <br />
          <span className="muted small">
            Zeigt den Vertrag mit Beispieldaten. Zum Speichern als PDF im
            Vorschau-Tab einfach drucken (Strg/Cmd+P → „Als PDF sichern") — das
            Seitenlayout ist bereits auf A4 eingerichtet.
          </span>
        </p>
      )}

      {clauses.length === 0 && (
        <div className="notice">
          <p style={{ marginTop: 0 }}>
            Für diesen Standort gibt es noch keine Vertragsklauseln.
          </p>
          {hasImportableDefaults && (
            <form action={importDefaults}>
              <input type="hidden" name="locationId" value={loc.id} />
              <input type="hidden" name="locationCode" value={loc.code} />
              <button type="submit">Aus importierter Word-Vorlage übernehmen</button>
            </form>
          )}
        </div>
      )}

      {clauses.map((c, i) => (
        <details key={c.id} className="card" style={{ marginBottom: 12 }} open={i === 0}>
          <summary>
            <strong>
              {i + 1}. {c.title_de || <span className="muted">(ohne Titel)</span>}
            </strong>
          </summary>
          <form action={saveClause} style={{ marginTop: 12 }}>
            <input type="hidden" name="clauseId" value={c.id} />
            <input type="hidden" name="locationCode" value={loc.code} />

            <div className="cards" style={{ gridTemplateColumns: '1fr 1fr' }}>
              <label>
                Titel (DE)
                <input name="titleDe" defaultValue={c.title_de} style={{ width: '100%' }} />
              </label>
              <label>
                Titel (EN)
                <input name="titleEn" defaultValue={c.title_en} style={{ width: '100%' }} />
              </label>
            </div>

            <div className="cards" style={{ gridTemplateColumns: '1fr 1fr', marginTop: 8 }}>
              <label>
                Text (DE)
                <textarea
                  name="bodyDe"
                  defaultValue={c.body_de}
                  rows={8}
                  style={{ width: '100%', fontFamily: 'inherit' }}
                />
              </label>
              <label>
                Text (EN)
                <textarea
                  name="bodyEn"
                  defaultValue={c.body_en}
                  rows={8}
                  style={{ width: '100%', fontFamily: 'inherit' }}
                />
              </label>
            </div>

            <p className="muted" style={{ fontSize: 12 }}>
              Platzhalter wie «Nachname» oder «Nutzung_Üw» werden beim Erzeugen
              des Dokuments automatisch durch die Buchungsdaten ersetzt.
            </p>

            <button type="submit">Speichern</button>
          </form>
          <form action={deleteClause} style={{ marginTop: 8 }}>
            <input type="hidden" name="clauseId" value={c.id} />
            <input type="hidden" name="locationCode" value={loc.code} />
            <button type="submit" style={{ color: 'var(--warn)' }}>
              Klausel löschen
            </button>
          </form>
        </details>
      ))}

      <div className="card">
        <strong>Neue Klausel</strong>
        <form action={addClause} style={{ marginTop: 8 }}>
          <input type="hidden" name="locationId" value={loc.id} />
          <input type="hidden" name="locationCode" value={loc.code} />
          <div className="cards" style={{ gridTemplateColumns: '1fr 1fr' }}>
            <label>
              Titel (DE)
              <input name="newTitleDe" required style={{ width: '100%' }} />
            </label>
            <label>
              Titel (EN)
              <input name="newTitleEn" style={{ width: '100%' }} />
            </label>
          </div>
          <button type="submit" style={{ marginTop: 8 }}>
            Klausel hinzufügen
          </button>
        </form>
      </div>
    </>
  );
}
