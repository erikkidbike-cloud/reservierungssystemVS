'use client';

// The tariff editor: every number the pricing engine uses for one location's
// tariff, editable — duration tiers, the person-tiers/person-bands pricing
// model, the time surcharge, the deposit (caution) rule's amounts, and the
// extras (toggle or per-unit-quantity, with an optional min/max). Local state
// mirrors @vs/pricing's TariffConfig exactly; saving calls the server action
// directly with that object (see actions.ts for why), which re-validates it
// with the identical parseTariffConfig() the booking engine uses before
// writing anything.

import { useState } from 'react';
import type {
  TariffConfig,
  DurationTier,
  PersonTier,
  PersonBand,
  SurchargeRule,
  CautionRule,
  ExtraDef,
} from '@vs/pricing';
import { saveTariffConfig } from './actions';

interface Props {
  tariffId: string;
  locationName: string;
  tariffType: string;
  initial: TariffConfig;
}

function euroInput(value: number, onChange: (n: number) => void, width = 90) {
  return (
    <input
      type="number"
      step="0.01"
      value={value}
      onChange={(e) => onChange(Number(e.target.value))}
      style={{ width }}
    />
  );
}

function defaultPersonTiers(): PersonTier[] {
  return [{ max: 30, mult: 1 }];
}

function defaultPersonBands(tiers: DurationTier[]): PersonBand[] {
  return [{ max: 9999, addByTier: Object.fromEntries(tiers.map((t) => [String(t.hoursLabel), 0])) }];
}

function defaultCaution(type: CautionRule['type']): CautionRule {
  if (type === 'we') {
    return { type: 'we', personsThreshold: 50, amountInWindow: null, amountStandard: 200, amountHigh: 500 };
  }
  if (type === 'wa') return { type: 'wa', personsThreshold: 45, amountBelow: 50, amountAtOrAbove: 70 };
  return { type: 'none' };
}

/** Every current duration tier gets a key in every band, or a save is rejected. */
function syncBands(bands: PersonBand[], tiers: DurationTier[]): PersonBand[] {
  return bands.map((b) => {
    const addByTier = { ...b.addByTier };
    for (const t of tiers) {
      if (!(String(t.hoursLabel) in addByTier)) addByTier[String(t.hoursLabel)] = 0;
    }
    return { ...b, addByTier };
  });
}

export default function TariffEditor({ tariffId, locationName, tariffType, initial }: Props) {
  const [cfg, setCfg] = useState<TariffConfig>(initial);
  const [status, setStatus] = useState<'idle' | 'saving' | 'saved' | 'error'>('idle');
  const [error, setError] = useState<string | null>(null);

  async function save() {
    setStatus('saving');
    setError(null);
    const result = await saveTariffConfig(tariffId, cfg);
    if (!result.ok) {
      setError(result.error ?? 'Unbekannter Fehler');
      setStatus('error');
      return;
    }
    setStatus('saved');
  }

  function setModel(model: TariffConfig['model']) {
    setCfg((c) => {
      if (model === c.model) return c;
      if (model === 'multiplier') {
        return { ...c, model, personTiers: c.personTiers ?? defaultPersonTiers(), personBands: undefined };
      }
      return {
        ...c,
        model,
        personBands: syncBands(c.personBands ?? defaultPersonBands(c.durationTiers), c.durationTiers),
        personTiers: undefined,
      };
    });
  }

  function updateDurationTier(i: number, patch: Partial<DurationTier>) {
    setCfg((c) => {
      const durationTiers = c.durationTiers.map((t, idx) => (idx === i ? { ...t, ...patch } : t));
      return {
        ...c,
        durationTiers,
        personBands: c.personBands ? syncBands(c.personBands, durationTiers) : c.personBands,
      };
    });
  }
  function addDurationTier() {
    setCfg((c) => {
      const last = c.durationTiers[c.durationTiers.length - 1];
      const durationTiers = [
        ...c.durationTiers,
        { maxMin: (last?.maxMin ?? 0) + 60, hoursLabel: (last?.hoursLabel ?? 0) + 1, base: last?.base ?? 0 },
      ];
      return {
        ...c,
        durationTiers,
        personBands: c.personBands ? syncBands(c.personBands, durationTiers) : c.personBands,
      };
    });
  }
  function removeDurationTier(i: number) {
    setCfg((c) => ({ ...c, durationTiers: c.durationTiers.filter((_, idx) => idx !== i) }));
  }

  function updatePersonTier(i: number, patch: Partial<PersonTier>) {
    setCfg((c) => ({
      ...c,
      personTiers: (c.personTiers ?? []).map((t, idx) => (idx === i ? { ...t, ...patch } : t)),
    }));
  }
  function addPersonTier() {
    setCfg((c) => {
      const last = (c.personTiers ?? [])[((c.personTiers ?? []).length || 1) - 1];
      return { ...c, personTiers: [...(c.personTiers ?? []), { max: (last?.max ?? 0) + 10, mult: last?.mult ?? 1 }] };
    });
  }
  function removePersonTier(i: number) {
    setCfg((c) => ({ ...c, personTiers: (c.personTiers ?? []).filter((_, idx) => idx !== i) }));
  }

  function updateBand(i: number, patch: Partial<PersonBand>) {
    setCfg((c) => ({
      ...c,
      personBands: (c.personBands ?? []).map((b, idx) => (idx === i ? { ...b, ...patch } : b)),
    }));
  }
  function updateBandTier(i: number, hoursLabel: number, value: number) {
    setCfg((c) => ({
      ...c,
      personBands: (c.personBands ?? []).map((b, idx) =>
        idx === i ? { ...b, addByTier: { ...b.addByTier, [String(hoursLabel)]: value } } : b,
      ),
    }));
  }
  function addBand() {
    setCfg((c) => ({
      ...c,
      personBands: [...(c.personBands ?? []), ...syncBands([{ max: 9999, addByTier: {} }], c.durationTiers)],
    }));
  }
  function removeBand(i: number) {
    setCfg((c) => ({ ...c, personBands: (c.personBands ?? []).filter((_, idx) => idx !== i) }));
  }

  function setSurcharge(s: SurchargeRule) {
    setCfg((c) => ({ ...c, surcharge: s }));
  }

  function setCautionType(type: CautionRule['type']) {
    setCfg((c) => ({ ...c, caution: defaultCaution(type) }));
  }
  function patchCaution(patch: Record<string, unknown>) {
    setCfg((c) => ({ ...c, caution: { ...c.caution, ...patch } as CautionRule }));
  }

  function updateExtra(i: number, patch: Partial<ExtraDef>) {
    setCfg((c) => ({ ...c, extras: c.extras.map((e, idx) => (idx === i ? ({ ...e, ...patch } as ExtraDef) : e)) }));
  }
  function setExtraType(i: number, type: ExtraDef['type']) {
    setCfg((c) => ({
      ...c,
      extras: c.extras.map((e, idx) => {
        if (idx !== i) return e;
        if (type === 'quantity') {
          return { id: e.id, type: 'quantity', pricePerUnit: 1, labelDe: e.labelDe, labelEn: e.labelEn };
        }
        return { id: e.id, type: 'toggle', price: 1, labelDe: e.labelDe, labelEn: e.labelEn };
      }),
    }));
  }
  function addExtra() {
    setCfg((c) => ({
      ...c,
      extras: [
        ...c.extras,
        { id: `extra_${c.extras.length + 1}`, type: 'toggle', price: 0, labelDe: 'Neues Extra', labelEn: 'New extra' },
      ],
    }));
  }
  function removeExtra(i: number) {
    setCfg((c) => ({ ...c, extras: c.extras.filter((_, idx) => idx !== i) }));
  }

  return (
    <details className="panel card">
      <summary>
        <strong>{locationName}</strong> <span className="muted small">({tariffType})</span>
      </summary>

      <h3>Modell</h3>
      <select value={cfg.model} onChange={(e) => setModel(e.target.value as TariffConfig['model'])}>
        <option value="multiplier">Personen-Multiplikator (Grundpreis × Faktor)</option>
        <option value="person_band">Personen-Band (fester Aufschlag je Staffel)</option>
      </select>

      <h3 style={{ marginTop: 16 }}>Dauer-Staffel</h3>
      <div className="table-scroll">
        <table>
          <thead>
            <tr>
              <th>Std.-Label</th>
              <th>Bis Minuten</th>
              <th>Grundpreis</th>
              <th />
            </tr>
          </thead>
          <tbody>
            {cfg.durationTiers.map((t, i) => (
              <tr key={i}>
                <td>
                  <input
                    type="number"
                    value={t.hoursLabel}
                    onChange={(e) => updateDurationTier(i, { hoursLabel: Number(e.target.value) })}
                    style={{ width: 70 }}
                  />
                </td>
                <td>
                  <input
                    type="number"
                    value={t.maxMin}
                    onChange={(e) => updateDurationTier(i, { maxMin: Number(e.target.value) })}
                    style={{ width: 90 }}
                  />
                </td>
                <td>{euroInput(t.base, (n) => updateDurationTier(i, { base: n }))}</td>
                <td>
                  <button type="button" className="secondary" onClick={() => removeDurationTier(i)}>
                    Entfernen
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <button type="button" className="secondary" onClick={addDurationTier} style={{ marginTop: 8 }}>
        + Staffel
      </button>

      {cfg.model === 'multiplier' && (
        <>
          <h3 style={{ marginTop: 16 }}>Personen-Staffel (Faktor)</h3>
          <div className="table-scroll">
            <table>
              <thead>
                <tr>
                  <th>Bis Personen</th>
                  <th>Faktor</th>
                  <th />
                </tr>
              </thead>
              <tbody>
                {(cfg.personTiers ?? []).map((p, i) => (
                  <tr key={i}>
                    <td>
                      <input
                        type="number"
                        value={p.max}
                        onChange={(e) => updatePersonTier(i, { max: Number(e.target.value) })}
                        style={{ width: 80 }}
                      />
                    </td>
                    <td>
                      <input
                        type="number"
                        step="0.05"
                        value={p.mult}
                        onChange={(e) => updatePersonTier(i, { mult: Number(e.target.value) })}
                        style={{ width: 80 }}
                      />
                    </td>
                    <td>
                      <button type="button" className="secondary" onClick={() => removePersonTier(i)}>
                        Entfernen
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <button type="button" className="secondary" onClick={addPersonTier} style={{ marginTop: 8 }}>
            + Personen-Staffel
          </button>
          <p className="muted small">Über der höchsten Staffel: Preis nach Vereinbarung.</p>
        </>
      )}

      {cfg.model === 'person_band' && (
        <>
          <h3 style={{ marginTop: 16 }}>Personen-Band (Aufschlag je Dauer-Staffel)</h3>
          <div className="table-scroll">
            <table>
              <thead>
                <tr>
                  <th>Bis Personen</th>
                  {cfg.durationTiers.map((t) => (
                    <th key={t.hoursLabel}>{t.hoursLabel} Std.</th>
                  ))}
                  <th />
                </tr>
              </thead>
              <tbody>
                {(cfg.personBands ?? []).map((b, i) => (
                  <tr key={i}>
                    <td>
                      <input
                        type="number"
                        value={b.max}
                        onChange={(e) => updateBand(i, { max: Number(e.target.value) })}
                        style={{ width: 80 }}
                      />
                    </td>
                    {cfg.durationTiers.map((t) => (
                      <td key={t.hoursLabel}>
                        {euroInput(b.addByTier[String(t.hoursLabel)] ?? 0, (n) =>
                          updateBandTier(i, t.hoursLabel, n),
                        )}
                      </td>
                    ))}
                    <td>
                      <button type="button" className="secondary" onClick={() => removeBand(i)}>
                        Entfernen
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <button type="button" className="secondary" onClick={addBand} style={{ marginTop: 8 }}>
            + Band
          </button>
          <p className="muted small">9999 = keine Obergrenze (höchstes Band).</p>
        </>
      )}

      <h3 style={{ marginTop: 16 }}>Zeit-Zuschlag</h3>
      <label style={{ fontWeight: 400, color: 'var(--fg)' }}>
        <input
          type="checkbox"
          checked={cfg.surcharge.type === 'window_or_weekend'}
          onChange={(e) =>
            setSurcharge(
              e.target.checked
                ? { type: 'window_or_weekend', amount: 35, windowStart: '09:00', windowEnd: '17:30' }
                : { type: 'none' },
            )
          }
          style={{ width: 'auto', display: 'inline', marginRight: 8 }}
        />
        Zuschlag außerhalb eines Zeitfensters / am Wochenende
      </label>
      {cfg.surcharge.type === 'window_or_weekend' && (
        <div className="row" style={{ marginTop: 8 }}>
          <label style={{ marginBottom: 0 }}>
            Betrag
            {euroInput(cfg.surcharge.amount, (n) =>
              setSurcharge({ ...(cfg.surcharge as Extract<SurchargeRule, { type: 'window_or_weekend' }>), amount: n }),
            )}
          </label>
          <label style={{ marginBottom: 0 }}>
            Von
            <input
              type="time"
              value={cfg.surcharge.windowStart}
              onChange={(e) =>
                setSurcharge({
                  ...(cfg.surcharge as Extract<SurchargeRule, { type: 'window_or_weekend' }>),
                  windowStart: e.target.value,
                })
              }
            />
          </label>
          <label style={{ marginBottom: 0 }}>
            Bis
            <input
              type="time"
              value={cfg.surcharge.windowEnd}
              onChange={(e) =>
                setSurcharge({
                  ...(cfg.surcharge as Extract<SurchargeRule, { type: 'window_or_weekend' }>),
                  windowEnd: e.target.value,
                })
              }
            />
          </label>
        </div>
      )}

      <h3 style={{ marginTop: 16 }}>Kaution</h3>
      <select value={cfg.caution.type} onChange={(e) => setCautionType(e.target.value as CautionRule['type'])}>
        <option value="none">Keine Kaution</option>
        <option value="we">Nach Personenzahl + Zeitfenster (wie Weinstraße)</option>
        <option value="wa">Nach Personenzahl (wie Wassertorplatz)</option>
      </select>

      {cfg.caution.type === 'we' && (
        <div className="grid-2" style={{ marginTop: 8 }}>
          <label>
            Personen-Schwelle
            <input
              type="number"
              value={cfg.caution.personsThreshold}
              onChange={(e) => patchCaution({ personsThreshold: Number(e.target.value) })}
            />
          </label>
          <label>
            Betrag im Zeitfenster (leer = keine Kaution)
            <input
              type="number"
              step="0.01"
              value={cfg.caution.amountInWindow ?? ''}
              onChange={(e) =>
                patchCaution({ amountInWindow: e.target.value === '' ? null : Number(e.target.value) })
              }
            />
          </label>
          <label>
            Standard-Betrag
            {euroInput(cfg.caution.amountStandard, (n) => patchCaution({ amountStandard: n }))}
          </label>
          <label>
            Hoher Betrag (über Schwelle außerhalb Zeitfenster)
            {euroInput(cfg.caution.amountHigh, (n) => patchCaution({ amountHigh: n }))}
          </label>
        </div>
      )}

      {cfg.caution.type === 'wa' && (
        <div className="grid-2" style={{ marginTop: 8 }}>
          <label>
            Personen-Schwelle
            <input
              type="number"
              value={cfg.caution.personsThreshold}
              onChange={(e) => patchCaution({ personsThreshold: Number(e.target.value) })}
            />
          </label>
          <label>
            Betrag bis Schwelle
            {euroInput(cfg.caution.amountBelow, (n) => patchCaution({ amountBelow: n }))}
          </label>
          <label>
            Betrag ab Schwelle
            {euroInput(cfg.caution.amountAtOrAbove, (n) => patchCaution({ amountAtOrAbove: n }))}
          </label>
        </div>
      )}

      <h3 style={{ marginTop: 16 }}>Extras</h3>
      {cfg.extras.map((ex, i) => (
        <div key={i} className="panel" style={{ background: 'var(--bg)' }}>
          <div className="grid-2">
            <label>
              Interne ID
              <input type="text" value={ex.id} onChange={(e) => updateExtra(i, { id: e.target.value })} />
            </label>
            <label>
              Typ
              <select value={ex.type} onChange={(e) => setExtraType(i, e.target.value as ExtraDef['type'])}>
                <option value="toggle">Ein/Aus (fester Preis)</option>
                <option value="quantity">Menge (Preis pro Einheit)</option>
              </select>
            </label>
            <label>
              Bezeichnung (DE)
              <input type="text" value={ex.labelDe} onChange={(e) => updateExtra(i, { labelDe: e.target.value })} />
            </label>
            <label>
              Bezeichnung (EN)
              <input type="text" value={ex.labelEn} onChange={(e) => updateExtra(i, { labelEn: e.target.value })} />
            </label>
            {ex.type === 'toggle' ? (
              <label>
                Preis
                {euroInput(ex.price, (n) => updateExtra(i, { price: n }))}
              </label>
            ) : (
              <>
                <label>
                  Preis pro Einheit
                  {euroInput(ex.pricePerUnit, (n) => updateExtra(i, { pricePerUnit: n }))}
                </label>
                <label>
                  Min. Menge (optional)
                  <input
                    type="number"
                    value={ex.min ?? ''}
                    onChange={(e) => updateExtra(i, { min: e.target.value === '' ? undefined : Number(e.target.value) })}
                    style={{ width: 90 }}
                  />
                </label>
                <label>
                  Max. Menge (optional)
                  <input
                    type="number"
                    value={ex.max ?? ''}
                    onChange={(e) => updateExtra(i, { max: e.target.value === '' ? undefined : Number(e.target.value) })}
                    style={{ width: 90 }}
                  />
                </label>
              </>
            )}
          </div>
          <button type="button" className="secondary" onClick={() => removeExtra(i)}>
            Extra entfernen
          </button>
        </div>
      ))}
      <button type="button" className="secondary" onClick={addExtra}>
        + Extra
      </button>

      {cfg.bikePricePerUnit != null && (
        <>
          <h3 style={{ marginTop: 16 }}>Kinderfahrräder (Legacy-Feld)</h3>
          <label>
            Preis pro Fahrrad
            {euroInput(cfg.bikePricePerUnit, (n) => setCfg((c) => ({ ...c, bikePricePerUnit: n })))}
          </label>
          <button
            type="button"
            className="secondary"
            onClick={() => setCfg((c) => ({ ...c, bikePricePerUnit: undefined }))}
          >
            Fahrrad-Preis entfernen
          </button>
        </>
      )}

      {error && <div className="notice">Speichern fehlgeschlagen: {error}</div>}
      {status === 'saved' && <div className="notice notice--ok">Gespeichert.</div>}

      <div style={{ marginTop: 16 }}>
        <button type="button" onClick={save} disabled={status === 'saving'}>
          {status === 'saving' ? 'Wird gespeichert …' : 'Speichern'}
        </button>
      </div>
    </details>
  );
}
