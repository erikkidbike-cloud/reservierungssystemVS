'use client';

// Street / house number / postcode / town, checked against real addresses.
//
// These four were free text, so "Bergholzstr 8" and "Bergholzstraße 8" and
// "bergholzstrasse 8a" were three different customers, and a typo in a postcode
// only surfaced when a Nutzungsvereinbarung came back undeliverable.
//
// WHY A SUGGESTION LIST AND NOT A HARD CHECK
// ------------------------------------------
// Typing offers real addresses to pick from, and picking one fills all four
// fields at once. But the form does NOT refuse an address it cannot find. A
// geocoder's coverage is not the same thing as reality: new streets, renamed
// ones, a Hinterhaus, an address abroad, and — most often here — someone whose
// invoice address genuinely differs from anything a map knows. Refusing those
// would block real bookings to protect a data-quality goal, which is the wrong
// trade for a booking form.
//
// Instead an unmatched address is accepted only after the person ticks
// "Adresse trotzdem so übernehmen". That is the override asked for: the
// suggestion list is the easy path, the tick is the deliberate one, and the
// booking is never lost either way.
//
// PROVIDER
// --------
// Photon (photon.komoot.io), an OpenStreetMap-based geocoder that is free for
// this kind of use and needs no key — the same data behind the map the old
// widget drew. Requests go through /api/address-search rather than straight
// from the browser, so the visitor's IP is never handed to a third party and
// the lookup is rate-limited with everything else. If it is ever unreachable
// the field degrades to plain text with the override already available, so a
// dead geocoder cannot stop a booking.

import { useEffect, useRef, useState } from 'react';

export interface AddressValue {
  street: string;
  house: string;
  zip: string;
  city: string;
}

interface Suggestion extends AddressValue {
  /** One line, as offered in the list. */
  label: string;
}

export function AddressFields({
  initial,
  lang = 'de',
  onChange,
  required = false,
}: {
  initial: AddressValue;
  lang?: 'de' | 'en';
  /**
   * Supplied by a parent that keeps its own copy of the form (the public
   * wizard submits as JSON, not as a form POST). Without it the component is
   * self-contained and the named inputs below are what the server reads.
   */
  onChange?: (value: AddressValue, verified: 'geocoded' | 'manual' | '') => void;
  required?: boolean;
}) {
  const t =
    lang === 'en'
      ? {
          street: 'Street',
          house: 'No.',
          zip: 'Postcode',
          city: 'Town',
          search: 'Search address',
          hint: 'Start typing and pick your address from the list.',
          none: 'No match found.',
          override: 'Use this address anyway',
          overrideHint:
            'Tick this if your address is correct but not in the list — a new street, a rear building, or an address abroad.',
          unresolved: 'Please pick an address from the list, or tick the box below.',
          failed: 'Address lookup is unavailable right now — please type the address and tick the box below.',
        }
      : {
          street: 'Straße',
          house: 'Nr.',
          zip: 'PLZ',
          city: 'Ort',
          search: 'Adresse suchen',
          hint: 'Tippen und die Adresse aus der Liste wählen.',
          none: 'Keine passende Adresse gefunden.',
          override: 'Adresse trotzdem so übernehmen',
          overrideHint:
            'Bitte ankreuzen, wenn die Adresse stimmt, aber nicht in der Liste steht — neue Straße, Hinterhaus oder Adresse im Ausland.',
          unresolved: 'Bitte eine Adresse aus der Liste wählen oder unten das Häkchen setzen.',
          failed: 'Die Adresssuche ist gerade nicht erreichbar — bitte die Adresse eintippen und unten das Häkchen setzen.',
        };

  const [query, setQuery] = useState('');
  const [value, setValue] = useState<AddressValue>(initial);
  const [suggestions, setSuggestions] = useState<Suggestion[]>([]);
  const [searching, setSearching] = useState(false);
  const [failed, setFailed] = useState(false);
  const [confirmed, setConfirmed] = useState(
    // An address handed back after a rejected submit was already good enough.
    Boolean(initial.street && initial.zip && initial.city),
  );
  const [override, setOverride] = useState(false);
  const abortRef = useRef<AbortController | null>(null);

  useEffect(() => {
    const q = query.trim();
    if (q.length < 4) {
      setSuggestions([]);
      return;
    }

    // Debounced: a keystroke is not a search. 300ms is long enough that
    // ordinary typing produces one request per pause, not one per letter.
    const timer = setTimeout(async () => {
      abortRef.current?.abort();
      const controller = new AbortController();
      abortRef.current = controller;
      setSearching(true);
      try {
        const res = await fetch(`/api/address-search?q=${encodeURIComponent(q)}`, {
          signal: controller.signal,
        });
        if (!res.ok) throw new Error(String(res.status));
        const body = (await res.json()) as { results?: Suggestion[] };
        setSuggestions(body.results ?? []);
        setFailed(false);
      } catch (err) {
        if ((err as Error).name === 'AbortError') return;
        setSuggestions([]);
        setFailed(true);
      } finally {
        setSearching(false);
      }
    }, 300);

    return () => clearTimeout(timer);
  }, [query]);

  function choose(s: Suggestion) {
    const next = { street: s.street, house: s.house, zip: s.zip, city: s.city };
    setValue(next);
    setQuery('');
    setSuggestions([]);
    setConfirmed(true);
    setOverride(false);
    onChange?.(next, 'geocoded');
  }

  function edit(field: keyof AddressValue, v: string) {
    const next = { ...value, [field]: v };
    setValue(next);
    // Hand-editing a chosen address makes it un-chosen again: the whole point
    // is that what is stored was either matched or deliberately overridden.
    setConfirmed(false);
    onChange?.(next, override ? 'manual' : '');
  }

  const needsOverride = !confirmed && !override;
  const hasAnything = Boolean(value.street || value.zip || value.city);

  return (
    <>
      <label className="col-12">
        {t.search}
        <input
          type="text"
          value={query}
          autoComplete="off"
          placeholder="z. B. Bergholzstraße 8, 12099 Berlin"
          onChange={(e) => setQuery(e.target.value)}
        />
        <span className="muted small">{failed ? t.failed : t.hint}</span>
      </label>

      {(searching || suggestions.length > 0 || (query.trim().length >= 4 && !failed && !searching)) && (
        <div className="col-12">
          {searching && <p className="muted small">…</p>}
          {!searching && suggestions.length === 0 && query.trim().length >= 4 && !failed && (
            <p className="muted small">{t.none}</p>
          )}
          {suggestions.length > 0 && (
            <ul className="addrlist">
              {suggestions.map((s, i) => (
                <li key={`${s.label}-${i}`}>
                  <button type="button" onClick={() => choose(s)}>
                    {s.label}
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}

      <label className="col-9">
        {t.street}
        <input
          type="text"
          name="street"
          required={required}
          value={value.street}
          onChange={(e) => edit('street', e.target.value)}
        />
      </label>
      <label className="col-3">
        {t.house}
        <input
          type="text"
          name="house"
          required={required}
          value={value.house}
          onChange={(e) => edit('house', e.target.value)}
        />
      </label>
      <label className="col-3">
        {t.zip}
        <input
          type="text"
          name="zip"
          inputMode="numeric"
          value={value.zip}
          onChange={(e) => edit('zip', e.target.value)}
        />
      </label>
      <label className="col-9">
        {t.city}
        <input
          type="text"
          name="city"
          required={required}
          value={value.city}
          onChange={(e) => edit('city', e.target.value)}
        />
      </label>

      {hasAnything && needsOverride && (
        <div className="col-12">
          <div className="notice" style={{ margin: 0 }}>
            <p className="small" style={{ marginBottom: 8 }}>
              {t.unresolved}
            </p>
            <label style={{ fontWeight: 400, color: 'var(--fg)', marginBottom: 4 }}>
              <input
                type="checkbox"
                checked={override}
                onChange={(e) => {
                  setOverride(e.target.checked);
                  onChange?.(value, e.target.checked ? 'manual' : '');
                }}
                style={{ width: 'auto', display: 'inline', marginRight: 8 }}
              />
              {t.override}
            </label>
            <p className="muted small" style={{ margin: 0 }}>
              {t.overrideHint}
            </p>
          </div>
        </div>
      )}

      {/* Recorded with the booking: whether this address came from the
          geocoder or was entered by hand. Staff chasing an undeliverable
          letter want to know which. */}
      <input
        type="hidden"
        name="address_verified"
        value={confirmed ? 'geocoded' : override ? 'manual' : ''}
      />
    </>
  );
}
