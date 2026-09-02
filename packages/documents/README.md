# @vs/documents

Booking terms and the Nutzungsvereinbarung (agreement) as print-ready HTML/PDF,
plus the cover email. Backlog tasks 3.1 and 3.1b.

## Where the clause text actually lives

This package **renders** the agreement; it is not where the clause wording is
edited day-to-day. That's `agreement_clauses` in the database, editable at
`/admin/agreements` with no deploy — the same pattern as `tariffs`: the pricing
*algorithm* is code, the pricing *numbers* are DB rows; here the rendering
*logic* is code, the clause *wording* is DB rows. See
`docs/02-data-model.md` and `supabase/migrations/0008_agreements.sql`.

What lives in this package:

- **`src/nv-clauses.generated.ts`** — the **initial import** of the real clause
  text, mechanically extracted from the owner's Word templates (never
  retyped/paraphrased — see "Importing the clause text" below). This seeds the
  database once (`supabase/seed/nv_clauses.sql`); after that, the database is
  authoritative and this file is just where new locations' Word imports land
  before their first seed.
- **`getClausesForLocation()` / `hasClausesForLocation()`** — read that
  generated set. The app doesn't call these directly for rendering a real
  document (it reads `agreement_clauses` and passes the result via
  `RenderOptions.clauses`); they're used by the "import from template" admin
  action and by this package's own tests, which pin the imported text.

| | Weinstraße (WE) | Wassertorplatz (WA) | Wiener Straße (WI) |
|---|---|---|---|
| Clauses | 16 | 11 | 0 — **ready to add, not written yet** |
| Deposit clause | yes | **no** | — |
| Children's project | Mon–**Sat** | Mon–**Fri** | — |

WI being phone-only today doesn't require any schema or code change to give it
a contract later: an admin either types the clauses into `/admin/agreements`
directly, or hands over a WI Word file to run through the same importer used
for WE/WA. The clause sets are **not** interchangeable between locations, so
`getClausesForLocation()` throws for an unknown location rather than rendering
the wrong contract — and the same is true at the database level: a booking for
a location with zero `agreement_clauses` rows has no agreement to send yet.

## Importing the clause text (from Word into the generated file)

The agreement is a binding contract, so its wording is never retyped. To update
it, edit the Word file and re-run the importer — the diff is reviewable:

```bash
python3 scripts/import-nv-docx.py \
  WE=<Nutzungsvereinbarung_VS_WE_DE_EN.docx> \
  WA=<Serienbrief_Nutzungsvereinbarung_VS_WA_DE_EN.docx> \
  > src/nv-clauses.generated.ts
```

`src/nv-clauses.generated.ts` is generated — do not hand-edit it.

The importer keys off the "Überschrift 2" heading style, but also accepts
`N. Title` numbering and works line-by-line, because the Wassertorplatz template
has structural defects (see below). It reports anomalies on stderr.

**This only updates the generated file, not the live database.** Re-seeding
(`supabase/seed/nv_clauses.sql`, produced by
`scripts/export-clauses-sql.mts`) is `ON CONFLICT DO NOTHING`, so it never
overwrites a clause an admin has since edited in `/admin/agreements` — by
design, once a location is seeded, the database is the source of truth and a
Word re-import doesn't silently propagate. To pull a genuinely updated Word
template into a *live* project, edit the affected clauses by hand in the admin
UI, or deliberately clear that location's rows first.

## Language

`renderAgreements(data)` produces **one** PDF, in the language the customer chose
when booking (`data.lang`). The previous manual process always attached both a
German and an English PDF; pass `{ languages: ['de', 'en'] }` to keep that.

```ts
const files = await renderAgreements(data);                       // booker's language
const both  = await renderAgreements(data, { languages: ['de','en'] });
const email = buildCoverEmail(data);                              // matching cover text
```

Each file carries its `lang` and a descriptive `filename`
(`Nutzungsvereinbarung_WE_2026-03-10_Beispiel-Anna.pdf`).

## Merge fields

Clause and email text keep the Word `«FieldName»` placeholders; `mergeFields()`
supplies the values and `applyMergeFields()` substitutes them. A test asserts
that **every** field appearing in any clause or email has a value, and that a
rendered document contains no leftover placeholders.

The Word templates are inconsistent about spacing (`von«Nutzung_Üw»` vs
`: «Nutzung_Üw»`), so substitution inserts a space only where the field abuts a
non-space character.

## Two things found in the source documents

1. **The Wassertorplatz template has structural defects.** Clause 9's body text
   carries the Heading 2 style, and the "10. Parallelveranstaltungen" /
   "10. Parallel Events" headings sit inside the previous clause's paragraph
   instead of being their own styled heading. The English section also numbers
   two different clauses "10.". The importer works around all of this and prints
   a warning; the Word file is still worth tidying.
2. **WA charges a deposit online that its agreement never mentions.** The booking
   form's pricing takes a Kaution of 50 € (≤45 people) or 70 € (≥46), but the
   Wassertorplatz agreement contains no deposit clause at all — the word
   "Kaution" does not appear in it. Either the clause is missing from the
   contract or the online deposit should not be charged. This needs a decision.

## Tests

```bash
node --test --experimental-strip-types "test/*.test.ts"
```

22 tests: clause-set integrity for both locations, the WE/WA differences,
merge-field coverage, no-leftover-placeholders, salutation inflection,
language switching, money/date formatting, HTML escaping, the clause-body
layout rules (facts table, payment block, bullets), and both cover emails.
