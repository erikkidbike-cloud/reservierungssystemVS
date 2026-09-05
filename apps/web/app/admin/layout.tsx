// Internal console shell: authentication guard, brand bar, and the navigation
// entries this particular person may see.
//
// Which entries exist is decided HERE, on the server, from the caller's
// permissions — AdminNav only renders and highlights them. As ever, hiding a
// link is not the security boundary; RLS and the role-scoped views are. A link
// someone reaches by typing the URL still lands on a page that refuses them.

import Link from 'next/link';
import { cookies } from 'next/headers';
import { serverClient } from '@/lib/supabase';
import { findSchemaGaps } from '@/lib/schema-check';
import { BrandMark } from '../BrandMark';
import { AdminNav, type NavEntry, type NavItem } from './AdminNav';
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
  canManageWaitlist,
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

  // Grouped by the job, not by the screen. The six things somebody opens in a
  // normal week stay one click away; everything that gets configured once and
  // then left alone sits behind "Einstellungen". A menu with nothing the
  // caller may see disappears entirely rather than opening onto an empty
  // panel, which is why each `items` list is filtered before it is counted.
  const settingsItems: NavItem[] = [
    ...(canManageTariffs(auth) ? [{ href: '/admin/tariffs', label: 'Preise und Extras' }] : []),
    ...(canManageAgreements(auth) ? [{ href: '/admin/agreements', label: 'Vertragstexte' }] : []),
    ...(canManageMailTemplates(auth)
      ? [
          { href: '/admin/mail-templates', label: 'E-Mail-Vorlagen' },
          { href: '/admin/reminders', label: 'Erinnerungen' },
        ]
      : []),
    ...(canManageUsers(auth) ? [{ href: '/admin/users', label: 'Benutzer' }] : []),
    ...(canManageRoles(auth) ? [{ href: '/admin/roles', label: 'Rollen und Rechte' }] : []),
  ];

  const bookingItems: NavItem[] = [
    { href: '/admin/bookings', label: 'Alle Buchungen' },
    ...(canManageWaitlist(auth) ? [{ href: '/admin/waitlist', label: 'Warteliste' }] : []),
    ...(canSeeContactData(auth) ? [{ href: '/admin/customers', label: 'Kund*innen' }] : []),
  ];

  const entries: NavEntry[] = [
    { href: '/admin', label: 'Übersicht' },
    // A single-destination menu is just a link with an extra click in it.
    bookingItems.length > 1
      ? { label: 'Buchungen', items: bookingItems }
      : { href: '/admin/bookings', label: 'Buchungen' },
    ...(canManageEvents(auth) ? [{ href: '/admin/events', label: 'Termine' }] : []),
    ...(canSeeTasks(auth) ? [{ href: '/admin/tasks', label: 'Aufgaben' }] : []),
    ...(canManagePayments(auth) ? [{ href: '/admin/payments', label: 'Zahlungen' }] : []),
    { href: '/admin/occupancy', label: 'Auslastung' },
    ...(settingsItems.length > 0 ? [{ label: 'Einstellungen', items: settingsItems }] : []),
  ];

  return (
    <>
      <header className="topbar">
        <Link href="/" aria-label="KidBike — zur öffentlichen Seite">
          <BrandMark height={24} />
        </Link>
        <span className="topbar__spacer" />
        <span className="topbar__who">
          <span className="topbar__email" title={user.email ?? undefined}>
            {user.email}
          </span>
          <span className="badge">{user.auth?.roleLabel ?? '—'}</span>
        </span>
        <form action={signOut}>
          <button type="submit" className="linklike">
            Abmelden
          </button>
        </form>
      </header>

      <AdminNav entries={entries} />

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
