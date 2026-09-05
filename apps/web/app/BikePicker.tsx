'use client';

// "Do you want to borrow bikes?" and, only if yes, how many of each size.
//
// Two things this replaces. It was one number, which the venue could not act
// on — a 26" frame is no use to a four-year-old, so staff phoned back for the
// sizes every time. And it was always on screen, a full panel of counters for
// the majority of bookings that bring their own bikes or want none.
//
// So the sizes appear only after someone says yes, and the whole thing is one
// compact block rather than a row per size at full width. The counters are
// −/+ buttons with the number between them: on a phone that is two taps and no
// keyboard, and it makes the per-size maximum visible by simply refusing to go
// past it rather than by rejecting the form afterwards.

import { BIKE_SIZES, MAX_PER_SIZE } from '@/lib/bike-sizes';

export function BikePicker({
  counts,
  onChange,
  pricePerUnit,
  lang = 'de',
}: {
  counts: Record<string, number>;
  onChange: (next: Record<string, number>) => void;
  pricePerUnit: number;
  lang?: 'de' | 'en';
}) {
  const t =
    lang === 'en'
      ? {
          question: "Would you like to use the traffic school's bikes?",
          yes: 'Yes, I would like bikes',
          no: 'No thanks / bringing our own',
          countLabel: `Number of bikes by size (€${pricePerUnit.toFixed(2)} per bike, max. ${MAX_PER_SIZE} per size)`,
          total: 'bikes',
          less: 'one fewer',
          more: 'one more',
        }
      : {
          question: 'Möchten Sie die Kinderfahrräder der Verkehrsschule nutzen?',
          yes: 'Ja, ich möchte Fahrräder nutzen',
          no: 'Nein, brauche keine / bringe eigene mit',
          countLabel: `Anzahl Fahrräder nach Größe/Alter (${pricePerUnit.toFixed(2)} € pro Fahrrad, max. ${MAX_PER_SIZE} pro Größe)`,
          total: 'Fahrräder',
          less: 'eines weniger',
          more: 'eines mehr',
        };

  const total = Object.values(counts).reduce((s, n) => s + (Number(n) || 0), 0);
  // "Wants bikes" is derived from the counts rather than kept as its own flag:
  // one source of truth means the panel can never be open with nothing in it
  // after a back-and-forth, or closed while counts survive into the price.
  const wants = Object.prototype.hasOwnProperty.call(counts, '__on') || total > 0;

  function setWants(on: boolean) {
    // The marker key is stripped before anything is priced or stored — see
    // cleanBikeCounts, which only ever copies real size keys across.
    if (on) onChange({ ...counts, __on: 0 });
    else onChange({});
  }

  function bump(key: string, delta: number) {
    const next = { ...counts };
    const value = Math.min(MAX_PER_SIZE, Math.max(0, (Number(next[key]) || 0) + delta));
    next[key] = value;
    next.__on = 0;
    onChange(next);
  }

  return (
    <div className="bikes">
      <p className="bikes__q">{t.question}</p>

      <div className="bikes__choice">
        <label>
          <input type="radio" name="wants_bikes" checked={wants} onChange={() => setWants(true)} />
          {t.yes}
        </label>
        <label>
          <input type="radio" name="wants_bikes" checked={!wants} onChange={() => setWants(false)} />
          {t.no}
        </label>
      </div>

      {wants && (
        <>
          <p className="bikes__label">{t.countLabel}</p>
          <ul className="bikes__list">
            {BIKE_SIZES.map((s) => {
              const n = Number(counts[s.key]) || 0;
              return (
                <li key={s.key}>
                  <span className="bikes__name">
                    {lang === 'en' ? s.labelEn : s.labelDe}
                    <span className="muted small"> ({lang === 'en' ? s.ageEn : s.ageDe})</span>
                  </span>
                  <span className="stepper">
                    <button
                      type="button"
                      onClick={() => bump(s.key, -1)}
                      disabled={n === 0}
                      aria-label={`${lang === 'en' ? s.labelEn : s.labelDe}: ${t.less}`}
                    >
                      −
                    </button>
                    <output>{n}</output>
                    <button
                      type="button"
                      onClick={() => bump(s.key, 1)}
                      disabled={n >= MAX_PER_SIZE}
                      aria-label={`${lang === 'en' ? s.labelEn : s.labelDe}: ${t.more}`}
                    >
                      +
                    </button>
                  </span>
                  {/* Posted with the surrounding form when there is one; the
                      public wizard ignores these and submits its own JSON. */}
                  <input type="hidden" name={`bike_${s.key}`} value={n} />
                </li>
              );
            })}
          </ul>
          {total > 0 && (
            <p className="muted small" style={{ margin: 'var(--s2) 0 0' }}>
              {total} {t.total} · {(total * pricePerUnit).toFixed(2)} €
            </p>
          )}
        </>
      )}
    </div>
  );
}
