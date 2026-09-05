'use client';

// A date field that is German wherever it runs.
//
// `<input type="date">` renders in the BROWSER's locale and there is no
// attribute that changes it — `lang="de"` is honoured by Firefox and ignored by
// Chrome, which is why the form still showed "09 / 22 / 2026" after the first
// attempt at this. The only reliable fix is to stop using the native control
// for display.
//
// So this is a text input that shows and accepts TT.MM.JJJJ, dots inserted as
// you type, and it keeps the ISO value the rest of the app works in ("2026-09-22")
// in a hidden field. Two-digit years are accepted and expanded, because people
// type 22.09.26.
//
// The native picker is not lost: a calendar button opens a real
// `<input type="date">` sitting invisibly on top of it. That control still
// renders in the browser's locale, but it is a picker someone opens
// deliberately, not the thing they read the date from.

import { useEffect, useRef, useState } from 'react';

/** "2026-09-22" → "22.09.2026" */
function isoToGerman(iso: string): string {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(iso);
  return m ? `${m[3]}.${m[2]}.${m[1]}` : '';
}

/**
 * "22.09.2026" / "22.9.26" / "22092026" → "2026-09-22", or "" if it is not a
 * real date. Rejects 31.02 rather than rolling it into March, which is what a
 * bare Date constructor would do.
 */
function germanToIso(text: string): string {
  const digits = text.replace(/\D/g, '');
  let d: number, mo: number, y: number;

  if (digits.length === 8) {
    d = Number(digits.slice(0, 2));
    mo = Number(digits.slice(2, 4));
    y = Number(digits.slice(4, 8));
  } else if (digits.length === 6) {
    d = Number(digits.slice(0, 2));
    mo = Number(digits.slice(2, 4));
    y = 2000 + Number(digits.slice(4, 6));
  } else {
    const parts = text.split('.').map((p) => p.trim());
    if (parts.length !== 3) return '';
    d = Number(parts[0]);
    mo = Number(parts[1]);
    y = Number(parts[2]);
    if (y < 100) y += 2000;
  }

  if (!d || !mo || !y || mo < 1 || mo > 12 || d < 1 || d > 31) return '';
  const probe = new Date(y, mo - 1, d);
  if (probe.getFullYear() !== y || probe.getMonth() !== mo - 1 || probe.getDate() !== d) return '';
  return `${y}-${String(mo).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
}

/** Insert the dots while typing, without fighting a backspace. */
function autoFormat(raw: string): string {
  const digits = raw.replace(/\D/g, '').slice(0, 8);
  if (digits.length <= 2) return digits;
  if (digits.length <= 4) return `${digits.slice(0, 2)}.${digits.slice(2)}`;
  return `${digits.slice(0, 2)}.${digits.slice(2, 4)}.${digits.slice(4)}`;
}

export function DateField({
  value,
  onChange,
  required = false,
  id,
}: {
  /** ISO "YYYY-MM-DD". */
  value: string;
  onChange: (iso: string) => void;
  required?: boolean;
  id?: string;
}) {
  const [text, setText] = useState(() => isoToGerman(value));
  const nativeRef = useRef<HTMLInputElement>(null);

  // Follow the value when something else changes it (the other end of a range
  // snapping to this one, or a rejected submit handing values back).
  useEffect(() => {
    setText(isoToGerman(value));
  }, [value]);

  const invalid = text.length > 0 && germanToIso(text) === '';

  return (
    <span className="datefield">
      <input
        id={id}
        type="text"
        inputMode="numeric"
        autoComplete="off"
        placeholder="TT.MM.JJJJ"
        aria-invalid={invalid || undefined}
        value={text}
        required={required}
        onChange={(e) => {
          const formatted = autoFormat(e.target.value);
          setText(formatted);
          const iso = germanToIso(formatted);
          // Only report a COMPLETE date upward; half-typed input must not
          // wipe the caller's value on every keystroke.
          if (iso) onChange(iso);
        }}
        onBlur={() => {
          // Tidy "2.9.26" into "02.09.2026" once the field is left alone.
          const iso = germanToIso(text);
          if (iso) setText(isoToGerman(iso));
        }}
      />

      <button
        type="button"
        className="datefield__pick"
        aria-label="Kalender öffnen"
        onClick={() => {
          const el = nativeRef.current;
          if (!el) return;
          // showPicker is the supported way in; clicking is the fallback for
          // browsers that do not have it yet.
          if (typeof el.showPicker === 'function') el.showPicker();
          else el.click();
        }}
      >
        <span aria-hidden="true">📅</span>
      </button>

      {/* The real picker, present for the calendar button and for anyone who
          prefers a native control, but never the thing the date is READ from. */}
      <input
        ref={nativeRef}
        type="date"
        className="datefield__native"
        tabIndex={-1}
        aria-hidden="true"
        value={value}
        onChange={(e) => onChange(e.target.value)}
      />
    </span>
  );
}
