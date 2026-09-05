// Internal booking entry — the screen behind "Buchung erfassen".
//
// Everything here is plain server-rendered HTML with two forms: a GET form that
// picks the location and tariff, and the POST form that creates the booking.
// That is why the extras list can be built from the selected location's tariff
// without a line of client JavaScript: changing the location reloads the page
// with the right extras, prices and closing hour already in it.

import Link from 'next/link';
import { cookies } from 'next/headers';
import { serverClient } from '@/lib/supabase';
import {
  getSessionUser,
  canApprove,
  actionableLocationIds,
  mayActOnLocation,
} from '@/lib/auth';
import { loadTariffConfig } from '@/lib/booking-pricing';
import { bookingErrorDe } from '@/lib/booking-errors';
import type { Location, TariffType } from '@/lib/db-types';
import { createInternalBooking } from './actions';
import { BookingComposer, type ComposerExtra } from './BookingComposer';
import { AddressFields } from '../../../AddressFields';
import { SALUTATIONS } from '@/lib/salutations';

export const dynamic = 'force-dynamic';

const TARIFF_LABEL: Record<TariffType, string> = {
  standard: 'Standard',
  kita_schule: 'Kita / Schule',
  nachweis: 'Nachweis',
};

const TARIFF_TYPES: TariffType[] = ['standard', 'kita_schule', 'nachweis'];

type Params = Record<string, string | string[] | undefined>;

/** Previously entered value, handed back by the action when it rejected. */
function prev(params: Params, key: string): string {
  const v = params[key];
  return typeof v === 'string' ? v : '';
}

function prevList(params: Params, key: string): string[] {
  const v = params[key];
  if (Array.isArray(v)) return v;
  return typeof v === 'string' ? [v] : [];
}

export default async function NewBookingPage({
  searchParams,
}: {
  searchParams: Promise<Params>;
}) {
  const params = await searchParams;
  const me = await getSessionUser();
  const auth = me?.auth;

  if (!canApprove(auth)) {
    return (
      <>
        <h1>Buchung erfassen</h1>
        <div className="notice">
          Buchungen anlegen können Administratorinnen und Standortleitungen.
        </div>
      </>
    );
  }

  const supabase = serverClient(await cookies());
  const { data: locData, error } = await supabase
    .from('locations')
    .select('*')
    .eq('is_active', true)
    .order('sort_order');

  if (error) {
    return (
      <>
        <h1>Buchung erfassen</h1>
        <div className="notice">Konnte Standorte nicht laden: {error.message}</div>
      </>
    );
  }

  // The same scoping the action applies, so nobody is offered a location their
  // booking would then be refused for.
  const allowed = await actionableLocationIds(me);
  const locations = ((locData ?? []) as Location[]).filter((l) =>
    mayActOnLocation(allowed, l.id),
  );

  if (locations.length === 0) {
    return (
      <>
        <h1>Buchung erfassen</h1>
        <div className="notice">
          Diesem Konto ist noch kein Standort zugeordnet. Eine Administratorin kann
          das unter „Benutzer“ ändern.
        </div>
      </>
    );
  }

  const wanted = prev(params, 'school').toUpperCase();
  const location = locations.find((l) => l.code === wanted) ?? locations[0];

  const wantedTariff = prev(params, 'tariff_type') as TariffType;
  const tariffType: TariffType = TARIFF_TYPES.includes(wantedTariff)
    ? wantedTariff
    : 'standard';

  // A location may simply not have this tariff configured — that is a normal
  // state (only WE prices bikes, WI has no Nachweis tariff), so it is reported
  // in place rather than thrown.
  let config = null;
  let configError: string | null = null;
  try {
    config = await loadTariffConfig(location.id, tariffType);
  } catch (err) {
    configError = (err as Error).message;
  }

  const errorCode = prev(params, 'error');

  // Flattened for the client component, which must not import the pricing
  // package's own union type just to render a checkbox.
  const extrasCatalogue: ComposerExtra[] = (config?.extras ?? []).map((x) =>
    x.type === 'quantity'
      ? {
          id: x.id,
          type: 'quantity' as const,
          labelDe: x.labelDe,
          pricePerUnit: x.pricePerUnit,
          min: x.min,
          max: x.max,
        }
      : { id: x.id, type: 'toggle' as const, labelDe: x.labelDe, price: x.price },
  );
  // On a fresh form the notification is on; on a rejected retry, whatever the
  // person had chosen before is what comes back.
  const notifyDefault = errorCode ? params.notify !== undefined : true;

  return (
    <>
      <p className="small">
        <Link href="/admin/bookings">← Alle Buchungen</Link>
      </p>
      <h1>Buchung erfassen</h1>
      <p className="muted">
        Für telefonische Anfragen und für Standorte ohne Online-Buchung. Die
        Vorlauffrist von {location.min_lead_days} Tagen gilt hier nicht — Belegung,
        Mindestdauer und Schließzeit werden weiterhin geprüft.
      </p>

      {errorCode && <div className="notice">{bookingErrorDe(errorCode)}</div>}

      {/* Location + tariff picker. A GET form, so it works without JS and the
          chosen location ends up in the URL — reloadable and linkable. */}
      <form method="get" className="panel">
        <div className="row">
          <label style={{ marginBottom: 0 }}>
            Standort
            <select name="school" defaultValue={location.code}>
              {locations.map((l) => (
                <option key={l.id} value={l.code}>
                  {l.name} ({l.code})
                </option>
              ))}
            </select>
          </label>
          <label style={{ marginBottom: 0 }}>
            Tarif
            <select name="tariff_type" defaultValue={tariffType}>
              {TARIFF_TYPES.map((t) => (
                <option key={t} value={t}>
                  {TARIFF_LABEL[t]}
                </option>
              ))}
            </select>
          </label>
          <button type="submit" className="secondary" style={{ alignSelf: 'flex-end' }}>
            Übernehmen
          </button>
        </div>
        <p className="muted small" style={{ marginBottom: 0, marginTop: 8 }}>
          {location.online_bookability === 'online'
            ? 'Online buchbar'
            : location.online_bookability === 'phone_only'
              ? 'Nur telefonisch buchbar — Online-Anfragen sind hier nicht möglich.'
              : 'Aktuell nicht buchbar.'}
          {location.closing_hour !== null && ` · Schließzeit ${location.closing_hour}:00 Uhr`}
          {` · Mindestdauer ${location.min_duration_minutes} Minuten`}
        </p>
      </form>

      {configError && (
        <div className="notice">
          Kein gültiger Tarif „{TARIFF_LABEL[tariffType]}“ für {location.name}:{' '}
          {configError}
        </div>
      )}

      {prev(params, 'error') === 'slot_taken' && (
        <div className="notice" style={{ background: '#fff8e6', border: '1px solid #e6a700', color: '#16181a', marginBottom: 16 }}>
          <strong style={{ color: '#b36b00' }}>⚠️ Achtung: Terminüberschneidung / Doppelbelegung</strong>
          <p style={{ margin: '4px 0 0' }}>
            Für diesen Zeitraum liegt an diesem Standort bereits eine andere Buchung oder Sperre vor.
            Wenn Sie die Doppelbelegung / Überbuchung ausdrücklich vornehmen möchten, aktivieren Sie bitte unten im Bereich „Anlegen“ die Bestätigung.
          </p>
        </div>
      )}

      {prev(params, 'error') && prev(params, 'error') !== 'slot_taken' && (
        <div className="notice">
          {bookingErrorDe(prev(params, 'error'))}
        </div>
      )}

      <form action={createInternalBooking}>
        {/* Repeated as hidden fields: the picker above is a separate form, so
            its values are not part of this submission. */}
        <input type="hidden" name="school" value={location.code} />
        <input type="hidden" name="tariff_type" value={tariffType} />

        <BookingComposer
          tariffConfig={config}
          extrasCatalogue={extrasCatalogue}
          initial={{
            from: prev(params, 'from'),
            to: prev(params, 'to'),
            persons: prev(params, 'persons'),
            eventType: prev(params, 'event_type'),
            extras: prevList(params, 'extras'),
          }}
        />

        {config?.bikePricePerUnit != null && (
          <div className="panel">
            <h2 style={{ marginTop: 0 }}>Kinderfahrräder</h2>
            <label className="col-4">
              Anzahl (je {config.bikePricePerUnit.toFixed(2)} €)
              <input type="number" name="bikes" min={0} defaultValue={prev(params, 'bikes')} />
            </label>
          </div>
        )}

        <div className="panel">
          <h2 style={{ marginTop: 0 }}>Kontakt</h2>
          {/* Widths follow the content: a house number is not as wide as a
              street, and a first name sits beside its surname rather than on
              the next row. See .formgrid in globals.css. */}
          <div className="formgrid">
            <label className="col-3">
              Anrede
              <select name="salutation" defaultValue={prev(params, 'salutation')}>
                <option value="">—</option>
                {SALUTATIONS.map((sal) => (
                  <option key={sal} value={sal}>
                    {sal}
                  </option>
                ))}
              </select>
            </label>
            <label className="col-4">
              Vorname
              <input type="text" name="first_name" defaultValue={prev(params, 'first_name')} />
            </label>
            <label className="col-5">
              Nachname
              <input type="text" name="last_name" defaultValue={prev(params, 'last_name')} />
            </label>

            <label className="col-12">
              Einrichtung / Organisation
              <input type="text" name="organization" defaultValue={prev(params, 'organization')} />
            </label>

            <label className="col-7">
              E-Mail
              <input type="email" name="email" defaultValue={prev(params, 'email')} />
            </label>
            <label className="col-5">
              Telefon
              <input type="tel" name="phone" defaultValue={prev(params, 'phone')} />
            </label>

            <AddressFields
              initial={{
                street: prev(params, 'street'),
                house: prev(params, 'house'),
                zip: prev(params, 'zip'),
                city: prev(params, 'city'),
              }}
            />

            <label className="col-5">
              Sprache der Korrespondenz
              <select name="lang" defaultValue={prev(params, 'lang') || 'de'}>
                <option value="de">Deutsch</option>
                <option value="en">English</option>
              </select>
            </label>
          </div>
          <p className="muted small" style={{ marginBottom: 0 }}>
            Ohne E-Mail-Adresse geht keine Bestätigung raus — für eine reine
            Telefonbuchung ist das in Ordnung. Die Sprache steuert auch, in welcher
            Fassung die Nutzungsvereinbarung erzeugt wird.
          </p>
        </div>

        <div className="panel">
          <h2 style={{ marginTop: 0 }}>Notizen</h2>
          <label>
            Nachricht der anfragenden Person
            <textarea name="message" rows={3} defaultValue={prev(params, 'message')} />
          </label>
          <label>
            Interne Notiz (nur intern sichtbar)
            <textarea
              name="internal_notes"
              rows={2}
              defaultValue={prev(params, 'internal_notes')}
            />
          </label>
        </div>

        <div className="panel">
          <h2 style={{ marginTop: 0 }}>Anlegen</h2>
          <label style={{ fontWeight: 400, color: 'var(--fg)' }}>
            <input
              type="checkbox"
              name="approve"
              defaultChecked={params.approve !== undefined}
              style={{ width: 'auto', display: 'inline', marginRight: 8 }}
            />
            Direkt bestätigen (statt nur als Anfrage anlegen)
          </label>
          <label style={{ fontWeight: 400, color: 'var(--fg)' }}>
            <input
              type="checkbox"
              name="notify"
              defaultChecked={notifyDefault}
              style={{ width: 'auto', display: 'inline', marginRight: 8 }}
            />
            E-Mail an die anfragende Person schicken
          </label>
          {prev(params, 'error') === 'slot_taken' && (
            <label style={{ fontWeight: 600, color: '#b36b00', marginTop: 8, display: 'block' }}>
              <input
                type="checkbox"
                name="allow_overlap"
                defaultChecked={params.allow_overlap !== undefined}
                style={{ width: 'auto', display: 'inline', marginRight: 8 }}
              />
              Doppelbelegung / Überbuchung ausdrücklich erlauben
            </label>
          )}
          <button type="submit" style={{ marginTop: 12 }} disabled={!config}>
            Buchung anlegen
          </button>
          <p className="muted small" style={{ marginBottom: 0 }}>
            Der Preis wird beim Speichern serverseitig berechnet und ist danach auf
            der Buchungsseite zu sehen.
          </p>
        </div>
      </form>
    </>
  );
}
