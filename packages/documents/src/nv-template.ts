// Builds the Nutzungsvereinbarung as print-ready HTML, following the structure
// of the owner's Word template: letterhead, parties, welcome, the numbered
// clauses (verbatim, with merge fields filled), confirmation, signature lines,
// footer. Kept separate from the PDF renderer so it can be unit-tested and
// previewed in a browser without launching Chromium.

import {
  ORGANISATION,
  getClausesForLocation,
  mergeFields,
  applyMergeFields,
  formatDate,
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

const L = {
  de: {
    title: 'Nutzungsvereinbarung',
    between: 'zwischen:',
    and: 'und:',
    nameLabel: 'Name, Vorname:',
    orgLabel: 'Einrichtung:',
    addressLabel: 'Adresse:',
    phoneLabel: 'Telefon:',
    emailLabel: 'E-Mail:',
    welcomeTitle: 'Herzlich willkommen!',
    confirm:
      'Hiermit bestätige ich, dass ich die vorstehenden Bestimmungen gelesen habe und damit einverstanden bin.',
    date: 'Datum',
    signUser: 'Unterschrift Nutzer*in',
    signStaff: 'Unterschrift Mitarbeiter*in',
    paymentMarker: 'Zahlungsdaten',
    footer: [
      'Die drei Verkehrsschulen des Bezirks werden von KidBike e.V. in Kooperation mit dem Bezirksamt Friedrichshain-Kreuzberg organisiert.',
      `${ORGANISATION.name} · ${ORGANISATION.address}`,
      `E-Mail: ${ORGANISATION.email} · Web: ${ORGANISATION.web}`,
    ],
  },
  en: {
    title: 'Usage Agreement',
    between: 'between:',
    and: 'and:',
    nameLabel: 'Last name, first name:',
    orgLabel: 'Institution:',
    addressLabel: 'Address:',
    phoneLabel: 'Phone number:',
    emailLabel: 'E-Mail address:',
    welcomeTitle: 'Welcome!',
    confirm: 'I hereby confirm that I have read the above terms and agree to them.',
    date: 'Date',
    signUser: 'Signature of user',
    signStaff: 'Signature of staff member',
    paymentMarker: 'Payment details',
    footer: [
      'The three traffic schools of the district are organised by KidBike e.V. in cooperation with the Friedrichshain-Kreuzberg district office.',
      `${ORGANISATION.name} · ${ORGANISATION.address}`,
      `E-Mail: ${ORGANISATION.email} · Web: ${ORGANISATION.web}`,
    ],
  },
} as const;

const STYLES = `
  @page { size: A4; margin: 18mm 18mm 20mm; }
  * { box-sizing: border-box; }
  body { font: 10pt/1.45 "Helvetica Neue", Helvetica, Arial, sans-serif; color: #111; margin: 0; }
  .head { display: flex; justify-content: space-between; align-items: flex-start;
          border-bottom: 0.8pt solid #333; padding-bottom: 3mm; margin-bottom: 6mm; }
  .head h1 { font-size: 16pt; margin: 0; }
  .head .venue { text-align: right; font-size: 9pt; color: #444; white-space: pre-line; }
  .parties { margin: 0 0 6mm; }
  .parties table { border-collapse: collapse; }
  .parties th { text-align: left; font-weight: 600; padding: 0.8mm 6mm 0.8mm 0;
                vertical-align: top; color: #333; white-space: nowrap; }
  .parties td { padding: 0.8mm 0; vertical-align: top; }
  .lede { margin: 0 0 6mm; }
  .lede h2 { font-size: 11pt; margin: 0 0 1.5mm; }
  ol.clauses { padding-left: 6mm; margin: 0 0 8mm; }
  ol.clauses > li { margin: 0 0 4mm; page-break-inside: avoid; }
  ol.clauses .ct { font-weight: 600; display: block; margin-bottom: 1mm; }
  ol.clauses p { margin: 0 0 1.5mm; }
  ol.clauses ul { margin: 0 0 1.5mm; padding-left: 5mm; }
  table.kv { border-collapse: collapse; margin: 1.5mm 0; }
  table.kv th { text-align: left; font-weight: 500; color: #333; padding: 0.6mm 6mm 0.6mm 0;
                vertical-align: top; white-space: nowrap; }
  table.kv td { padding: 0.6mm 0; vertical-align: top; }
  .confirm { margin: 8mm 0 0; }
  .sign { margin-top: 12mm; display: flex; gap: 10mm; }
  .sign > div { flex: 1; border-top: 0.6pt solid #333; padding-top: 1.5mm;
                font-size: 8.5pt; color: #444; }
  .foot { margin-top: 10mm; padding-top: 3mm; border-top: 0.4pt solid #ccc;
          font-size: 8pt; color: #555; }
  .foot p { margin: 0 0 1mm; }
`;

/** A clause body line that is a label for the value on the next line. */
const isLabel = (s: string) => /:$/.test(s);

/**
 * Render one clause body.
 *
 * The Word tables flatten to runs of lines, so two shapes get rebuilt here:
 *   - a run of "Label:" lines followed by an equal number of value lines
 *     (the booking facts in clause 1);
 *   - everything after a "Zahlungsdaten" / "Payment details" marker, which is
 *     alternating label/value lines (the payment block in clause 2).
 * Anything else renders as paragraphs, with "- " lines grouped into a list.
 */
export function renderClauseBody(body: string, lang: Lang): string {
  const t = L[lang];
  const lines = body.split('\n').map((l) => l.trim()).filter(Boolean);
  const out: string[] = [];
  let i = 0;

  const kvTable = (pairs: Array<[string, string]>) =>
    `<table class="kv">${pairs
      .map(
        ([k, v]) =>
          `<tr><th>${escapeHtml(k)}</th><td>${escapeHtml(v)}</td></tr>`,
      )
      .join('')}</table>`;

  while (i < lines.length) {
    const line = lines[i];

    // Payment block: alternating label / value to the end.
    if (line === t.paymentMarker) {
      const rest = lines.slice(i + 1);
      const pairs: Array<[string, string]> = [];
      for (let j = 0; j + 1 < rest.length; j += 2) {
        pairs.push([rest[j], rest[j + 1]]);
      }
      out.push(`<p class="ct">${escapeHtml(line)}</p>`);
      if (pairs.length) out.push(kvTable(pairs));
      break;
    }

    // Label run followed by an equal-length value run.
    if (isLabel(line)) {
      let n = 0;
      while (i + n < lines.length && isLabel(lines[i + n])) n++;
      const values = lines.slice(i + n, i + n * 2);
      if (n >= 2 && values.length === n && !values.some(isLabel)) {
        out.push(
          kvTable(
            Array.from({ length: n }, (_, k) => [lines[i + k], values[k]] as [string, string]),
          ),
        );
        i += n * 2;
        continue;
      }
    }

    // Bullet list.
    if (line.startsWith('- ')) {
      const items: string[] = [];
      while (i < lines.length && lines[i].startsWith('- ')) {
        items.push(lines[i].slice(2).trim());
        i++;
      }
      out.push(`<ul>${items.map((x) => `<li>${escapeHtml(x)}</li>`).join('')}</ul>`);
      continue;
    }

    out.push(`<p>${escapeHtml(line)}</p>`);
    i++;
  }

  return out.join('\n');
}

export interface RenderOptions {
  /** Override the clause set (tests, or a location not yet imported). */
  clauses?: NvClause[];
  /** Override the document language; defaults to data.lang. */
  lang?: Lang;
}

/** Build the agreement HTML for one language. */
export function buildNutzungsvereinbarungHtml(data: NvData, opts: RenderOptions = {}): string {
  const lang = opts.lang ?? data.lang;
  const t = L[lang];
  const clauses = opts.clauses ?? getClausesForLocation(data.locationCode);
  const fields = mergeFields({ ...data, lang });

  const c = data.customer;
  const name = [c.lastName, c.firstName].filter(Boolean).join(', ') || '—';

  const partyRows: Array<[string, string]> = [[t.nameLabel, name]];
  if (c.organization) partyRows.push([t.orgLabel, c.organization]);
  if (c.addressFull) partyRows.push([t.addressLabel, c.addressFull]);
  if (c.phone) partyRows.push([t.phoneLabel, c.phone]);
  if (c.email) partyRows.push([t.emailLabel, c.email]);

  const clausesHtml = clauses
    .map((cl) => {
      const title = lang === 'en' ? cl.titleEn : cl.titleDe;
      const body = applyMergeFields(lang === 'en' ? cl.bodyEn : cl.bodyDe, fields);
      return `<li><span class="ct">${escapeHtml(title)}</span>\n${renderClauseBody(body, lang)}</li>`;
    })
    .join('\n');

  const venue = `${data.locationName}\n${data.locationAddress}${
    data.locationPhone ? `\nTel.: ${data.locationPhone}` : ''
  }`;

  return `<!doctype html>
<html lang="${lang}">
<head>
<meta charset="utf-8">
<title>${escapeHtml(t.title)} — ${escapeHtml(data.locationName)}</title>
<style>${STYLES}</style>
</head>
<body>
<div class="head">
  <h1>${escapeHtml(t.title)}</h1>
  <div class="venue">${escapeHtml(venue)}</div>
</div>

<div class="parties">
  <p><strong>${escapeHtml(t.between)}</strong> ${escapeHtml(ORGANISATION.name)}, ${escapeHtml(ORGANISATION.address)}</p>
  <p><strong>${escapeHtml(t.and)}</strong></p>
  <table>
    ${partyRows.map(([k, v]) => `<tr><th>${escapeHtml(k)}</th><td>${escapeHtml(v)}</td></tr>`).join('\n    ')}
  </table>
</div>

<div class="lede">
  <h2>${escapeHtml(t.welcomeTitle)}</h2>
</div>

<ol class="clauses">
${clausesHtml}
</ol>

<p class="confirm">${escapeHtml(t.confirm)}</p>

<div class="sign">
  <div>Berlin, ${escapeHtml(formatDate(new Date(), lang))} — ${escapeHtml(t.date)}</div>
  <div>${escapeHtml(t.signUser)}</div>
  <div>${escapeHtml(t.signStaff)}</div>
</div>

<div class="foot">
${t.footer.map((f) => `  <p>${escapeHtml(f)}</p>`).join('\n')}
</div>
</body>
</html>`;
}
