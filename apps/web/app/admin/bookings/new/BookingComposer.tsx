'use client';

// The "when, how many, what extras — and what does that cost" half of the
// internal booking form.
//
// Three things drove pulling it out of the server-rendered page:
//
//   1. Native date and datetime inputs render in the BROWSER's locale, and no
//      attribute changes that — `lang="de"` is honoured by Firefox and ignored
//      by Chrome, which is why a first attempt at this still showed
//      "09 / 22 / 2026" to German staff. So the date is a DateField (a
//      TT.MM.JJJJ text field with the native picker behind a calendar button)
//      and the time is a select, with a plain-German echo of the whole range
//      underneath.
//
//   2. That select carries quarter-hour steps only. `step="900"` on a native
//      time input still lets the spinner walk minute by minute; a list of
//      quarter hours is four choices an hour and no scrolling past 07:23.
//
//   3. The price appears while you type. Staff were quoting on the phone from
//      a form that only revealed the number after submitting.
//
// It prices with @vs/pricing — the same module the server charges from (see
// lib/booking-pricing.ts), which is what makes "what you see is what gets
// charged" true by construction rather than by two implementations agreeing.
// Every field is still a plain named input inside the surrounding <form>, so
// the server action receives exactly what it did before.

import { useMemo, useState } from 'react';
import { computePrice, type TariffConfig } from '@vs/pricing';
import { DateField } from '../../../DateField';
import { BikePicker } from '../../../BikePicker';
import { cleanBikeCounts } from '@/lib/bike-sizes';

export interface ComposerExtra {
  id: string;
  type: 'toggle' | 'quantity';
  labelDe: string;
  price?: number;
  pricePerUnit?: number;
  min?: number;
  max?: number;
}

/** Every quarter hour of the day, as value + German label. */
const TIME_OPTIONS = Array.from({ length: 24 * 4 }, (_, i) => {
  const h = Math.floor(i / 4);
  const m = (i % 4) * 15;
  const value = `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
  return { value, label: `${value} Uhr` };
});

const dayFmt = new Intl.DateTimeFormat('de-DE', {
  weekday: 'short',
  day: '2-digit',
  month: '2-digit',
  year: 'numeric',
  timeZone: 'Europe/Berlin',
});

/** "2026-09-14" + "16:00" → the datetime-local string the action expects. */
function joinLocal(date: string, time: string): string {
  return date && time ? `${date}T${time}` : '';
}

function parseLocal(date: string, time: string): Date | null {
  if (!date || !time) return null;
  const [y, mo, d] = date.split('-').map(Number);
  const [h, mi] = time.split(':').map(Number);
  if ([y, mo, d, h, mi].some((n) => !Number.isFinite(n))) return null;
  // Built with the local constructor on a server/browser running Berlin time —
  // the same technique lib/booking-pricing.ts's parseBerlinLocal uses.
  return new Date(y, mo - 1, d, h, mi);
}

function fmtDuration(minutes: number): string {
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  if (h === 0) return `${m} Minuten`;
  if (m === 0) return h === 1 ? '1 Stunde' : `${h} Stunden`;
  return `${h} Std. ${m} Min.`;
}

export function BookingComposer({
  tariffConfig,
  extrasCatalogue,
  initial,
  bikePricePerUnit = null,
}: {
  tariffConfig: TariffConfig | null;
  extrasCatalogue: ComposerExtra[];
  initial: {
    from: string;
    to: string;
    persons: string;
    eventType: string;
    extras: string[];
  };
  /** null when this tariff does not lend bikes at all. */
  bikePricePerUnit?: number | null;
}) {
  const [fromDate, setFromDate] = useState(initial.from.slice(0, 10));
  const [fromTime, setFromTime] = useState(initial.from.slice(11, 16) || '14:00');
  const [toDate, setToDate] = useState(initial.to.slice(0, 10) || initial.from.slice(0, 10));
  const [toTime, setToTime] = useState(initial.to.slice(11, 16) || '18:00');
  const [persons, setPersons] = useState(initial.persons);
  const [eventType, setEventType] = useState(initial.eventType);
  const [extras, setExtras] = useState<string[]>(initial.extras);
  const [quantities, setQuantities] = useState<Record<string, string>>({});
  const [bikes, setBikes] = useState<Record<string, number>>({});

  const start = parseLocal(fromDate, fromTime);
  const end = parseLocal(toDate, toTime);
  const personsNum = Number(persons) || 0;

  const durationMin = start && end ? Math.round((end.getTime() - start.getTime()) / 60000) : 0;

  const quantitiesNum = useMemo(() => {
    const out: Record<string, number> = {};
    for (const [id, v] of Object.entries(quantities)) {
      const n = Number(v);
      if (Number.isFinite(n) && n > 0) out[id] = n;
    }
    return out;
  }, [quantities]);

  const bikeCounts = useMemo(() => cleanBikeCounts(bikes), [bikes]);

  const price = useMemo(() => {
    if (!tariffConfig || !start || !end || durationMin <= 0 || personsNum <= 0) return null;
    try {
      return computePrice(
        {
          start,
          end,
          persons: personsNum,
          extras,
          extraQuantities: quantitiesNum,
          // Was missing, so the preview ignored the bikes entirely and quoted
          // less than the server went on to charge.
          bikes: bikeCounts ?? undefined,
          lang: 'de',
        },
        tariffConfig,
      );
    } catch {
      // A price is a convenience here; the server recomputes it anyway. A
      // half-entered form must never take the whole screen down.
      return null;
    }
  }, [tariffConfig, start, end, durationMin, personsNum, extras, quantitiesNum, bikeCounts]);

  function toggleExtra(id: string) {
    setExtras((p) => (p.includes(id) ? p.filter((x) => x !== id) : [...p, id]));
  }

  return (
    <>
      {/* What the server action actually reads. Kept as hidden fields so the
          form still posts one datetime-local string per end, exactly as
          before — none of the server code had to learn about this component. */}
      <input type="hidden" name="from" value={joinLocal(fromDate, fromTime)} />
      <input type="hidden" name="to" value={joinLocal(toDate, toTime)} />

      <div className="panel">
        <h2 style={{ marginTop: 0 }}>Termin</h2>

        <div className="formgrid">
          <label className="col-6">
            Von
            <span className="datetime">
              <DateField
                value={fromDate}
                required
                onChange={(iso) => {
                  setFromDate(iso);
                  // Almost every booking starts and ends on one day; keeping
                  // the end date in step means the second field is usually
                  // already right, and it can still be changed afterwards.
                  if (!toDate || toDate === fromDate) setToDate(iso);
                }}
              />
              <select value={fromTime} onChange={(e) => setFromTime(e.target.value)}>
                {TIME_OPTIONS.map((o) => (
                  <option key={o.value} value={o.value}>
                    {o.label}
                  </option>
                ))}
              </select>
            </span>
          </label>

          <label className="col-6">
            Bis
            <span className="datetime">
              <DateField value={toDate} required onChange={setToDate} />
              <select value={toTime} onChange={(e) => setToTime(e.target.value)}>
                {TIME_OPTIONS.map((o) => (
                  <option key={o.value} value={o.value}>
                    {o.label}
                  </option>
                ))}
              </select>
            </span>
          </label>

          <label className="col-3">
            Personen
            <input
              type="number"
              name="persons"
              min={1}
              required
              value={persons}
              onChange={(e) => setPersons(e.target.value)}
            />
          </label>

          <label className="col-9">
            Art der Veranstaltung
            <input
              type="text"
              name="event_type"
              placeholder="z. B. Kindergeburtstag, Schulklasse"
              value={eventType}
              onChange={(e) => setEventType(e.target.value)}
            />
          </label>
        </div>

        {/* The unambiguous restatement. The browser's own picker may render
            mm/dd/yyyy on an English-locale machine; this line never does. */}
        <p className="datetime__echo">
          {start && end && durationMin > 0 ? (
            <>
              <strong>
                {dayFmt.format(start)}, {fromTime}
                {toDate !== fromDate ? ` – ${dayFmt.format(end)}, ${toTime}` : ` – ${toTime}`} Uhr
              </strong>{' '}
              · {fmtDuration(durationMin)}
            </>
          ) : (
            'Bitte Beginn und Ende wählen.'
          )}
        </p>
      </div>

      {extrasCatalogue.length > 0 && (
        <div className="panel">
          <h2 style={{ marginTop: 0 }}>Extras</h2>
          <div className="formgrid">
            {extrasCatalogue.map((x) =>
              x.type === 'quantity' ? (
                <label className="col-4" key={x.id}>
                  {x.labelDe} ({(x.pricePerUnit ?? 0).toFixed(2)} € pro Stück)
                  <input
                    type="number"
                    name={`extra_qty_${x.id}`}
                    min={x.min ?? 0}
                    max={x.max}
                    value={quantities[x.id] ?? ''}
                    onChange={(e) =>
                      setQuantities((p) => ({ ...p, [x.id]: e.target.value }))
                    }
                  />
                </label>
              ) : (
                <label
                  className="col-4"
                  key={x.id}
                  style={{ fontWeight: 400, color: 'var(--fg)' }}
                >
                  <input
                    type="checkbox"
                    name="extras"
                    value={x.id}
                    checked={extras.includes(x.id)}
                    onChange={() => toggleExtra(x.id)}
                    style={{ width: 'auto', display: 'inline', marginRight: 8 }}
                  />
                  {x.labelDe} (+{(x.price ?? 0).toFixed(2)} €)
                </label>
              ),
            )}
          </div>
        </div>
      )}

      {bikePricePerUnit != null && (
        <div className="panel">
          <BikePicker
            counts={bikes}
            onChange={setBikes}
            pricePerUnit={bikePricePerUnit}
          />
        </div>
      )}

      {price && (
        <div className="pricebox">
          <div className="pricebox__head">
            <strong>Voraussichtlicher Preis</strong>
            <span className="pricebox__total">
              {price.onRequest ? 'nach Vereinbarung' : `${(price.total ?? 0).toFixed(2)} €`}
            </span>
          </div>

          {!price.onRequest && (
            <table>
              <tbody>
                <tr>
                  <td>
                    Grundpreis (bis {price.tierHours ?? 0} Std.)
                    {price.personsLabel ? ` · ${price.personsLabel}` : ''}
                  </td>
                  <td>{((price.base ?? 0) + price.personsDelta).toFixed(2)} €</td>
                </tr>
                {price.timeSurcharge > 0 && (
                  <tr>
                    <td>Zeit-Zuschlag</td>
                    <td>{price.timeSurcharge.toFixed(2)} €</td>
                  </tr>
                )}
                {price.extrasCost > 0 && (
                  <tr>
                    <td>Extras: {price.extrasSelected.join(', ')}</td>
                    <td>{price.extrasCost.toFixed(2)} €</td>
                  </tr>
                )}
                <tr className="is-total">
                  <td>Summe</td>
                  <td>{(price.total ?? 0).toFixed(2)} €</td>
                </tr>
                {price.caution != null && price.caution > 0 && (
                  <tr>
                    <td>Kaution (separat, wird zurückerstattet)</td>
                    <td>{price.caution.toFixed(2)} €</td>
                  </tr>
                )}
              </tbody>
            </table>
          )}

          <p className="muted small" style={{ margin: 'var(--s3) 0 0' }}>
            Vorschau mit demselben Preismodul, das beim Anlegen tatsächlich
            rechnet. Der Server prüft die Zeiten noch einmal.
          </p>
        </div>
      )}
    </>
  );
}
