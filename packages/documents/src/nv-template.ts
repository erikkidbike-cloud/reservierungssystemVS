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
    // Transcribed verbatim from the owner's own signed agreements (the lead
    // paragraph is part of the Word letterhead, not of any numbered clause,
    // which is why the clause importer never picked it up).
    welcomeBody:
      'Die Verkehrsschulen Friedrichshain-Kreuzberg fördern die Verkehrssicherheit, die Gesundheit ' +
      'und das Umweltbewusstsein von Kindern und Erwachsenen mittels Verkehrserziehung auf ' +
      'umweltfreundlichen Fahrzeugen, Freude an der Bewegung und sinnvoller Freizeitgestaltung. ' +
      'Die Verkehrsschulen Friedrichshain-Kreuzberg sind auch Orte, an denen sich Nachbarn treffen ' +
      'und gemeinsam feiern.',
    confirm:
      'Hiermit bestätige ich, dass ich die vorstehenden Bestimmungen gelesen habe und damit einverstanden bin.',
    place: 'Berlin,',
    date: 'Datum',
    signUser: 'Unterschrift Nutzer*in',
    signStaff: 'Unterschrift Mitarbeiter*in',
    paymentMarker: 'Zahlungsdaten',
    footerNote:
      'Die drei Verkehrsschulen des Bezirks werden von KidBike e.V. in Kooperation mit dem ' +
      'Bezirksamt Friedrichshain-Kreuzberg organisiert.',
    footerContact: [
      ORGANISATION.name,
      ORGANISATION.street,
      ORGANISATION.city,
      `Leitung: ${ORGANISATION.leitung}`,
      `Tel. ${ORGANISATION.phone}`,
      `E-Mail: ${ORGANISATION.email}`,
      `Web: ${ORGANISATION.web}`,
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
    // Translation of the German lead paragraph above. Unlike the numbered
    // clauses (extracted mechanically from the owner's Word file, never
    // paraphrased) this is welcome copy, not contract text.
    welcomeBody:
      'The Friedrichshain-Kreuzberg traffic schools promote road safety, health and environmental ' +
      'awareness among children and adults through traffic education on environmentally friendly ' +
      'vehicles, enjoyment of exercise and meaningful leisure activities. The Friedrichshain-Kreuzberg ' +
      'traffic schools are also places where neighbours meet and celebrate together.',
    confirm: 'I hereby confirm that I have read the above terms and agree to them.',
    place: 'Berlin,',
    date: 'Date',
    signUser: 'Signature of user',
    signStaff: 'Signature of staff member',
    paymentMarker: 'Payment details',
    footerNote:
      'The three traffic schools of the district are organised by KidBike e.V. in cooperation with ' +
      'the Friedrichshain-Kreuzberg district office.',
    footerContact: [
      ORGANISATION.name,
      ORGANISATION.street,
      ORGANISATION.city,
      `Leitung: ${ORGANISATION.leitung}`,
      `Tel. ${ORGANISATION.phone}`,
      `E-Mail: ${ORGANISATION.email}`,
      `Web: ${ORGANISATION.web}`,
    ],
  },
} as const;

// The KidBike wordmark's blue, taken from the logo on the owner's own signed
// agreements. The letterhead reproduces the wordmark as styled text rather
// than an image so the document stays a single self-contained HTML file with
// no asset to lose; drop a real logo in by setting LOGO_SRC to a data: URI or
// an absolute URL and it is used instead.
const BRAND = '#1b6ca8';
const LOGO_SRC: string | null = null;

// Layout follows the owner's existing Word/PDF agreement closely: venue block
// top-left, wordmark top-right, the title under it, then zwischen:/und: with
// the party table, the welcome lead, the numbered clauses, the confirmation
// sentence, three signature lines, and a two-column footer.
const STYLES = `
  @page { size: A4; margin: 16mm 18mm 16mm; }
  * { box-sizing: border-box; }
  body { font: 10pt/1.45 "Helvetica Neue", Helvetica, Arial, sans-serif; color: #1a1a1a; margin: 0; }

  .head { display: flex; justify-content: space-between; align-items: flex-start; margin-bottom: 7mm; }
  .head .venue { font-size: 10pt; color: #1a1a1a; white-space: pre-line; line-height: 1.35; font-weight: 600; }
  .head .logo { text-align: right; }
  .head .logo img { height: 13mm; }
  .head .wordmark { font-size: 20pt; font-weight: 800; color: ${BRAND}; letter-spacing: -0.3pt;
                    line-height: 1; white-space: nowrap; }
  .head .wordmark span { font-weight: 400; font-size: 15pt; }

  h1 { font-size: 15pt; font-weight: 700; margin: 0 0 6mm; color: #111; }

  .parties { margin: 0 0 6mm; }
  .parties .between { margin: 0 0 3mm; }
  .parties .between .lbl { font-weight: 700; }
  .parties .org { margin: 1mm 0 0 14mm; white-space: pre-line; line-height: 1.35; }
  .parties .and { font-weight: 700; margin: 0 0 1.5mm; }
  .parties table { border-collapse: collapse; width: 100%; }
  .parties th { text-align: left; font-weight: 400; padding: 0.7mm 6mm 0.7mm 0;
                vertical-align: top; white-space: nowrap; width: 34mm; }
  .parties td { padding: 0.7mm 0; vertical-align: top; font-weight: 600; }

  .lede { margin: 0 0 6mm; }
  .lede h2 { font-size: 11pt; font-weight: 700; margin: 0 0 2mm; }
  .lede p { margin: 0; text-align: justify; }

  ol.clauses { list-style: none; counter-reset: clause; padding-left: 0; margin: 0 0 7mm; }
  ol.clauses > li { counter-increment: clause; margin: 0 0 4mm; page-break-inside: avoid; }
  ol.clauses .ct { font-weight: 700; display: block; margin-bottom: 1mm; color: #111; }
  ol.clauses .ct::before { content: counter(clause) ". "; }
  ol.clauses p { margin: 0 0 1.2mm; text-align: justify; }
  ol.clauses ul { margin: 0 0 1.2mm; padding-left: 5mm; }

  table.kv { border-collapse: collapse; margin: 1.5mm 0 1.5mm 0; }
  table.kv th { text-align: left; font-weight: 400; color: #1a1a1a; padding: 0.5mm 8mm 0.5mm 0;
                vertical-align: top; white-space: nowrap; }
  table.kv td { padding: 0.5mm 0; vertical-align: top; font-weight: 600; }

  .confirm { margin: 7mm 0 0; }

  .sign { margin-top: 16mm; display: flex; gap: 8mm; page-break-inside: avoid; }
  .sign > div { flex: 1; border-top: 0.7pt solid #1a1a1a; padding-top: 1.5mm; font-size: 8.5pt; }
  .sign .place { border: 0; padding-top: 0; align-self: flex-end; flex: 0 0 auto;
                 font-size: 10pt; padding-right: 2mm; }

  .foot { margin-top: 10mm; padding-top: 2.5mm; border-top: 0.5pt solid #bbb;
          font-size: 7.5pt; color: #555; display: flex; justify-content: space-between; gap: 10mm; }
  .foot .note { max-width: 85mm; }
  .foot .contact { text-align: right; white-space: pre-line; line-height: 1.35; }
  .foot p { margin: 0; }
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
  <div class="venue">${escapeHtml(venue)}</div>
  <div class="logo">${
    LOGO_SRC
      ? `<img src="${LOGO_SRC}" alt="${escapeHtml(ORGANISATION.name)}">`
      : `<div class="wordmark">KidBike <span>e.V.</span></div>`
  }</div>
</div>

<h1>${escapeHtml(t.title)}</h1>

<div class="parties">
  <div class="between">
    <span class="lbl">${escapeHtml(t.between)}</span>
    <div class="org">${escapeHtml(`${ORGANISATION.name}\n${ORGANISATION.street}\n${ORGANISATION.city}`)}</div>
  </div>
  <p class="and">${escapeHtml(t.and)}</p>
  <table>
    ${partyRows.map(([k, v]) => `<tr><th>${escapeHtml(k)}</th><td>${escapeHtml(v)}</td></tr>`).join('\n    ')}
  </table>
</div>

<div class="lede">
  <h2>${escapeHtml(t.welcomeTitle)}</h2>
  <p>${escapeHtml(t.welcomeBody)}</p>
</div>

<ol class="clauses">
${clausesHtml}
</ol>

<p class="confirm">${escapeHtml(t.confirm)}</p>

<div class="sign">
  <div class="place">${escapeHtml(t.place)}</div>
  <div>${escapeHtml(t.date)}</div>
  <div>${escapeHtml(t.signUser)}</div>
  <div>${escapeHtml(t.signStaff)}</div>
</div>

<div class="foot">
  <p class="note">${escapeHtml(t.footerNote)}</p>
  <p class="contact">${escapeHtml(t.footerContact.join('\n'))}</p>
</div>
</body>
</html>`;
}
