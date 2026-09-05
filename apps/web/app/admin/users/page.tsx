// User administration: who can log in, what role they have, which locations
// they're scoped to. Until this page existed, the only way to grant anyone
// access was an UPDATE in Supabase's SQL editor.

import { cookies } from 'next/headers';
import { serverClient } from '@/lib/supabase';
import { getSessionUser, canManageUsers } from '@/lib/auth';
import type { Location, Profile, Role } from '@/lib/db-types';
import { setUserRole, setUserActive, setUserLocations } from './actions';

export const dynamic = 'force-dynamic';

export default async function UsersPage() {
  const me = await getSessionUser();
  if (!canManageUsers(me?.auth)) {
    return (
      <>
        <h1>Benutzer</h1>
        <div className="notice">
          Nur Administratoren können Rollen und Standorte vergeben.
        </div>
      </>
    );
  }

  const supabase = serverClient(await cookies());
  // Roles are rows now, so the dropdown and the "sees every location" note are
  // both read from the database rather than from a constant that would go
  // stale the moment someone adds a role at /admin/roles.
  const [{ data: profiles, error: pErr }, { data: locations }, { data: memberships }, { data: roleRows }] =
    await Promise.all([
      supabase.from('profiles').select('*').order('created_at', { ascending: true }),
      supabase.from('locations').select('*').eq('is_active', true).order('sort_order'),
      supabase.from('user_locations').select('user_id, location_id'),
      supabase.from('roles').select('*').order('sort').order('label_de'),
    ]);

  if (pErr) {
    return (
      <>
        <h1>Benutzer</h1>
        <div className="notice">Konnte Benutzer nicht laden: {pErr.message}</div>
      </>
    );
  }

  const locs = (locations ?? []) as Location[];
  const byUser = new Map<string, Set<string>>();
  for (const m of memberships ?? []) {
    const set = byUser.get(m.user_id) ?? new Set<string>();
    set.add(m.location_id);
    byUser.set(m.user_id, set);
  }

  const users = (profiles ?? []) as Profile[];
  const roles = (roleRows ?? []) as Role[];
  const roleByKey = new Map(roles.map((r) => [r.key, r]));
  const labelFor = (key: string) => roleByKey.get(key)?.label_de ?? key;

  return (
    <>
      <h1>Benutzer</h1>
      <p className="muted">
        Jede Person, die sich angemeldet hat, erscheint hier automatisch — zunächst
        als Mitarbeiter*in. Rolle und Standorte werden hier vergeben.
      </p>

      {users.map((u) => {
        const assigned = byUser.get(u.id) ?? new Set<string>();
        const unscoped = roleByKey.get(u.role)?.all_locations ?? false;
        const isMe = u.id === me?.id;

        return (
          <div className="panel" key={u.id}>
            <div className="row" style={{ justifyContent: 'space-between' }}>
              <div>
                <h3 style={{ marginBottom: 2 }}>
                  {u.full_name || u.email || u.id}
                  {isMe && <span className="badge" style={{ marginLeft: 8 }}>du</span>}
                </h3>
                <p className="muted small" style={{ margin: 0 }}>{u.email}</p>
              </div>
              <span className={u.is_active ? 'badge badge--ok' : 'badge badge--warn'}>
                {u.is_active ? labelFor(u.role) : 'deaktiviert'}
              </span>
            </div>

            <div className="grid-2" style={{ marginTop: 16 }}>
              <form action={setUserRole}>
                <input type="hidden" name="userId" value={u.id} />
                <label>
                  Rolle
                  <select name="role" defaultValue={u.role}>
                    {roles.map((r) => (
                      <option key={r.key} value={r.key}>
                        {r.label_de}
                      </option>
                    ))}
                  </select>
                </label>
                <button type="submit" className="secondary">
                  Rolle speichern
                </button>
                {isMe && (
                  <p className="muted small" style={{ marginTop: 8 }}>
                    Vorsicht beim Ändern der eigenen Rolle. Die letzte aktive
                    Administration lässt sich nicht herabstufen — das verhindert
                    die Datenbank.
                  </p>
                )}
              </form>

              <form action={setUserLocations}>
                <input type="hidden" name="userId" value={u.id} />
                <label style={{ marginBottom: 8 }}>Standorte</label>
                {unscoped ? (
                  <p className="muted small">
                    {labelFor(u.role)} sieht alle Standorte — eine Zuordnung ist
                    hier nicht nötig.
                  </p>
                ) : (
                  <>
                    {locs.map((l) => (
                      <label
                        key={l.id}
                        style={{ fontWeight: 400, color: 'var(--fg)', marginBottom: 4 }}
                      >
                        <input
                          type="checkbox"
                          name="locationIds"
                          value={l.id}
                          defaultChecked={assigned.has(l.id)}
                          style={{ width: 'auto', display: 'inline', marginRight: 8 }}
                        />
                        {l.name}
                      </label>
                    ))}
                    <button type="submit" className="secondary" style={{ marginTop: 8 }}>
                      Standorte speichern
                    </button>
                  </>
                )}
              </form>
            </div>

            {!isMe && (
              <form action={setUserActive} style={{ marginTop: 12 }}>
                <input type="hidden" name="userId" value={u.id} />
                <input type="hidden" name="isActive" value={String(!u.is_active)} />
                <button type="submit" className={u.is_active ? 'danger' : 'secondary'}>
                  {u.is_active ? 'Konto deaktivieren' : 'Konto wieder aktivieren'}
                </button>
              </form>
            )}
          </div>
        );
      })}
    </>
  );
}
