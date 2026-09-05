# apps/web/public

Static files served from the site root. `public/logo.png` is reachable at
`/logo.png`.

## The KidBike logo — drop it here

`app/BrandMark.tsx` looks for these two names, in this order, and uses the
first one that exists:

    apps/web/public/kidbike-logo.svg     ← preferred
    apps/web/public/kidbike-logo.png     ← fallback

Nothing else needs changing: no import, no component edit. Add the file,
commit, deploy, and every place the wordmark appears — the console's top bar,
the public pages, the embeddable widget — switches to the real logo at once.

**SVG is worth the trouble.** It stays sharp on a phone, on a 4K screen and in
a printed Nutzungsvereinbarung, and it recolours for dark mode. A PNG should be
at least 600px wide with a transparent background if that is all there is.

Until a file is present, `BrandMark` draws an approximation of the wordmark in
the page's typeface. That is deliberately a placeholder — the real letter
shapes, spacing and blue belong to the logo and should not be imitated in
production. It exists only so the app never shows a broken image.

## Also worth adding here eventually

- `favicon.ico` / `icon.png` — the browser-tab icon.
- `apple-touch-icon.png` — for a phone home screen.
