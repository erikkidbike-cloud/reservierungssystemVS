// Internal console shell: authentication guard + role-aware navigation.
// Individual pages still query role-appropriate relations — this nav only hides
// links, it is not the security boundary. RLS and the role views are.

import Link from 'next/link';
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
        {!canSeeContactData(auth) && (
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
