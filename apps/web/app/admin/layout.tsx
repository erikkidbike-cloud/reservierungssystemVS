// Internal console shell: authentication guard + role-aware navigation.
// Individual pages still query role-appropriate relations — this nav only hides
// links, it is not the security boundary. RLS and the role views are.

import Link from 'next/link';
import { cookies } from 'next/headers';
import { serverClient } from '@/lib/supabase';
import { findSchemaGaps } from '@/lib/schema-check';
import {
  getSessionUser,
  canManageTariffs,
  canManageAgreements,
  canManageUsers,
  canSeeContactData,
  canSeeTasks,
  canManagePayments,
  canManageEvents,
  canManageMailTemplates,
  canManageRoles,
} from '@/lib/auth';
import { signOut } from './actions';

export const dynamic = 'force-dynamic';

export default async function AdminLayout({ children }: { children: React.ReactNode }) {
  const user = await getSessionUser();

  // Only when something has already told us the schema is behind — so this
  // costs nothing on a healthy database.
  const gaps = user?.schemaOutdated
    ? await findSchemaGaps(serverClient(await cookies()))
    : [];

  if (!user) {
    return (
      <main className="wrap">
        <h1>Anmeldung erforderlich</h1>
        <p className="muted">
          Bitte anmelden, um die interne Verwaltung zu öffnen.
        </p>
        <p>
          <Link href="/login">Anmelden →</Link>
        </p>
      </main>
    );
  }

  const auth = user.auth;

  if (!user.profile || user.profile.is_active === false) {
    return (
      <main className="wrap">
        <h1>Konto noch nicht freigeschaltet</h1>
        <p className="muted">
          Das Konto {user.email} ist angemeldet, aber noch keiner Rolle zugeordnet.
          Bitte eine Administratorin um Freischaltung.
        </p>
      </main>
    );
  }

  return (
    <>
      <nav className="nav">
        <Link href="/" className="brand">
          KidBike
        </Link>
        <Link href="/admin">Übersicht</Link>
        <Link href="/admin/bookings">Buchungen</Link>
        <Link href="/admin/occupancy">Auslastung</Link>
        {canSeeContactData(auth) && <Link href="/admin/waitlist">Warteliste</Link>}
        {canSeeContactData(auth) && <Link href="/admin/customers">Kunden</Link>}
        {canSeeTasks(auth) && <Link href="/admin/tasks">Aufgaben</Link>}
        {canManageEvents(auth) && <Link href="/admin/events">Termine</Link>}
        {canManagePayments(auth) && <Link href="/admin/payments">Zahlungen</Link>}
        {canManageMailTemplates(auth) && <Link href="/admin/mail-templates">E-Mail-Vorlagen</Link>}
        {canManageMailTemplates(auth) && <Link href="/admin/reminders">Erinnerungen</Link>}
        {canManageTariffs(auth) && <Link href="/admin/tariffs">Preise</Link>}
        {canManageAgreements(auth) && <Link href="/admin/agreements">Verträge</Link>}
        {canManageUsers(auth) && <Link href="/admin/users">Benutzer</Link>}
        {canManageRoles(auth) && <Link href="/admin/roles">Rollen</Link>}
        <span className="spacer" />
        <span className="muted small">
          {user.email} ·{' '}
          <span className="badge">{user.auth?.roleLabel ?? '—'}</span>
        </span>
        <form action={signOut}>
          <button type="submit" className="linklike">
            Abmelden
          </button>
        </form>
      </nav>
      <main className="wrap">
        {/* A schema older than the deployed build is an operational fault, not
            a permission decision — so it says exactly that, and says what to do
            about it. Anything less specific sends someone hunting through the
            roles screen for a problem that is not there. */}
        {user.schemaOutdated && (
          <div className="notice notice--warn">
            <p style={{ marginTop: 0 }}>
              <strong>Datenbank ist nicht auf dem Stand dieser Version.</strong>{' '}
              {gaps.length > 1
                ? `${gaps.length} Migrationen fehlen.`
                : 'Es fehlt mindestens eine Migration.'}{' '}
              Bis sie im Supabase-SQL-Editor ausgeführt sind, gelten die alten,
              fest eingebauten Rollenrechte, und die unten genannten Bereiche
              melden Fehler.
            </p>
            {gaps.length > 0 && (
              <ul style={{ margin: '0 0 12px', paddingLeft: '1.2em' }}>
                {gaps.map((g) => (
                  <li key={g.migration}>
                    <code>{g.migration}.sql</code> — {g.feature}
                  </li>
                ))}
              </ul>
            )}
            <p style={{ marginBottom: 0 }} className="small">
              Die Dateien liegen im Repository unter{' '}
              <code>supabase/migrations/</code> und müssen der Reihe nach
              ausgeführt werden. Welche genau fehlen, sagt{' '}
              <code>supabase/post-deploy/check-schema.sql</code> — einmal in den
              SQL-Editor einfügen und ausführen; es ändert nichts, es berichtet nur.
            </p>
          </div>
        )}
        {!user.schemaOutdated && !canSeeContactData(auth) && (
          <div className="notice">
            Eingeschränkte Ansicht: Kontakt- und Finanzdaten werden für diese Rolle
            nicht geladen.
          </div>
        )}
        {children}
      </main>
    </>
  );
}
