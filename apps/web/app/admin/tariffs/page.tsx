// Prices, read-only.
//
// Deliberately not an editor yet: the tariff config is nested JSONB, an editor
// for it is fiddly, and prices change roughly yearly — so a clear view of what
// the engine will actually charge is most of the value for a fraction of the
// work. Editing stays a deliberate change to supabase/seed/seed.sql.
//
// The figures below are parsed with the same parseTariffConfig() the pricing
// engine uses, so this page cannot drift from what customers are charged: if a
// tariff row were malformed, this page reports it rather than rendering a
// plausible-looking lie.

import { cookies } from 'next/headers';
import { serverClient } from '@/lib/supabase';
import { parseTariffConfig, type TariffConfig } from '@vs/pricing';
import type { Location, TariffRow } from '@/lib/db-types';

export const dynamic = 'force-dynamic';

const euro = (n: number) =>
  new Intl.NumberFormat('de-DE', { style: 'currency', currency: 'EUR' }).format(n);

const CAUTION_LABEL: Record<string, string> = {
  none: 'Keine Kaution',
  we: '≤50 Pers. ganz innerhalb 09:00–17:30 (Mo–Sa): keine · >50 Pers. im Fenster: 200 € · >50 außerhalb: 500 € · sonst: 200 €',
  wa: '≤45 Personen: 50 € · ab 46 Personen: 70 €',
};

function TariffView({ cfg }: { cfg: TariffConfig }) {
  return (
    <>
      <h3>Dauer-Staffel</h3>
      <div className="table-scroll" style={{ marginBottom: 16 }}>
        <table>
          <thead>
            <tr>
              <th>Bis</th>
              <th>Grundpreis</th>
            </tr>
          </thead>
          <tbody>
            {cfg.durationTiers.map((t) => (
              <tr key={t.maxMin}>
                <td>{t.hoursLabel} Std.</td>
                <td>{euro(t.base)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {cfg.model === 'multiplier' && cfg.personTiers && (
        <>
          <h3>Personen-Staffel (Faktor auf den Grundpreis)</h3>
          <div className="table-scroll" style={{ marginBottom: 16 }}>
            <table>
              <thead>
                <tr>
                  <th>Bis Personen</th>
                  <th>Faktor</th>
                </tr>
              </thead>
              <tbody>
                {cfg.personTiers.map((p) => (
                  <tr key={p.max}>
                    <td>≤ {p.max}</td>
                    <td>× {p.mult.toFixed(2)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <p className="muted small">
            Über {cfg.personTiers[cfg.personTiers.length - 1]?.max} Personen:
            Preis nach Vereinbarung.
          </p>
        </>
      )}

      {cfg.model === 'person_band' && cfg.personBands && (
        <>
          <h3>Personen-Band (Aufschlag je Dauer-Staffel)</h3>
          <div className="table-scroll" style={{ marginBottom: 16 }}>
            <table>
              <thead>
                <tr>
                  <th>Bis Personen</th>
                  {cfg.durationTiers.map((t) => (
                    <th key={t.maxMin}>{t.hoursLabel} Std.</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {cfg.personBands.map((b) => (
                  <tr key={b.max}>
                    <td>{b.max >= 9999 ? 'darüber' : `≤ ${b.max}`}</td>
                    {cfg.durationTiers.map((t) => (
                      <td key={t.maxMin}>
                        {euro(b.addByTier[String(t.hoursLabel)] ?? 0)}
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      )}

      <h3>Zeit-Zuschlag</h3>
      <p className="muted">
        {cfg.surcharge.type === 'none'
          ? 'Kein Zeit-Zuschlag.'
          : `${euro(cfg.surcharge.amount)}, wenn Beginn oder Ende außerhalb ${cfg.surcharge.windowStart}–${cfg.surcharge.windowEnd} liegt oder der Zeitraum ein Wochenende berührt.`}
      </p>

      <h3>Extras</h3>
      {cfg.extras.length === 0 && cfg.bikePricePerUnit == null ? (
        <p className="muted">Keine Extras.</p>
      ) : (
        <ul className="muted">
          {cfg.extras.map((e) => (
            <li key={e.id}>
              {e.labelDe} — {euro(e.price)}
            </li>
          ))}
          {cfg.bikePricePerUnit != null && (
            <li>Kinderfahrrad — {euro(cfg.bikePricePerUnit)} pro Rad</li>
          )}
        </ul>
      )}

      <h3>Kaution</h3>
      <p className="muted">{CAUTION_LABEL[cfg.caution.type] ?? cfg.caution.type}</p>
    </>
  );
}

export default async function TariffsPage() {
  const supabase = serverClient(await cookies());
  const [{ data: locations }, { data: tariffs, error }] = await Promise.all([
    supabase.from('locations').select('*').eq('is_active', true).order('sort_order'),
    supabase.from('tariffs').select('*').eq('is_active', true),
  ]);

  if (error) {
    return (
      <>
        <h1>Preise</h1>
        <div className="notice">Konnte Preise nicht laden: {error.message}</div>
      </>
    );
  }

  const rows = (tariffs ?? []) as TariffRow[];

  return (
    <>
      <h1>Preise</h1>
      <p className="muted">
        Das ist exakt, was die Preis-Engine berechnet — diese Seite liest dieselbe
        Konfiguration wie das Buchungsformular. Ansicht nur zum Lesen; Änderungen
        laufen zurzeit über eine Anpassung der Preistabelle im Code.
      </p>

      {(locations ?? []).map((l) => {
        const loc = l as Location;
        const row = rows.find(
          (t) => t.location_id === loc.id && t.tariff_type === 'standard',
        );

        let cfg: TariffConfig | null = null;
        let parseError: string | null = null;
        if (row) {
          try {
            cfg = parseTariffConfig(row.config);
          } catch (err) {
            parseError = (err as Error).message;
          }
        }

        return (
          <div className="panel" key={loc.id}>
            <h2 style={{ marginTop: 0 }}>{loc.name}</h2>
            {!row && <p className="muted">Kein Standard-Tarif hinterlegt.</p>}
            {parseError && (
              <div className="notice">Tarif fehlerhaft: {parseError}</div>
            )}
            {cfg && <TariffView cfg={cfg} />}
          </div>
        );
      })}
    </>
  );
}
