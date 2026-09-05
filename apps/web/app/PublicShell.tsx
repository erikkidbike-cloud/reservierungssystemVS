// The frame around every page a customer sees: the landing page, the booking
// wizard and the signing page.
//
// Until now those three had no shared chrome at all — a booking request opened
// on a bare white page with a heading, which reads as a form somebody left
// lying about rather than as part of KidBike. They now carry the same wordmark
// bar and the same apricot footer as kidbike.de, so following a link from the
// site into the booking form does not feel like leaving it.
//
// The address and phone number come from @vs/documents' ORGANISATION — the
// same constant the Nutzungsvereinbarung prints. One place to correct if the
// office ever moves.

import Link from 'next/link';
import { ORGANISATION } from '@vs/documents';
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
      ? { home: 'kidbike.de', find: 'Where to find us', mail: 'Email', call: 'Call us', staff: 'Staff login' }
      : {
          home: 'kidbike.de',
          find: 'Hier finden Sie uns',
          mail: 'E-Mail',
          call: 'Rufen Sie uns an',
          staff: 'Interne Verwaltung',
        };

  return (
    <div className="publicshell">
      <header className="publicshell__top">
        <a href="https://www.kidbike.de" aria-label="KidBike e. V.">
          <BrandMark height={28} />
        </a>
        <span className="topbar__spacer" />
        <a className="publicshell__toplink" href="https://www.kidbike.de">
          {t.home} ↗
        </a>
      </header>

      <main className="wrap" style={width ? { maxWidth: width } : undefined}>
        {children}
      </main>

      <footer className="publicshell__foot">
        <div className="publicshell__footinner">
          <div>
            <h2 className="publicshell__foottitle">{ORGANISATION.name}</h2>
            <p className="small" style={{ marginBottom: 0 }}>
              {t.find}:<br />
              {ORGANISATION.street}
              <br />
              {ORGANISATION.city}
            </p>
          </div>
          <div>
            <p className="small" style={{ marginBottom: 0 }}>
              {t.mail}: <a href={`mailto:${ORGANISATION.email}`}>{ORGANISATION.email}</a>
              <br />
              {t.call}: {ORGANISATION.phone}
            </p>
          </div>
          <div>
            <p className="small" style={{ marginBottom: 0 }}>
              <a href="https://www.kidbike.de/datenschutz/">Datenschutz</a>
              <br />
              <a href="https://www.kidbike.de/impressum/">Impressum</a>
              <br />
              <Link href="/login">{t.staff}</Link>
            </p>
          </div>
        </div>
      </footer>
    </div>
  );
}
