'use client';

// Writing a Kundenvermerk.
//
// The fields it matches on — surname, first name, email, phone, organisation —
// were all typed by hand, which is how a note ends up filed under a spelling
// that never matches the booking it was about. So the form starts from a
// BOOKING: pick the event, and everything the note matches on is filled in
// from the customer record it already has, along with a link back to it.
//
// A past booking is the ordinary case, so those are listed first. A future one
// is allowed — a group can behave badly at the door, or a deposit can bounce
// before the day — but it is called out, because filing a verdict on an event
// that has not happened is nearly always a mis-click.
//
// Typing by hand still works, for the phone call about somebody who has never
// booked. The picker fills the fields; it does not lock them.

import { useMemo, useState } from 'react';
import { SALUTATIONS } from '@/lib/salutations';

export interface PickableBooking {
  id: string;
  startsAt: string;
  endsAt: string;
  locationCode: string;
  eventType: string | null;
  status: string;
  firstName: string | null;
  lastName: string | null;
  email: string | null;
  phone: string | null;
  organization: string | null;
}

const dateFmt = new Intl.DateTimeFormat('de-DE', {
  day: '2-digit',
  month: '2-digit',
  year: 'numeric',
  timeZone: 'Europe/Berlin',
});

function personLabel(b: PickableBooking): string {
  return (
    [b.firstName, b.lastName].filter(Boolean).join(' ') ||
    b.organization ||
    b.email ||
    '—'
  );
}

export function VermerkForm({ bookings }: { bookings: PickableBooking[] }) {
  const [search, setSearch] = useState('');
  const [picked, setPicked] = useState<PickableBooking | null>(null);

  // Hand-editable, and pre-filled by the picker rather than bound to it.
  const [lastName, setLastName] = useState('');
  const [firstName, setFirstName] = useState('');
  const [email, setEmail] = useState('');
  const [phone, setPhone] = useState('');
  const [organization, setOrganization] = useState('');
  const [altNames, setAltNames] = useState<string[]>([]);
  const [altDraft, setAltDraft] = useState('');

  const now = Date.now();

  const matches = useMemo(() => {
    const term = search.trim().toLowerCase();
    if (!term) return bookings.slice(0, 8);
    return bookings
      .filter((b) => {
        const hay = [
          b.firstName,
          b.lastName,
          b.organization,
          b.email,
          b.eventType,
          b.locationCode,
          dateFmt.format(new Date(b.startsAt)),
        ]
          .filter(Boolean)
          .join(' ')
          .toLowerCase();
        return hay.includes(term);
      })
      .slice(0, 8);
  }, [bookings, search]);

  function pick(b: PickableBooking) {
    setPicked(b);
    setSearch('');
    setLastName(b.lastName ?? '');
    setFirstName(b.firstName ?? '');
    setEmail(b.email ?? '');
    setPhone(b.phone ?? '');
    setOrganization(b.organization ?? '');
  }

  function clearPick() {
    setPicked(null);
  }

  function addAlt() {
    const v = altDraft.trim();
    if (!v || altNames.includes(v)) {
      setAltDraft('');
      return;
    }
    setAltNames((p) => [...p, v]);
    setAltDraft('');
  }

  const pickedIsFuture = picked ? new Date(picked.startsAt).getTime() > now : false;

  return (
    <>
      {/* --- pick the event this is about ---------------------------------- */}
      <div className="panel panel--inset">
        <h3 style={{ marginTop: 0 }}>Vermerk zu einer Buchung</h3>

        {picked ? (
          <div className="row" style={{ justifyContent: 'space-between', alignItems: 'flex-start' }}>
            <div>
              <strong>
                {dateFmt.format(new Date(picked.startsAt))} · {picked.locationCode} ·{' '}
                {picked.eventType || 'Veranstaltung'}
              </strong>
              <p className="muted small" style={{ margin: '2px 0 0' }}>
                {personLabel(picked)}
                {picked.email ? ` · ${picked.email}` : ''}
              </p>
            </div>
            <button type="button" className="secondary" onClick={clearPick}>
              Andere Buchung
            </button>
          </div>
        ) : (
          <>
            <label style={{ marginBottom: 0 }}>
              Buchung suchen
              <input
                type="search"
                value={search}
                placeholder="Name, Einrichtung, Datum oder Standort"
                onChange={(e) => setSearch(e.target.value)}
              />
              <span className="muted small">
                Vergangene Buchungen zuerst. Die Kontaktdaten werden dann automatisch
                übernommen — oder unten von Hand eintragen, wenn es um jemanden geht,
                der noch nie gebucht hat.
              </span>
            </label>

            {matches.length > 0 && (
              <ul className="addrlist" style={{ marginTop: 'var(--s3)' }}>
                {matches.map((b) => {
                  const future = new Date(b.startsAt).getTime() > now;
                  return (
                    <li key={b.id}>
                      <button type="button" onClick={() => pick(b)}>
                        <strong>{dateFmt.format(new Date(b.startsAt))}</strong> · {b.locationCode} ·{' '}
                        {personLabel(b)}
                        {b.eventType ? ` · ${b.eventType}` : ''}
                        {future && (
                          <span className="badge badge--warn" style={{ marginLeft: 8 }}>
                            künftig
                          </span>
                        )}
                      </button>
                    </li>
                  );
                })}
              </ul>
            )}
            {search.trim() && matches.length === 0 && (
              <p className="muted small" style={{ marginTop: 'var(--s3)' }}>
                Keine passende Buchung gefunden.
              </p>
            )}
          </>
        )}

        {pickedIsFuture && (
          <div className="notice notice--warn" style={{ marginBottom: 0 }}>
            <strong>Diese Veranstaltung liegt noch in der Zukunft.</strong> Ein Vermerk
            dazu ist möglich — etwa bei einer geplatzten Kaution oder einer Absage im
            Streit — aber bitte kurz prüfen, ob wirklich diese Buchung gemeint ist.
          </div>
        )}
      </div>

      <input type="hidden" name="booking_id" value={picked?.id ?? ''} />

      {/* --- the note itself ----------------------------------------------- */}
      <div className="formgrid" style={{ marginTop: 'var(--s4)' }}>
        <label className="col-5">
          Bewertung / Status *
          <select name="rating" defaultValue="negative" required>
            <option value="do_not_rent">⛔ SPERRE (Do-Not-Rent / Nicht vermieten)</option>
            <option value="negative">⚠️ Negative Vorerfahrung</option>
            <option value="neutral">ℹ️ Neutraler Hinweis</option>
            <option value="positive">✨ Positive Vorerfahrung</option>
          </select>
        </label>
        <label className="col-3">
          Anrede
          <select name="match_salutation" defaultValue="">
            <option value="">—</option>
            {SALUTATIONS.map((s) => (
              <option key={s} value={s}>
                {s}
              </option>
            ))}
          </select>
        </label>
        <label className="col-4">
          Vorname
          <input
            type="text"
            name="match_first_name"
            placeholder="z. B. Max"
            value={firstName}
            onChange={(e) => setFirstName(e.target.value)}
          />
        </label>

        <label className="col-6">
          Nachname *
          <input
            type="text"
            name="match_last_name"
            placeholder="z. B. Mustermann"
            value={lastName}
            onChange={(e) => setLastName(e.target.value)}
          />
        </label>
        <label className="col-6">
          Organisation / Einrichtung
          <input
            type="text"
            name="match_organization"
            placeholder="z. B. Verein XYZ"
            value={organization}
            onChange={(e) => setOrganization(e.target.value)}
          />
        </label>

        <label className="col-7">
          E-Mail
          <input
            type="email"
            name="match_email"
            placeholder="kunde@beispiel.de"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
          />
        </label>
        <label className="col-5">
          Telefon
          <input
            type="tel"
            name="match_phone"
            placeholder="0170 1234567"
            value={phone}
            onChange={(e) => setPhone(e.target.value)}
          />
        </label>

        {/* --- other names --------------------------------------------------
            A group that books as a person one year and as its Verein the next
            is the same group, and the warning has to follow it. Each name is
            posted as its own field; the action collects them into the array. */}
        <div className="col-12">
          <label style={{ marginBottom: 'var(--s2)' }}>Andere verwendete Namen</label>
          {altNames.length > 0 && (
            <ul className="chips">
              {altNames.map((n) => (
                <li key={n}>
                  <span>{n}</span>
                  <button
                    type="button"
                    aria-label={`${n} entfernen`}
                    onClick={() => setAltNames((p) => p.filter((x) => x !== n))}
                  >
                    ×
                  </button>
                  <input type="hidden" name="alt_names" value={n} />
                </li>
              ))}
            </ul>
          )}
          <div className="row" style={{ alignItems: 'stretch', marginTop: 'var(--s2)' }}>
            <input
              type="text"
              value={altDraft}
              placeholder="z. B. SV Nord e. V."
              onChange={(e) => setAltDraft(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') {
                  // Enter adds a name; it must not submit the whole form
                  // halfway through typing the list.
                  e.preventDefault();
                  addAlt();
                }
              }}
              style={{ flex: '1 1 240px' }}
            />
            <button type="button" className="secondary" onClick={addAlt}>
              Hinzufügen
            </button>
          </div>
          <span className="muted small">
            Namen, unter denen dieselbe Gruppe sonst bucht. Der Warnhinweis erscheint
            dann auch bei diesen.
          </span>
        </div>

        <label className="col-12">
          Grund / Notiz (intern) *
          <textarea
            name="note"
            rows={3}
            required
            placeholder="z. B. Kaution einbehalten wegen Ruhestörung / Schäden am Inventar…"
          />
        </label>

        <label className="col-5">
          Individueller Zuschlag / Rabatt (€, optional)
          <input
            type="number"
            name="surcharge_or_discount"
            step="0.01"
            placeholder="z. B. 50 oder -20"
          />
        </label>
      </div>

      <button type="submit" style={{ marginTop: 'var(--s4)' }}>
        Vermerk speichern
      </button>
    </>
  );
}
