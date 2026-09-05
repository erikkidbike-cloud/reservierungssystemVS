import Link from 'next/link';
import { notFound } from 'next/navigation';
import { cookies } from 'next/headers';
import { serverClient } from '@/lib/supabase';
import { getSessionUser, canSeeContactData, actionableLocationIds, mayActOnLocation } from '@/lib/auth';
import type { Booking, Customer, Location } from '@/lib/db-types';
import { updateBookingAndCustomer } from './actions';

export const dynamic = 'force-dynamic';

function toLocalIso(isoString: string): string {
  const d = new Date(isoString);
  // Returns 'YYYY-MM-DDTHH:mm' in local Berlin/system time
  const pad = (n: number) => String(n).padStart(2, '0');
  const year = d.getFullYear();
  const month = pad(d.getMonth() + 1);
  const day = pad(d.getDate());
  const hours = pad(d.getHours());
  const mins = pad(d.getMinutes());
  return `${year}-${month}-${day}T${hours}:${mins}`;
}

export default async function EditBookingPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const me = await getSessionUser();
  if (!me?.profile || !canSeeContactData(me.auth)) {
    return (
      <div className="notice">
        Nur Administratorinnen und Standortleitungen können Buchungen bearbeiten.
      </div>
    );
  }

  const supabase = serverClient(await cookies());
  const { data: bookingData } = await supabase
    .from('bookings')
    .select('*')
    .eq('id', id)
    .maybeSingle();

  if (!bookingData) notFound();
  const b = bookingData as Booking;

  const allowed = await actionableLocationIds();
  if (!mayActOnLocation(allowed, b.location_id)) {
    return <div className="notice">Kein Zugriff auf diesen Standort.</div>;
  }

  const [{ data: locData }, { data: custData }] = await Promise.all([
    supabase.from('locations').select('*').eq('id', b.location_id).single(),
    b.customer_id
      ? supabase.from('customers').select('*').eq('id', b.customer_id).single()
      : Promise.resolve({ data: null }),
  ]);

  const loc = locData as Location | null;
  const cust = custData as Customer | null;

  return (
    <>
      <p className="small">
        <Link href={`/admin/bookings/${id}`}>← Zurück zur Buchung</Link>
      </p>

      <h1>Buchung bearbeiten: {loc?.name}</h1>

      <form action={updateBookingAndCustomer}>
        <input type="hidden" name="booking_id" value={id} />

        <div className="panel">
          <h2 style={{ marginTop: 0 }}>Kontaktdaten der buchenden Person</h2>
          <div className="grid-2">
            <label>
              Anrede
              <input type="text" name="salutation" defaultValue={cust?.salutation ?? ''} />
            </label>
            <label>
              Organisation / Einrichtung
              <input type="text" name="organization" defaultValue={cust?.organization ?? ''} />
            </label>
            <label>
              Vorname
              <input type="text" name="first_name" defaultValue={cust?.first_name ?? ''} />
            </label>
            <label>
              Nachname
              <input type="text" name="last_name" defaultValue={cust?.last_name ?? ''} />
            </label>
            <label>
              E-Mail
              <input type="email" name="email" defaultValue={cust?.email ?? ''} />
            </label>
            <label>
              Telefon
              <input type="tel" name="phone" defaultValue={cust?.phone ?? ''} />
            </label>
            <label>
              Straße
              <input type="text" name="street" defaultValue={cust?.street ?? ''} />
            </label>
            <label>
              Hausnummer
              <input type="text" name="house_number" defaultValue={cust?.house_number ?? ''} />
            </label>
            <label>
              Postleitzahl (PLZ)
              <input type="text" name="zip" defaultValue={cust?.zip ?? ''} />
            </label>
            <label>
              Stadt / Ort
              <input type="text" name="city" defaultValue={cust?.city ?? ''} />
            </label>
          </div>
        </div>

        <div className="panel">
          <h2 style={{ marginTop: 0 }}>Veranstaltungsdaten</h2>
          <div className="grid-2">
            <label>
              Beginn
              <input type="datetime-local" name="from" defaultValue={toLocalIso(b.starts_at)} />
            </label>
            <label>
              Ende
              <input type="datetime-local" name="to" defaultValue={toLocalIso(b.ends_at)} />
            </label>
            <label>
              Personenanzahl
              <input type="number" name="persons" min={1} defaultValue={b.persons ?? ''} />
            </label>
            <label>
              Art der Veranstaltung
              <input type="text" name="event_type" defaultValue={b.event_type ?? ''} />
            </label>
          </div>

          <label>
            Nachricht der buchenden Person
            <textarea name="message" rows={2} defaultValue={b.message ?? ''} />
          </label>

          <label>
            Interne Notiz (nur für Team sichtbar)
            <textarea name="internal_notes" rows={2} defaultValue={b.internal_notes ?? ''} />
          </label>
        </div>

        <div className="row" style={{ marginTop: 16 }}>
          <button type="submit">Änderungen speichern</button>
          <Link href={`/admin/bookings/${id}`}>
            <button type="button" className="secondary">Abbrechen</button>
          </Link>
        </div>
      </form>
    </>
  );
}
