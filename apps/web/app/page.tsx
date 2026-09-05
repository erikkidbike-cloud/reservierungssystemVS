// Public landing page: the three Verkehrsschulen and what is already taken.
//
// Reads `public_availability`, which carries no personal data at all — the
// view exists precisely so this page can be served to anyone.

import Link from 'next/link';
import { PublicShell } from './PublicShell';
import { adminClient } from '@/lib/supabase';
import type { AvailabilitySlot, Location } from '@/lib/db-types';

export const dynamic = 'force-dynamic';

const BOOKABILITY_LABEL: Record<string, string> = {
  online: 'Online buchbar',
  phone_only: 'Telefonisch buchbar',
  offline: 'Derzeit nicht buchbar',
};

export default async function Home() {
  let locations: Location[] = [];
  let slots: AvailabilitySlot[] = [];
  let loadError: string | null = null;

  try {
    const supabase = adminClient();
    const [locRes, availRes] = await Promise.all([
      supabase.from('locations').select('*').eq('is_active', true).order('sort_order'),
      supabase
        .from('public_availability')
        .select('*')
        .gte('starts_at', new Date().toISOString())
        .order('starts_at')
        .limit(50),
    ]);
    if (locRes.error) throw new Error(locRes.error.message);
    if (availRes.error) throw new Error(availRes.error.message);
    locations = (locRes.data ?? []) as Location[];
    slots = (availRes.data ?? []) as AvailabilitySlot[];
  } catch (err) {
    loadError = (err as Error).message;
  }

  return (
    <PublicShell>
      <div className="pagehead">
        <div className="pagehead__text">
          <h1>Verkehrsschulen Friedrichshain-Kreuzberg</h1>
          <p className="pagehead__sub">
            Fahrräder, Gokarts und Roller kostenlos nutzen, Verkehrssicherheits&shy;training
            und Übungen für den Fahrradführerschein. Für eine eigene Feier oder
            Veranstaltung können Sie einen Termin reservieren.
          </p>
        </div>
        <div className="pagehead__actions">
          <Link href="/book" className="btnlink">
            Termin anfragen
          </Link>
        </div>
      </div>

        {loadError && (
          <div className="notice">
            Datenbank nicht erreichbar ({loadError}). Umgebungsvariablen setzen —
            siehe <code>.env.example</code>.
          </div>
        )}

        <div className="cards">
          {locations.map((l) => (
            <div className="card" key={l.id}>
              <strong>{l.name}</strong>
              <p className="muted">{l.address}</p>
              <span className="badge">
                {BOOKABILITY_LABEL[l.online_bookability] ?? l.online_bookability}
              </span>
              {l.closing_hour !== null && (
                <p className="muted" style={{ marginBottom: 0 }}>
                  Schließt um {l.closing_hour}:00 Uhr
                </p>
              )}
            </div>
          ))}
        </div>

        <h2>Kommende Belegung</h2>
        {slots.length === 0 ? (
          <p className="muted">Keine kommenden Einträge.</p>
        ) : (
          <div className="table-scroll">
            <table>
              <thead>
                <tr>
                  <th>Ort</th>
                  <th>Von</th>
                  <th>Bis</th>
                  <th>Art</th>
                </tr>
              </thead>
              <tbody>
                {slots.map((s, i) => (
                  <tr key={`${s.location_code}-${s.starts_at}-${i}`}>
                    <td>{s.location_code}</td>
                    <td>{new Date(s.starts_at).toLocaleString('de-DE', { timeZone: 'Europe/Berlin' })}</td>
                    <td>{new Date(s.ends_at).toLocaleString('de-DE', { timeZone: 'Europe/Berlin' })}</td>
                    <td>
                      {s.public_title ? (
                        s.public_link ? (
                          <a href={s.public_link}>{s.public_title}</a>
                        ) : (
                          s.public_title
                        )
                      ) : (
                        <span className="badge">{s.kind === 'hold' ? 'reserviert' : 'belegt'}</span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
    </PublicShell>
  );
}
