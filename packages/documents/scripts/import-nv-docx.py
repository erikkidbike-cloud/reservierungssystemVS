#!/usr/bin/env python3
"""Import the Nutzungsvereinbarung clause text from the owner's Word templates.

The agreement is a binding contract, so its wording is extracted mechanically
rather than retyped — no transcription risk, and re-running this after the Word
file changes produces a reviewable diff.

Both templates place each clause under an "Überschrift 2" heading, German
section first and the English translation after, followed by the cover email
(also DE then EN). That structure is what this script keys off.

Usage:
    python3 scripts/import-nv-docx.py WE=<we.docx> WA=<wa.docx> \
        > src/nv-clauses.generated.ts
"""

import sys
import zipfile
import re
from xml.etree import ElementTree as ET

W = '{http://schemas.openxmlformats.org/wordprocessingml/2006/main}'

# Stable clause ids, in document order, per location. Positional rather than
# title-matched so a wording tweak in a heading does not silently drop a clause.
CLAUSE_IDS = {
    'WE': [
        'nutzungszeit', 'entgelt_kaution', 'personenzahl', 'stornierung',
        'reinigung', 'laerm', 'rauchverbot', 'haftung', 'schaeden',
        'auf_abbau', 'parallelveranstaltungen', 'kinderfreizeitprojekt',
        'autolieferungen', 'verspaetungen', 'flurnutzung', 'hausrecht',
    ],
    'WA': [
        'nutzungszeit', 'entgelt', 'stornierung', 'reinigung', 'laerm',
        'rauchverbot', 'haftung', 'schaeden', 'auf_abbau',
        'parallelveranstaltungen', 'kinderfreizeitprojekt',
    ],
}

# Marker that separates the agreement itself from the cover email.
EMAIL_MARKER = 'English version below!'
EMAIL_EN_MARKER = 'English version'


def para_text(p):
    parts = []
    for node in p.iter():
        if node.tag == W + 't':
            parts.append(node.text or '')
        elif node.tag == W + 'tab':
            parts.append('\t')
        elif node.tag == W + 'br':
            parts.append('\n')
        elif node.tag == W + 'fldSimple':
            m = re.search(r'MERGEFIELD\s+"?([^"\s\\]+)', node.get(W + 'instr', ''))
            if m:
                parts.append('\u00ab%s\u00bb' % m.group(1))
    return ''.join(parts)


def para_style(p):
    pr = p.find(W + 'pPr')
    if pr is None:
        return None
    s = pr.find(W + 'pStyle')
    return s.get(W + 'val') if s is not None else None


def load_paragraphs(path):
    z = zipfile.ZipFile(path)
    root = ET.fromstring(z.read('word/document.xml'))
    body = root.find(W + 'body')
    return [(para_style(p), para_text(p)) for p in body.iter(W + 'p')]


def clean(text):
    """Normalise whitespace without touching the wording."""
    text = text.replace('\u00a0', ' ')
    text = re.sub(r'[ \t]+', ' ', text)
    return text.strip()


def strip_number(title):
    """WA headings carry a literal "1. " prefix; WE numbers them automatically."""
    return re.sub(r'^\d+\.\s*', '', title).strip()


# A clause heading is short. Anything longer is body prose that merely carries
# the heading style — see is_heading().
MAX_HEADING_LEN = 90


def is_heading(style, text):
    """Whether a paragraph starts a clause.

    Style alone is not reliable: in the Wassertorplatz template two headings
    lost their Überschrift-2 style and one body paragraph gained it. So a
    paragraph counts as a heading if it is styled as one OR is numbered
    "N. Title" (WA numbers its headings literally; WE auto-numbers them), and in
    either case is short enough to be a title rather than prose.
    """
    if not text or len(text) > MAX_HEADING_LEN:
        return False
    return style == 'berschrift2' or bool(re.match(r'^\d+\.\s+\S', text))


def extract_clauses(paras, anomalies=None):
    """Every clause heading with the lines that follow it.

    Works line by line rather than paragraph by paragraph: in the Wassertorplatz
    template a clause body and the *next* clause's heading share one paragraph,
    separated by line breaks, so paragraph-level detection would swallow the
    heading.
    """
    out = []
    current = None
    for style, text in paras:
        raw_lines = [clean(l) for l in text.split('\n')]
        lines = [l for l in raw_lines if l]
        for idx, t in enumerate(lines):
            if is_heading(style, t):
                if anomalies is not None:
                    if style != 'berschrift2':
                        anomalies.append(f'heading not styled as Überschrift 2: "{t}"')
                    if idx > 0:
                        anomalies.append(
                            f'heading shares a paragraph with the previous clause body: "{t}"'
                        )
                current = {'title': strip_number(t), 'body': []}
                out.append(current)
                continue

            if anomalies is not None and style == 'berschrift2' and len(t) > MAX_HEADING_LEN:
                anomalies.append(f'body text carries the heading style: "{t[:60]}…"')

            if current is not None:
                if t.startswith(EMAIL_MARKER):
                    current = None
                    continue
                current['body'].append(t)
    return out


def split_sections(paras):
    """Agreement paragraphs vs the cover-email paragraphs."""
    for i, (_, text) in enumerate(paras):
        if clean(text).startswith(EMAIL_MARKER):
            return paras[:i], paras[i:]
    return paras, []


def extract_email(paras):
    """Cover email, split into the German and English versions."""
    texts = [clean(t) for _, t in paras if clean(t)]
    if texts and texts[0].startswith(EMAIL_MARKER):
        texts = texts[1:]
    for i, t in enumerate(texts):
        # The English half starts at a bare "English version" line.
        if t.strip().lower() == EMAIL_EN_MARKER.lower():
            return '\n'.join(texts[:i]).strip(), '\n'.join(texts[i + 1:]).strip()
    return '\n'.join(texts).strip(), ''


def ts_string(s):
    return (
        '"' + s.replace('\\', '\\\\').replace('"', '\\"').replace('\n', '\\n') + '"'
    )


def main():
    args = dict(a.split('=', 1) for a in sys.argv[1:])
    if not args:
        print(__doc__, file=sys.stderr)
        sys.exit(1)

    sets, emails = {}, {}

    for code, path in args.items():
        paras = load_paragraphs(path)
        agreement, email_paras = split_sections(paras)
        anomalies = []
        clauses = extract_clauses(agreement, anomalies)
        for a in anomalies:
            print(f'  [{code}] {a}', file=sys.stderr)

        ids = CLAUSE_IDS[code]
        n = len(ids)
        if len(clauses) < n:
            raise SystemExit(
                f'{code}: expected at least {n} clauses, found {len(clauses)}'
            )
        de, en = clauses[:n], clauses[n:n * 2]
        if len(en) < n:
            raise SystemExit(
                f'{code}: found {len(de)} German clauses but only {len(en)} English'
            )

        sets[code] = [
            {
                'id': ids[i],
                'titleDe': de[i]['title'],
                'titleEn': en[i]['title'],
                'bodyDe': '\n'.join(de[i]['body']),
                'bodyEn': '\n'.join(en[i]['body']),
            }
            for i in range(n)
        ]
        emails[code] = extract_email(email_paras)

    print('// GENERATED FILE — do not edit by hand.')
    print('// Source: packages/documents/scripts/import-nv-docx.py, run against the')
    print("// owner's Word templates. The Nutzungsvereinbarung is a binding contract:")
    print('// its wording is extracted mechanically so it is never retyped or')
    print('// paraphrased. To update, re-run the importer and review the diff.')
    print("import type { NvClause } from './nv-contract.ts';")
    print()
    print('export const NV_CLAUSE_SETS: Record<string, NvClause[]> = {')
    for code, clauses in sets.items():
        print(f'  {code}: [')
        for c in clauses:
            print('    {')
            print(f"      id: {ts_string(c['id'])},")
            print(f"      titleDe: {ts_string(c['titleDe'])},")
            print(f"      titleEn: {ts_string(c['titleEn'])},")
            print(f"      bodyDe: {ts_string(c['bodyDe'])},")
            print(f"      bodyEn: {ts_string(c['bodyEn'])},")
            print('    },')
        print('  ],')
    print('};')
    print()
    print('export const NV_EMAIL_TEMPLATES: Record<string, { de: string; en: string }> = {')
    for code, (de, en) in emails.items():
        print(f'  {code}: {{')
        print(f'    de: {ts_string(de)},')
        print(f'    en: {ts_string(en)},')
        print('  },')
    print('};')


if __name__ == '__main__':
    main()
