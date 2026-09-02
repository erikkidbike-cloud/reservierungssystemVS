# Reference: legacy system

`legacy-kidbike-json/` is a **verbatim copy** of the current live front-end from
the `erikkidbike-cloud/kidbike-json` repository (as of 2026-09-02). It is the
ground truth for:

- **Pricing constants** — `index.html` `PRICING` (`:1000-1097`), the surcharge
  (`:984`) and price computation (`:2191-2435`). The rebuilt engine in
  `packages/pricing` ports these exactly and is pinned by tests.
- **i18n / terms text** — `index.html` `I18N` and `getTermsForSchool` (`:935`):
  the DE/EN labels and the 10 terms per language, to be reused verbatim in the
  new public form.
- **Validation** — `validateTimes`/`violatesClosing`/`minStartDate`
  (`:1558-1738`).
- **Data contracts** — `events-*.json` show the current JSON shape the Power
  Automate flows produce (and the `fg` vs `frauenprojekt` mismatch, see
  `docs/05-open-questions.md`).
- **Backend proxy** — `netlify/functions/submit.js` (how the shared secret is
  injected server-side).

Not included here (owner holds these; needed for specific later tasks):
- `Code.gs` — the Google Apps Script backend (holds, email, HMAC deny link).
- The Word templates (`Nutzungsvereinbarung …`, `Sammel-…`) — verbatim clause
  text for the PDF templates (handoff Phase 3).
- The Excel workbook (`VS WE Veranstaltungen …`) — column layout for the import.
- The four Power Automate flow exports.

> **GDPR note:** the shared "Musterdaten" Excel workbook's `Erfahrungen` tab
> contained real personal data (names, addresses, phones, e-mails, negative
> ratings). Do not commit that workbook here; re-anonymise before sharing.
