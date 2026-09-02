# @vs/documents

Booking terms and the Nutzungsvereinbarung (agreement) as print-ready HTML and PDF.
Backlog tasks 3.1 / 3.2.

## What is finished

- **`terms.ts`** — the 10 booking-form terms in DE and EN, copied **verbatim**
  from the live front-end, plus the Wassertorplatz variation (drops the
  parallel-use term, adds the key-handover one). This content is complete and
  correct; do not reword it without the owner's approval.
- **`nv-template.ts`** — the full agreement layout: merge fields, facts table,
  numbered clause list, bank details, ID-upload notice, signature block, A4 print
  CSS, DE/EN. All merged values are HTML-escaped.
- **`render.ts`** — HTML → PDF through headless Chromium.
- **`nv-contract.ts`** — the clause registry (all 16, in order, with titles), the
  organisation and bank details, and the monetary constants.

## What is deliberately NOT finished

> **The 16 clause bodies are empty placeholders.**

The Nutzungsvereinbarung is a binding contract. Its wording must be copied
**verbatim** from the owner's Word template (*Nutzungsvereinbarung VS WE DE EN*)
— not paraphrased, summarised or re-drafted. Only what could be established with
certainty from the existing system is filled in here: the clause set and order,
the bank details, and the figures (14-day cancellation, 100 € / +200 € / max
300 € noise penalties, 50 € damage admin fee, 50 € per started hour for late
closing, Mo–Sa 14:00–18:00 children's project window).

`buildNutzungsvereinbarungHtml()` **throws** while any required clause body is
empty. Pass `{ allowDraft: true }` to preview — the document is then stamped
"ENTWURF — nicht rechtsverbindlich" and each missing clause is marked inline, so
an unfinished contract cannot quietly be sent to a customer.

### To finish it

Fill `bodyDe` / `bodyEn` for each entry in `NV_CLAUSES` from the Word file. The
`id`s are stable, so the clauses can be filled in any order. Once every required
body is non-empty, rendering without `allowDraft` succeeds and the draft banner
disappears — `nv-template.test.ts` covers exactly that transition.

## Usage

```ts
import { renderNutzungsvereinbarung } from '@vs/documents';

const pdf = await renderNutzungsvereinbarung(data, {
  // Only needed where the Chromium build differs from playwright-core's pin;
  // otherwise PLAYWRIGHT_BROWSERS_PATH is enough.
  executablePath: process.env.CHROMIUM_PATH,
});
```

## Tests

```bash
node --test --experimental-strip-types "test/*.test.ts"
```

13 tests: verbatim terms and the WA variation, the refuse-to-render-unfinished
guard, the draft stamp, merge-field output, DE/EN money and date formatting, and
HTML escaping of customer data.

The PDF path itself is exercised manually (it needs a browser binary); the
template is covered by tests so layout changes are safe to make without one.
