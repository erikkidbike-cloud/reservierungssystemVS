# @vs/documents

Booking terms, the Nutzungsvereinbarung (agreement) as print-ready HTML/PDF, and
the cover email. Backlog task 3.1.

## Status: complete for WE and WA

The clause wording is **real** — extracted from the owner's Word templates, not
paraphrased. 16 clauses for Weinstraße, 11 for Wassertorplatz, each in German and
English, plus both cover emails.

| | Weinstraße (WE) | Wassertorplatz (WA) | Wiener Straße (WI) |
|---|---|---|---|
| Clauses | 16 | 11 | — (phone-only, no template) |
| Deposit clause | yes | **no** | — |
| Children's project | Mon–**Sat** | Mon–**Fri** | — |

The sets are **not** interchangeable, so `getClausesForLocation()` throws for an
unknown location rather than rendering the wrong contract.

## Importing the clause text

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
