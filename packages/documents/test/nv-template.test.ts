import { test } from 'node:test';
import assert from 'node:assert/strict';
import { buildNutzungsvereinbarungHtml, escapeHtml } from '../src/nv-template.ts';
import { NV_CLAUSES, missingClauseBodies, ORGANISATION, type NvClause, type NvData } from '../src/nv-contract.ts';
import { getTermsForLocation } from '../src/terms.ts';

const baseData: NvData = {
  locationName: 'Verkehrsschule Weinstraße',
  locationAddress: 'Weinstraße 2, 10249 Berlin',
  customer: {
    salutation: 'Frau',
    firstName: 'Anna',
    lastName: 'Beispiel',
    organization: 'Kita Sonnenschein',
    addressFull: 'Musterweg 5, 10249 Berlin',
  },
  startsAt: new Date(2026, 2, 10, 10, 0),
  endsAt: new Date(2026, 2, 10, 14, 0),
  persons: 25,
  priceTotal: 100,
  caution: 200,
  paymentReference: 'FWE211BEAN',
  payBy: new Date(2026, 1, 24),
  needsIdUpload: false,
  lang: 'de',
};

// --- terms (verbatim content) ----------------------------------------------

test('WE gets all ten terms, including the parallel-use one', () => {
  const de = getTermsForLocation('WE', 'de');
  assert.equal(de.length, 10);
  assert.ok(de.some((t) => /Parallelnutzungen/.test(t)));
});

test('WA drops the parallel-use term and adds the key-handover one', () => {
  const de = getTermsForLocation('WA', 'de');
  assert.equal(de.length, 10); // one removed, one added
  assert.ok(!de.some((t) => /Parallel/i.test(t)));
  assert.ok(de.some((t) => /Schlüssel-Übergabe/.test(t)));
});

test('English terms mirror the German set', () => {
  assert.equal(getTermsForLocation('WE', 'en').length, 10);
  assert.ok(getTermsForLocation('WA', 'en').some((t) => /Key handover/.test(t)));
});

// --- safety: unfinished contracts must not render as final ------------------

test('every clause body is currently a placeholder awaiting the Word template', () => {
  assert.equal(missingClauseBodies(NV_CLAUSES, 'de').length, NV_CLAUSES.length);
});

test('refuses to render a final document while clause text is missing', () => {
  assert.throws(
    () => buildNutzungsvereinbarungHtml(baseData),
    /clause text missing/,
  );
});

test('renders a clearly-stamped DRAFT when allowDraft is set', () => {
  const html = buildNutzungsvereinbarungHtml(baseData, { allowDraft: true });
  assert.match(html, /ENTWURF/);
  assert.match(html, /Klauseltext fehlt noch/);
});

test('renders without the draft banner once all clauses are filled', () => {
  const filled: NvClause[] = NV_CLAUSES.map((c) => ({
    ...c,
    bodyDe: `Verbindlicher Text für ${c.id}.`,
    bodyEn: `Binding text for ${c.id}.`,
  }));
  const html = buildNutzungsvereinbarungHtml(baseData, { clauses: filled });
  assert.doesNotMatch(html, /ENTWURF/);
  assert.doesNotMatch(html, /fehlt noch/);
  assert.match(html, /Verbindlicher Text für nutzungszeit\./);
});

// --- merge fields -----------------------------------------------------------

test('merges booking and customer data into the document', () => {
  const html = buildNutzungsvereinbarungHtml(baseData, { allowDraft: true });
  assert.match(html, /Frau Anna Beispiel/);
  assert.match(html, /Kita Sonnenschein/);
  assert.match(html, /Verkehrsschule Weinstraße/);
  assert.match(html, /FWE211BEAN/);
  assert.match(html, /25/);
  assert.ok(html.includes(ORGANISATION.iban));
});

test('formats money and dates in the document language', () => {
  const de = buildNutzungsvereinbarungHtml(baseData, { allowDraft: true });
  assert.match(de, /100,00\s*€/);
  assert.match(de, /200,00\s*€/); // deposit

  const en = buildNutzungsvereinbarungHtml({ ...baseData, lang: 'en' }, { allowDraft: true });
  assert.match(en, /€100\.00/);
  assert.match(en, /Terms of Use Agreement/);
});

test('omits the deposit row when there is no deposit', () => {
  // Checks the facts-table row specifically: "Kaution" also appears legitimately
  // in the clause title "Nutzungsentgelt und Kaution", which must stay.
  const withDeposit = buildNutzungsvereinbarungHtml(baseData, { allowDraft: true });
  assert.match(withDeposit, /<th>Kaution<\/th>/);

  const without = buildNutzungsvereinbarungHtml(
    { ...baseData, caution: null },
    { allowDraft: true },
  );
  assert.doesNotMatch(without, /<th>Kaution<\/th>/);
  assert.match(without, /Nutzungsentgelt und Kaution/); // clause title still present
});

test('shows the ID-upload notice only when the event requires one', () => {
  const without = buildNutzungsvereinbarungHtml(baseData, { allowDraft: true });
  assert.doesNotMatch(without, /Ausweis/);

  const with_ = buildNutzungsvereinbarungHtml(
    { ...baseData, needsIdUpload: true },
    { allowDraft: true },
  );
  assert.match(with_, /Kopie des Ausweises/);
});

// --- escaping ---------------------------------------------------------------

test('escapes HTML in merged customer data', () => {
  const html = buildNutzungsvereinbarungHtml(
    {
      ...baseData,
      customer: { ...baseData.customer, organization: '<script>alert(1)</script>' },
    },
    { allowDraft: true },
  );
  assert.doesNotMatch(html, /<script>alert/);
  assert.match(html, /&lt;script&gt;/);
});

test('escapeHtml handles the usual suspects', () => {
  assert.equal(escapeHtml(`<&">'`), '&lt;&amp;&quot;&gt;&#39;');
});
