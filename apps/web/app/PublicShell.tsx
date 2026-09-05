// The frame around every page a customer sees: the landing page, the booking
// wizard and the signing page.
//
// Deliberately thin. This app is only ever one of two things — a page embedded
// in or linked from kidbike.de, or the staff console — and in both cases a
// second contact block underneath is a duplicate: the website already carries
// the address, and staff do not need to be told where they work. So the shell
// is a wordmark, a way back to the site, and a way in to the console. Nothing
// else.

import Link from 'next/link';
import { BrandMark } from './BrandMark';

export function PublicShell({
  children,
  lang = 'de',
  width,
}: {
  children: React.ReactNode;
  /** The signing page is bilingual; everything else is German. */
  lang?: 'de' | 'en';
  /** Optional narrower measure for form-shaped pages. */
  width?: number;
}) {
  const t =
    lang === 'en'
      ? { site: 'kidbike.de', signIn: 'Staff login' }
      : { site: 'kidbike.de', signIn: 'Anmelden' };

  return (
    <div className="publicshell">
      <header className="publicshell__top">
        <a href="https://www.kidbike.de" aria-label="KidBike e. V.">
          <BrandMark height={28} />
        </a>
        <span className="topbar__spacer" />
        <a className="publicshell__toplink" href="https://www.kidbike.de">
          {t.site} ↗
        </a>
        {/* The only way into the console from a public page. It used to live in
            the footer; the footer is gone, and a sign-in link that exists only
            on a page nobody scrolls to is a sign-in link nobody finds. */}
        <Link className="btnlink btnlink--sm" href="/login">
          {t.signIn}
        </Link>
      </header>

      <main className="wrap" style={width ? { maxWidth: width } : undefined}>
        {children}
      </main>
    </div>
  );
}
