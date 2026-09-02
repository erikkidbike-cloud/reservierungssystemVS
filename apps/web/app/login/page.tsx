// Magic-link sign-in. Deliberately outside /admin: that layout gates its
// children behind "is someone logged in", so the login page itself must live
// somewhere that gate doesn't apply, or nobody could ever reach it.
//
// Provider-agnostic by design: getSessionUser() and the profiles row it reads
// don't care how someone authenticated. Adding Microsoft/Entra ID later (see
// docs/07-supabase-setup.md, "Appendix — adding Microsoft/Entra ID later") is
// a matter of enabling that provider in Supabase and adding one more button
// here — nothing about this page, the DB schema, or the rest of the app needs
// to change first.

import { redirect } from 'next/navigation';
import { getSessionUser } from '@/lib/auth';
import { requestMagicLink } from './actions';

export const dynamic = 'force-dynamic';

export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ sent?: string; error?: string }>;
}) {
  const user = await getSessionUser();
  if (user) redirect('/admin');

  const params = await searchParams;

  return (
    <main className="wrap" style={{ maxWidth: 420 }}>
      <h1>Anmelden</h1>
      <p className="muted">
        KidBike-E-Mail-Adresse eingeben. Du bekommst einen Login-Link
        zugeschickt — kein Passwort nötig.
      </p>

      {params.sent && (
        <div className="notice" style={{ borderLeftColor: 'var(--accent)' }}>
          Link verschickt an <strong>{params.sent}</strong>. E-Mail (auch den
          Spam-Ordner) prüfen und den Link innerhalb von 60 Minuten öffnen.
        </div>
      )}
      {params.error && (
        <div className="notice">Anmeldung fehlgeschlagen: {params.error}</div>
      )}

      <form action={requestMagicLink}>
        <label>
          E-Mail-Adresse
          <input
            type="email"
            name="email"
            required
            autoFocus
            style={{ width: '100%', display: 'block', marginTop: 4 }}
          />
        </label>
        <button type="submit" style={{ marginTop: 12 }}>
          Login-Link anfordern
        </button>
      </form>

      <p className="muted" style={{ fontSize: 12, marginTop: 24 }}>
        Anmeldung mit dem KidBike-Microsoft-Konto folgt später — bis dahin
        reicht die E-Mail-Adresse.
      </p>
    </main>
  );
}
