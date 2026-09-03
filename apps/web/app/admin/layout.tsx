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
  ROLE_LABEL,
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

  const role = user.profile?.role;

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
        {canSeeContactData(role) && <Link href="/admin/waitlist">Warteliste</Link>}
        {canSeeContactData(role) && <Link href="/admin/customers">Kunden</Link>}
        {canSeeTasks(role) && <Link href="/admin/tasks">Aufgaben</Link>}
        {canManageEvents(role) && <Link href="/admin/events">Termine</Link>}
        {canManagePayments(role) && <Link href="/admin/payments">Zahlungen</Link>}
        {canManageMailTemplates(role) && <Link href="/admin/mail-templates">E-Mail-Vorlagen</Link>}
        {canManageTariffs(role) && <Link href="/admin/tariffs">Preise</Link>}
        {canManageAgreements(role) && <Link href="/admin/agreements">Verträge</Link>}
        {canManageUsers(role) && <Link href="/admin/users">Benutzer</Link>}
        <span className="spacer" />
        <span className="muted small">
          {user.email} ·{' '}
          <span className="badge">{role ? ROLE_LABEL[role] : '—'}</span>
        </span>
        <form action={signOut}>
          <button type="submit" className="linklike">
            Abmelden
          </button>
        </form>
      </nav>
      <main className="wrap">
        {!canSeeContactData(role) && (
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
