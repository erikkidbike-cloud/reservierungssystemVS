// The KidBike wordmark.
//
// Uses the REAL logo file whenever one is present at apps/web/public/ — see
// that directory's README for the exact filenames. Until then it draws a close
// approximation as SVG text, so the app is never showing a broken image, but
// the drawn version is a placeholder and not the mark: letter shapes, spacing
// and the exact blue are the logo's own and should not be imitated in
// production.
//
// The check happens once at module load rather than per render, and only on
// the server (every caller — the console's top bar, PublicShell, the widget —
// is a server component). Dropping the file in is therefore the whole
// installation step: no import to add, no component to change.

import fs from 'node:fs';
import path from 'node:path';

/** Candidates in preference order. SVG first: it stays sharp at any size. */
const CANDIDATES = ['/kidbike-logo.svg', '/kidbike-logo.png'];

const logoSrc: string | null = (() => {
  for (const rel of CANDIDATES) {
    try {
      if (fs.existsSync(path.join(process.cwd(), 'public', rel.slice(1)))) return rel;
    } catch {
      // A read-only or unusual filesystem is not a reason to fail a page.
    }
  }
  return null;
})();

export function BrandMark({
  height = 26,
  title = 'KidBike e. V.',
}: {
  height?: number;
  title?: string;
}) {
  if (logoSrc) {
    // Intrinsic size is unknown (the file is supplied by the owner), so width
    // is left to the aspect ratio and only the height is pinned — the same
    // thing the drawn fallback does.
    // eslint-disable-next-line @next/next/no-img-element
    return <img src={logoSrc} alt={title} style={{ height, width: 'auto', display: 'block' }} />;
  }

  return (
    <svg
      height={height}
      viewBox="0 0 168 32"
      role="img"
      aria-label={title}
      style={{ display: 'block', overflow: 'visible' }}
    >
      <text
        x="0"
        y="24"
        fill="var(--accent)"
        style={{
          font: '700 26px/1 var(--font-sans), system-ui, sans-serif',
          letterSpacing: '-0.02em',
        }}
      >
        KidBike
      </text>
      <text
        x="112"
        y="24"
        fill="var(--accent)"
        style={{
          font: '400 21px/1 var(--font-sans), system-ui, sans-serif',
          letterSpacing: '0.01em',
        }}
      >
        e.V.
      </text>
    </svg>
  );
}
