// Builds the Nutzungsvereinbarung as print-ready HTML. Kept separate from the
// PDF renderer so the markup can be unit-tested (and previewed in a browser)
// without launching Chromium.

import {
  ORGANISATION,
  NV_CLAUSES,
  missingClauseBodies,
  type NvClause,
  type NvData,
  type Lang,
} from './nv-contract.ts';

export function escapeHtml(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function fmtDateTime(d: Date, lang: Lang): string {
  return new Intl.DateTimeFormat(lang === 'en' ? 'en-GB' : 'de-DE', {
    dateStyle: 'long',
    timeStyle: 'short',
    timeZone: 'Europe/Berlin',
  }).format(d);
}

function fmtDate(d: Date, lang: Lang): string {
  return new Intl.DateTimeFormat(lang === 'en' ? 'en-GB' : 'de-DE', {
    dateStyle: 'long',
    timeZone: 'Europe/Berlin',
  }).format(d);
}

function euro(n: number | null | undefined, lang: Lang): string {
  if (n === null || n === undefined) return '—';
  return new Intl.NumberFormat(lang === 'en' ? 'en-GB' : 'de-DE', {
    style: 'currency',
    currency: 'EUR',
  }).format(n);
}

const L = {
  de: {
    title: 'Nutzungsvereinbarung',
    between: 'zwischen',
    and: 'und',
    renter: 'Nutzer*in',
    location: 'Veranstaltungsort',
    period: 'Nutzungszeit',
    persons: 'Anzahl Personen',
    fee: 'Nutzungsentgelt',
    deposit: 'Kaution',
    payBy: 'Zahlung bis',
    reference: 'Verwendungszweck',
    bank: 'Bankverbindung',
    idRequired:
      'Für diese Veranstaltung ist zusätzlich eine Kopie des Ausweises hochzuladen.',
    signature: 'Unterschrift Nutzer*in',
    place: 'Ort, Datum',
    contractNo: 'Vertragsnummer',
    draftWarning:
      'ENTWURF — nicht rechtsverbindlich. Es fehlt noch der verbindliche Klauseltext.',
    missingClause: 'Klauseltext fehlt noch',
  },
  en: {
    title: 'Terms of Use Agreement',
    between: 'between',
    and: 'and',
    renter: 'User',
    location: 'Venue',
    period: 'Period of use',
    persons: 'Number of people',
    fee: 'Usage fee',
    deposit: 'Deposit',
    payBy: 'Payment due',
    reference: 'Payment reference',
    bank: 'Bank details',
    idRequired:
      'For this event a copy of an identity document must additionally be uploaded.',
    signature: 'Signature of user',
    place: 'Place, date',
    contractNo: 'Contract number',
    draftWarning: 'DRAFT — not legally binding. The binding clause text is still missing.',
    missingClause: 'clause text still missing',
  },
} as const;

const STYLES = `
  @page { size: A4; margin: 20mm 18mm 22mm; }
  * { box-sizing: border-box; }
  body { font: 10.5pt/1.5 "Helvetica Neue", Helvetica, Arial, sans-serif; color: #111; margin: 0; }
  h1 { font-size: 17pt; margin: 0 0 2mm; }
  h2 { font-size: 11pt; margin: 0 0 4mm; font-weight: 600; color: #444; }
  .draft { border: 1.5pt solid #b45309; background: #fff7ed; color: #7c2d12;
           padding: 3mm 4mm; margin: 0 0 6mm; font-weight: 600; }
  table.facts { width: 100%; border-collapse: collapse; margin: 0 0 6mm; }
  table.facts th, table.facts td { text-align: left; vertical-align: top;
           padding: 1.6mm 0; border-bottom: 0.4pt solid #ddd; }
  table.facts th { width: 42mm; font-weight: 600; color: #444; }
  ol.clauses { padding-left: 6mm; margin: 0 0 8mm; }
  ol.clauses > li { margin: 0 0 3.5mm; }
  ol.clauses .ct { font-weight: 600; }
  .todo { color: #b45309; font-style: italic; }
  .bank { border: 0.4pt solid #ccc; padding: 3mm 4mm; margin: 0 0 8mm; }
  .sign { margin-top: 14mm; display: flex; gap: 12mm; }
  .sign > div { flex: 1; border-top: 0.6pt solid #333; padding-top: 2mm;
           font-size: 9pt; color: #444; }
  .note { font-size: 9pt; color: #555; }
`;

function clauseHtml(clauses: NvClause[], lang: Lang, t: (typeof L)['de']): string {
  const bodyKey = lang === 'en' ? 'bodyEn' : 'bodyDe';
  const titleKey = lang === 'en' ? 'titleEn' : 'titleDe';

  return clauses
    .map((c) => {
      const body = c[bodyKey].trim();
      const rendered = body
        ? escapeHtml(body)
        : `<span class="todo">[${escapeHtml(t.missingClause)}: ${escapeHtml(c.id)}]</span>`;
      return `<li><span class="ct">${escapeHtml(c[titleKey])}.</span> ${rendered}</li>`;
    })
    .join('\n');
}

export interface RenderOptions {
  clauses?: NvClause[];
  /** Render even though clause bodies are missing (marks the doc as a draft). */
  allowDraft?: boolean;
}

/**
 * Build the agreement HTML. Throws if clause text is missing unless
 * `allowDraft` is set — in which case the document is clearly stamped DRAFT so
 * an unfinished contract cannot be mistaken for a binding one.
 */
export function buildNutzungsvereinbarungHtml(data: NvData, opts: RenderOptions = {}): string {
  const clauses = opts.clauses ?? NV_CLAUSES;
  const lang = data.lang;
  const t = L[lang];
  const missing = missingClauseBodies(clauses, lang);

  if (missing.length > 0 && !opts.allowDraft) {
    throw new Error(
      `Refusing to render Nutzungsvereinbarung: clause text missing for [${missing.join(', ')}]. ` +
        `Copy the verbatim wording from the Word template, or pass { allowDraft: true } for a preview.`,
    );
  }

  const c = data.customer;
  const renterName =
    [c.salutation, c.firstName, c.lastName].filter(Boolean).join(' ').trim() || '—';

  const rows: Array<[string, string]> = [
    [t.renter, escapeHtml(renterName)],
  ];
  if (c.organization) rows.push(['', escapeHtml(c.organization)]);
  if (c.addressFull) rows.push(['', escapeHtml(c.addressFull)]);
  rows.push([t.location, `${escapeHtml(data.locationName)}, ${escapeHtml(data.locationAddress)}`]);
  rows.push([
    t.period,
    `${escapeHtml(fmtDateTime(data.startsAt, lang))} – ${escapeHtml(fmtDateTime(data.endsAt, lang))}`,
  ]);
  rows.push([t.persons, data.persons != null ? String(data.persons) : '—']);
  rows.push([t.fee, escapeHtml(euro(data.priceTotal, lang))]);
  if (data.caution != null) rows.push([t.deposit, escapeHtml(euro(data.caution, lang))]);
  if (data.payBy) rows.push([t.payBy, escapeHtml(fmtDate(data.payBy, lang))]);
  if (data.paymentReference) rows.push([t.reference, escapeHtml(data.paymentReference)]);

  const factRows = rows
    .map(([k, v]) => `<tr><th>${escapeHtml(k)}</th><td>${v}</td></tr>`)
    .join('\n');

  return `<!doctype html>
<html lang="${lang}">
<head>
<meta charset="utf-8">
<title>${escapeHtml(t.title)}${data.contractNumber ? ` ${escapeHtml(data.contractNumber)}` : ''}</title>
<style>${STYLES}</style>
</head>
<body>
${missing.length > 0 ? `<div class="draft">${escapeHtml(t.draftWarning)}</div>` : ''}
<h1>${escapeHtml(t.title)}</h1>
<h2>${escapeHtml(t.between)} ${escapeHtml(ORGANISATION.name)} ${escapeHtml(t.and)} ${escapeHtml(renterName)}</h2>
${data.contractNumber ? `<p class="note">${escapeHtml(t.contractNo)}: ${escapeHtml(data.contractNumber)}</p>` : ''}

<table class="facts">
${factRows}
</table>

<ol class="clauses">
${clauseHtml(clauses, lang, t)}
</ol>

<div class="bank">
  <strong>${escapeHtml(t.bank)}</strong><br>
  ${escapeHtml(ORGANISATION.name)} · ${escapeHtml(ORGANISATION.bank)}<br>
  IBAN ${escapeHtml(ORGANISATION.iban)}
</div>

${data.needsIdUpload ? `<p class="note"><strong>${escapeHtml(t.idRequired)}</strong></p>` : ''}

<div class="sign">
  <div>${escapeHtml(t.place)}</div>
  <div>${escapeHtml(t.signature)}</div>
</div>
</body>
</html>`;
}
