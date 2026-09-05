// Roles and their permissions.
//
// Until 0016 the five roles were an enum in the database and the answer to
// "what may this role do?" was spread across thirty-odd RLS policies. Both are
// now rows: a role is a name plus a set of ticked permissions, and every
// policy asks about permissions rather than role names. So a role invented on
// this screen is honoured everywhere, without a migration.
//
// Only holders of roles.manage reach this page — which by default means
// administrators, as the owner asked.

import { cookies } from 'next/headers';
import { serverClient } from '@/lib/supabase';
import { getSessionUser, canManageRoles } from '@/lib/auth';
import type { Role, PermissionRow, Profile } from '@/lib/db-types';
import { createRole, saveRole, deleteRole } from './actions';

export const dynamic = 'force-dynamic';

export default async function RolesPage() {
  const me = await getSessionUser();
  const auth = me?.auth;

  if (!canManageRoles(auth)) {
    return (
      <>
        <h1>Rollen</h1>
        <div className="notice">
          Rollen und Berechtigungen können nur Administratorinnen und Administratoren
          bearbeiten.
        </div>
      </>
    );
  }

  const supabase = serverClient(await cookies());
  const [{ data: roleRows, error }, { data: permRows }, { data: grantRows }, { data: profileRows }] =
    await Promise.all([
      supabase.from('roles').select('*').order('sort').order('label_de'),
      supabase.from('permissions').select('*').order('sort'),
      supabase.from('role_permissions').select('role_key, permission_key'),
      supabase.from('profiles').select('id, role').eq('is_active', true),
    ]);

  if (error) {
    return (
      <>
        <h1>Rollen</h1>
        <div className="notice">Konnte Rollen nicht laden: {error.message}</div>
      </>
    );
  }

  const roles = (roleRows ?? []) as Role[];
  const permissions = (permRows ?? []) as PermissionRow[];

  const grantedBy = new Map<string, Set<string>>();
  for (const g of (grantRows ?? []) as { role_key: string; permission_key: string }[]) {
    const set = grantedBy.get(g.role_key) ?? new Set<string>();
    set.add(g.permission_key);
    grantedBy.set(g.role_key, set);
  }

  // How many people hold each role — the number that decides whether deleting
  // it is even possible, so it belongs next to the delete button rather than
  // behind a failed attempt.
  const headcount = new Map<string, number>();
  for (const p of (profileRows ?? []) as Pick<Profile, 'id' | 'role'>[]) {
    headcount.set(p.role, (headcount.get(p.role) ?? 0) + 1);
  }

  // Group the catalogue for display; the order within a category comes from
  // the `sort` column so the migration decides it, not this file.
  const categories: { name: string; items: PermissionRow[] }[] = [];
  for (const p of permissions) {
    const last = categories[categories.length - 1];
    if (last && last.name === p.category) last.items.push(p);
    else categories.push({ name: p.category, items: [p] });
  }

  return (
    <>
      <h1>Rollen und Berechtigungen</h1>
      <p className="muted">
        Eine Rolle ist ein Name plus die Häkchen darunter. Wer eine Rolle hat, darf
        genau das — überall im System, auch in der Datenbank selbst. Neue Rollen
        wirken sofort und ohne weitere Einrichtung.
      </p>

      <div className="panel">
        <h2 className="section-title">Neue Rolle</h2>
        <form action={createRole}>
          <div className="grid-2">
            <label>
              Bezeichnung
              <input name="label_de" required placeholder="z. B. Kassenwart*in" />
            </label>
            <label>
              Schlüssel
              <input
                name="key"
                required
                pattern="[a-z][a-z0-9_]{1,38}"
                placeholder="kassenwart"
              />
              <span className="muted small">
                Kleinbuchstaben, Ziffern und Unterstriche. Steht später fest.
              </span>
            </label>
          </div>
          <label>
            Beschreibung
            <input name="description" placeholder="Wofür ist diese Rolle da?" />
          </label>
          <label style={{ fontWeight: 400 }}>
            <input
              type="checkbox"
              name="all_locations"
              style={{ width: 'auto', display: 'inline', marginRight: 8 }}
            />
            Sieht alle Standorte (sonst nur die zugewiesenen)
          </label>
          <button type="submit" style={{ marginTop: 12 }}>
            Rolle anlegen
          </button>
          <p className="muted small" style={{ marginTop: 8 }}>
            Die Berechtigungen werden danach unten gesetzt — eine neue Rolle startet
            ohne jede.
          </p>
        </form>
      </div>

      {roles.map((r) => {
        const granted = grantedBy.get(r.key) ?? new Set<string>();
        const isSuper = granted.has('system.admin');
        const people = headcount.get(r.key) ?? 0;

        return (
          <div className="panel" key={r.key}>
            <form action={saveRole}>
              <input type="hidden" name="key" value={r.key} />

              <div className="row" style={{ justifyContent: 'space-between' }}>
                <div>
                  <h2 style={{ marginBottom: 2 }}>{r.label_de}</h2>
                  <p className="muted small" style={{ margin: 0 }}>
                    <code>{r.key}</code>
                    {r.is_system && <span className="badge" style={{ marginLeft: 8 }}>System</span>}
                    <span style={{ marginLeft: 8 }}>
                      {people === 0
                        ? 'niemand'
                        : people === 1
                          ? '1 Person'
                          : `${people} Personen`}
                    </span>
                  </p>
                </div>
                <button type="submit" className="secondary">
                  Speichern
                </button>
              </div>

              <div className="grid-2" style={{ marginTop: 16 }}>
                <label>
                  Bezeichnung
                  <input name="label_de" defaultValue={r.label_de} required />
                </label>
                <label>
                  Beschreibung
                  <input name="description" defaultValue={r.description ?? ''} />
                </label>
              </div>

              <label style={{ fontWeight: 400 }}>
                <input
                  type="checkbox"
                  name="all_locations"
                  defaultChecked={r.all_locations}
                  style={{ width: 'auto', display: 'inline', marginRight: 8 }}
                />
                Sieht alle Standorte
              </label>

              {isSuper && (
                <div className="notice" style={{ marginTop: 12 }}>
                  Diese Rolle hat <strong>Vollzugriff</strong>. Damit gelten alle
                  weiteren Häkchen ohnehin — auch die, die hier leer sind, und auch
                  spätere neue Berechtigungen.
                </div>
              )}

              <h3 className="section-title" style={{ marginTop: 20 }}>
                Berechtigungen
              </h3>
              <div className="perm-grid">
                {categories.map((c) => (
                  <fieldset className="perm-group" key={c.name}>
                    <legend>{c.name}</legend>
                    {c.items.map((p) => (
                      <label className="perm" key={p.key}>
                        <input
                          type="checkbox"
                          name="permissions"
                          value={p.key}
                          defaultChecked={granted.has(p.key)}
                        />
                        <span>
                          {p.label_de}
                          {p.description && (
                            <span className="muted small perm__hint">{p.description}</span>
                          )}
                        </span>
                      </label>
                    ))}
                  </fieldset>
                ))}
              </div>
            </form>

            {!r.is_system && (
              <form action={deleteRole} style={{ marginTop: 12 }}>
                <input type="hidden" name="key" value={r.key} />
                <button type="submit" className="danger" disabled={people > 0}>
                  {people > 0 ? 'Löschen (erst Personen umtragen)' : 'Rolle löschen'}
                </button>
              </form>
            )}
          </div>
        );
      })}
    </>
  );
}
