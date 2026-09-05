// Special events (backlog: admin-entered public blocks) and their categories.
//
// A "category" is a `projects` row — the table already modelled exactly this
// (name, colour, a public link) for the Frauenprojekt/Frauengefängnis blocks;
// this page just makes it possible to add more of them and to attach ad-hoc
// one-off events to them, not only recurring project blocks. An event with
// `is_public` shows up in /widget/events and on the public /book calendar
// (kind='project' in public_availability); without it, it is an ordinary
// internal closure (maintenance, training) — the same form handles both.

import { cookies } from 'next/headers';
import { serverClient } from '@/lib/supabase';
import { getSessionUser, canManageEvents, canManageCategories, actionableLocationIds, mayActOnLocation } from '@/lib/auth';
import type { Location, ProjectRow, BlockRow, BlockKind } from '@/lib/db-types';
import { saveCategory, deleteCategory, saveEvent, deleteEvent } from './actions';

export const dynamic = 'force-dynamic';

const KIND_LABEL: Record<BlockKind, string> = {
  project: 'Projekt',
  maintenance: 'Wartung',
  training: 'Schulung',
  other: 'Sonstiges',
};

function toLocalInput(iso: string): string {
  // Berlin-local "YYYY-MM-DDTHH:mm" for a <input type=datetime-local>, built
  // with Intl rather than the UTC-based ISO slice so this is correct
  // regardless of what timezone the rendering server process happens to run
  // in (it's TZ=Europe/Berlin today, but this doesn't need to assume that).
  const parts = new Intl.DateTimeFormat('sv-SE', {
    timeZone: 'Europe/Berlin',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    hourCycle: 'h23',
  }).formatToParts(new Date(iso));
  const get = (t: string) => parts.find((p) => p.type === t)?.value;
  return `${get('year')}-${get('month')}-${get('day')}T${get('hour')}:${get('minute')}`;
}

export default async function EventsPage() {
  const me = await getSessionUser();
  const auth = me?.auth;

  if (!canManageEvents(auth)) {
    return (
      <>
        <h1>Termine & Kategorien</h1>
        <div className="notice">
          Termine und Kategorien verwalten können Administration und Standortleitung.
        </div>
      </>
    );
  }

  const supabase = serverClient(await cookies());
  const [{ data: locData }, { data: projectData, error: projectError }, { data: blockData, error: blockError }] =
    await Promise.all([
      supabase.from('locations').select('*').eq('is_active', true).order('sort_order'),
      supabase.from('projects').select('*').order('sort_order').order('name'),
      supabase
        .from('blocks')
        .select('*')
        .order('starts_at', { ascending: false })
        .limit(200),
    ]);

  if (projectError || blockError) {
    return (
      <>
        <h1>Termine & Kategorien</h1>
        <div className="notice">Konnte Daten nicht laden: {(projectError ?? blockError)?.message}</div>
      </>
    );
  }

  const allowed = await actionableLocationIds(me);
  const allLocations = (locData ?? []) as Location[];
  const myLocations = allLocations.filter((l) => mayActOnLocation(allowed, l.id));
  const categories = (projectData ?? []) as ProjectRow[];
  const events = (blockData ?? []) as BlockRow[];
  const locationById = new Map(allLocations.map((l) => [l.id, l]));
  const categoryById = new Map(categories.map((c) => [c.id, c]));

  return (
    <>
      <h1>Termine & Kategorien</h1>

      {canManageCategories(auth) && (
        <>
          <h2>Kategorien</h2>
          <p className="muted small">
            Eine Kategorie gibt vorbelegte Farbe/Beschreibung/Link vor, die ein einzelner Termin
            überschreiben kann.
          </p>
          {categories.map((c) => (
            <form action={saveCategory} key={c.id} className="panel">
              <input type="hidden" name="id" value={c.id} />
              <div className="grid-2">
                <label>
                  Code
                  <input type="text" name="code" defaultValue={c.code} required />
                </label>
                <label>
                  Name
                  <input type="text" name="name" defaultValue={c.name} required />
                </label>
                <label>
                  Farbe
                  <input type="color" name="color" defaultValue={c.color ?? '#0b7a3b'} style={{ width: 80 }} />
                </label>
                <label>
                  Öffentlicher Titel (optional)
                  <input type="text" name="public_title" defaultValue={c.public_title ?? ''} />
                </label>
                <label>
                  Standard-Link (optional)
                  <input type="url" name="public_link" defaultValue={c.public_link ?? ''} />
                </label>
              </div>
              <label>
                Standard-Beschreibung fürs Popup (optional)
                <textarea name="public_description" rows={2} defaultValue={c.public_description ?? ''} />
              </label>
              <div className="row">
                <button type="submit" className="secondary">
                  Speichern
                </button>
                <button type="submit" formAction={deleteCategory} className="danger">
                  Löschen
                </button>
              </div>
            </form>
          ))}

          <form action={saveCategory} className="panel">
            <h3 style={{ marginTop: 0 }}>Neue Kategorie</h3>
            <div className="grid-2">
              <label>
                Code
                <input type="text" name="code" placeholder="z. B. sommerfest" required />
              </label>
              <label>
                Name
                <input type="text" name="name" placeholder="z. B. Sommerfest" required />
              </label>
              <label>
                Farbe
                <input type="color" name="color" defaultValue="#0b7a3b" style={{ width: 80 }} />
              </label>
              <label>
                Öffentlicher Titel (optional)
                <input type="text" name="public_title" />
              </label>
              <label>
                Standard-Link (optional)
                <input type="url" name="public_link" />
              </label>
            </div>
            <label>
              Standard-Beschreibung fürs Popup (optional)
              <textarea name="public_description" rows={2} />
            </label>
            <button type="submit">Kategorie anlegen</button>
          </form>
        </>
      )}

      <h2>Termine</h2>
      <p className="muted small">
        „Öffentlich sichtbar" zeigt den Termin im <code>/widget/events</code>-Widget und im
        öffentlichen Kalender (<code>/book</code>); ohne Haken ist er nur eine interne Sperrung
        (Wartung o. ä.).
      </p>

      {events.map((b) => {
        const loc = locationById.get(b.location_id);
        return (
          <form action={saveEvent} key={b.id} className="panel">
            <input type="hidden" name="id" value={b.id} />
            <div className="grid-2">
              <label>
                Standort
                <select name="location_id" defaultValue={b.location_id} required>
                  {myLocations.map((l) => (
                    <option key={l.id} value={l.id}>
                      {l.name}
                    </option>
                  ))}
                  {loc && !myLocations.some((l) => l.id === loc.id) && (
                    <option value={loc.id}>{loc.name}</option>
                  )}
                </select>
              </label>
              <label>
                Kategorie (optional)
                <select name="project_id" defaultValue={b.project_id ?? ''}>
                  <option value="">Keine</option>
                  {categories.map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.name}
                    </option>
                  ))}
                </select>
              </label>
              <label>
                Von
                <input type="datetime-local" name="starts_at" defaultValue={toLocalInput(b.starts_at)} required />
              </label>
              <label>
                Bis
                <input type="datetime-local" name="ends_at" defaultValue={toLocalInput(b.ends_at)} required />
              </label>
              <label>
                Interner Titel
                <input type="text" name="title" defaultValue={b.title ?? ''} />
              </label>
              <label>
                Art
                <select name="kind" defaultValue={b.kind}>
                  {Object.entries(KIND_LABEL).map(([k, label]) => (
                    <option key={k} value={k}>
                      {label}
                    </option>
                  ))}
                </select>
              </label>
            </div>

            <label style={{ fontWeight: 400, color: 'var(--fg)' }}>
              <input
                type="checkbox"
                name="is_public"
                defaultChecked={b.is_public}
                style={{ width: 'auto', display: 'inline', marginRight: 8 }}
              />
              Öffentlich sichtbar
            </label>

            <div className="grid-2">
              <label>
                Öffentlicher Titel (überschreibt Kategorie)
                <input type="text" name="public_title" defaultValue={b.public_title ?? ''} />
              </label>
              <label>
                Link (überschreibt Kategorie)
                <input type="url" name="public_link" defaultValue={b.public_link ?? ''} />
              </label>
              <label>
                Farbe (überschreibt Kategorie)
                <input type="color" name="color" defaultValue={b.color ?? categoryById.get(b.project_id ?? '')?.color ?? '#0b7a3b'} style={{ width: 80 }} />
              </label>
            </div>
            <label>
              Popup-Beschreibung (überschreibt Kategorie)
              <textarea name="public_description" rows={2} defaultValue={b.public_description ?? ''} />
            </label>

            <div className="row">
              <button type="submit" className="secondary">
                Speichern
              </button>
              <button type="submit" formAction={deleteEvent} className="danger">
                Löschen
              </button>
            </div>
          </form>
        );
      })}

      <form action={saveEvent} className="panel">
        <h3 style={{ marginTop: 0 }}>Neuer Termin</h3>
        <div className="grid-2">
          <label>
            Standort
            <select name="location_id" required>
              {myLocations.map((l) => (
                <option key={l.id} value={l.id}>
                  {l.name}
                </option>
              ))}
            </select>
          </label>
          <label>
            Kategorie (optional)
            <select name="project_id" defaultValue="">
              <option value="">Keine</option>
              {categories.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                </option>
              ))}
            </select>
          </label>
          <label>
            Von
            <input type="datetime-local" name="starts_at" required />
          </label>
          <label>
            Bis
            <input type="datetime-local" name="ends_at" required />
          </label>
          <label>
            Interner Titel
            <input type="text" name="title" />
          </label>
          <label>
            Art
            <select name="kind" defaultValue="other">
              {Object.entries(KIND_LABEL).map(([k, label]) => (
                <option key={k} value={k}>
                  {label}
                </option>
              ))}
            </select>
          </label>
        </div>
        <label style={{ fontWeight: 400, color: 'var(--fg)' }}>
          <input
            type="checkbox"
            name="is_public"
            style={{ width: 'auto', display: 'inline', marginRight: 8 }}
          />
          Öffentlich sichtbar
        </label>
        <div className="grid-2">
          <label>
            Öffentlicher Titel (überschreibt Kategorie)
            <input type="text" name="public_title" />
          </label>
          <label>
            Link (überschreibt Kategorie)
            <input type="url" name="public_link" />
          </label>
          <label>
            Farbe (überschreibt Kategorie)
            <input type="color" name="color" defaultValue="#0b7a3b" style={{ width: 80 }} />
          </label>
        </div>
        <label>
          Popup-Beschreibung (überschreibt Kategorie)
          <textarea name="public_description" rows={2} />
        </label>
        <button type="submit">Termin anlegen</button>
      </form>
    </>
  );
}
