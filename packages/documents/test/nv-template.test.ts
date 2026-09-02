import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  buildNutzungsvereinbarungHtml,
  renderClauseBody,
  escapeHtml,
} from '../src/nv-template.ts';
import {
  getClausesForLocation,
  hasClausesForLocation,
  applyMergeFields,
  mergeFields,
  remainingMergeFields,
  ORGANISATION,
  type NvData,
} from '../src/nv-contract.ts';
import { buildCoverEmail } from '../src/email.ts';
import { getTermsForLocation } from '../src/terms.ts';

const baseData: NvData = {
  locationCode: 'WE',
  locationName: 'Verkehrsschule Weinstraße',
  locationAddress: 'Weinstraße 2, 10249 Berlin',
  locationPhone: '030 – 241 91 68',
  customer: {
    salutation: 'Frau',
    firstName: 'Anna',
    lastName: 'Beispiel',
    organization: 'Kita Sonnenschein',
    addressFull: 'Musterweg 5, 10249 Berlin',
    email: 'anna@example.com',
    phone: '030 1234567',
  },
  startsAt: new Date(2026, 2, 10, 10, 0),
  endsAt: new Date(2026, 2, 10, 14, 0),
  persons: 25,
  eventType: 'Kindergeburtstag',
  priceTotal: 100,
  caution: 200,
  paymentReference: 'FWE211BEAN',
  payBy: new Date(2026, 1, 24),
  needsIdUpload: false,
  bookingOrder: 'erste',
  signingLink: 'https://example.org/sign/abc',
  lang: 'de',
};

// --- clause sets ------------------------------------------------------------

test('WE has 16 clauses, WA has 11', () => {
  assert.equal(getClausesForLocation('WE').length, 16);
  assert.equal(getClausesForLocation('WA').length, 11);
});

test('every clause has verbatim DE and EN text', () => {
  for (const code of ['WE', 'WA']) {
    for (const c of getClausesForLocation(code)) {
      assert.ok(c.titleDe.trim(), `${code}/${c.id} missing titleDe`);
      assert.ok(c.titleEn.trim(), `${code}/${c.id} missing titleEn`);
      assert.ok(c.bodyDe.trim().length > 20, `${code}/${c.id} missing bodyDe`);
      assert.ok(c.bodyEn.trim().length > 20, `${code}/${c.id} missing bodyEn`);
    }
  }
});

test('WA differs from WE where the contracts genuinely differ', () => {
  const wa = getClausesForLocation('WA');
  const we = getClausesForLocation('WE');
  // WA charges no deposit, so it has no combined fee+deposit clause.
  assert.ok(we.some((c) => c.id === 'entgelt_kaution'));
  assert.ok(wa.some((c) => c.id === 'entgelt'));
  assert.ok(!wa.some((c) => c.id === 'entgelt_kaution'));
  // WA's children's project runs Mon–Fri; WE's runs Mon–Sat.
  const waKids = wa.find((c) => c.id === 'kinderfreizeitprojekt')!;
  const weKids = we.find((c) => c.id === 'kinderfreizeitprojekt')!;
  assert.match(waKids.bodyDe, /Montags bis freitags/);
  assert.match(weKids.bodyDe, /Montags bis samstags/);
});

test('an unknown location fails loudly rather than rendering a wrong contract', () => {
  assert.equal(hasClausesForLocation('WI'), false);
  assert.throws(() => getClausesForLocation('WI'), /No Nutzungsvereinbarung clauses/);
});

// --- merge fields -----------------------------------------------------------

test('every merge field in the clause text has a value', () => {
  const fields = mergeFields(baseData);
  for (const code of ['WE', 'WA']) {
    for (const c of getClausesForLocation(code)) {
      for (const body of [c.bodyDe, c.bodyEn]) {
        for (const name of remainingMergeFields(body)) {
          assert.ok(
            name in fields,
            `${code}/${c.id}: no value defined for merge field «${name}»`,
          );
        }
      }
    }
  }
});

test('rendered document contains no unfilled merge fields', () => {
  for (const code of ['WE', 'WA'] as const) {
    for (const lang of ['de', 'en'] as const) {
      const html = buildNutzungsvereinbarungHtml(
        { ...baseData, locationCode: code, lang },
        { lang },
      );
      assert.deepEqual(remainingMergeFields(html), [], `${code}/${lang}`);
    }
  }
});

test('salutation inflection follows the German template', () => {
  assert.equal(mergeFields(baseData).GeehrteGeehrterGeehrte, 'geehrte');
  assert.equal(
    mergeFields({ ...baseData, customer: { ...baseData.customer, salutation: 'Herr' } })
      .GeehrteGeehrterGeehrte,
    'geehrter',
  );
  assert.equal(
    mergeFields({ ...baseData, customer: { ...baseData.customer, salutation: null } })
      .GeehrteGeehrterGeehrte,
    'geehrte/r',
  );
});

test('the ID-upload paragraph appears only when required', () => {
  assert.equal(mergeFields(baseData).TxtAusweisDE, '');
  assert.match(
    mergeFields({ ...baseData, needsIdUpload: true }).TxtAusweisDE,
    /Kopie Ihres Ausweises/,
  );
});

test('unknown merge fields collapse to nothing rather than leaking markup', () => {
  assert.equal(applyMergeFields('a «Unbekannt» b', {}), 'a  b');
});

// --- document output --------------------------------------------------------

test('merges booking and customer data into the document', () => {
  const html = buildNutzungsvereinbarungHtml(baseData);
  assert.match(html, /Beispiel, Anna/);
  assert.match(html, /Kita Sonnenschein/);
  assert.match(html, /Verkehrsschule Weinstraße/);
  assert.match(html, /FWE211BEAN/);
  assert.ok(html.includes(ORGANISATION.iban));
});

test('renders the clause wording verbatim', () => {
  const html = buildNutzungsvereinbarungHtml(baseData);
  assert.match(html, /Bierzeltgarnituren und Pavillons/);
  assert.match(html, /Vertragsstrafe von 100 €/);
  assert.match(html, /höchstens 300 €/);
});

test('language selection switches both titles and bodies', () => {
  const en = buildNutzungsvereinbarungHtml(baseData, { lang: 'en' });
  assert.match(en, /Usage Agreement/);
  assert.match(en, /Beer tent sets and pavilions/);
  assert.doesNotMatch(en, /Bierzeltgarnituren/);
});

test('formats money and dates per language', () => {
  assert.match(buildNutzungsvereinbarungHtml(baseData), /100,00\s*€/);
  assert.match(buildNutzungsvereinbarungHtml(baseData, { lang: 'en' }), /€100\.00/);
});

test('escapes HTML in merged customer data', () => {
  const html = buildNutzungsvereinbarungHtml({
    ...baseData,
    customer: { ...baseData.customer, organization: '<script>alert(1)</script>' },
  });
  assert.doesNotMatch(html, /<script>alert/);
  assert.match(html, /&lt;script&gt;/);
});

test('escapeHtml handles the usual suspects', () => {
  assert.equal(escapeHtml(`<&">'`), '&lt;&amp;&quot;&gt;&#39;');
});

// --- clause body layout -----------------------------------------------------

test('a label run followed by values renders as a table', () => {
  const html = renderClauseBody('Datum:\nUhrzeit:\n10. März 2026\n10:00 - 14:00', 'de');
  assert.match(html, /<table class="kv">/);
  assert.match(html, /<th>Datum:<\/th><td>10\. März 2026<\/td>/);
  assert.match(html, /<th>Uhrzeit:<\/th><td>10:00 - 14:00<\/td>/);
});

test('the payment block renders as label/value pairs', () => {
  const html = renderClauseBody('Zahlungsdaten\nBetrag\n300,00 €\nIBAN\nDE09', 'de');
  assert.match(html, /<th>Betrag<\/th><td>300,00 €<\/td>/);
  assert.match(html, /<th>IBAN<\/th><td>DE09<\/td>/);
});

test('dash lines render as a bullet list', () => {
  const html = renderClauseBody('Erst verbindlich, wenn:\n- Betrag da\n- NV signiert', 'de');
  assert.match(html, /<ul><li>Betrag da<\/li><li>NV signiert<\/li><\/ul>/);
});

test('plain prose renders as paragraphs', () => {
  assert.equal(renderClauseBody('Ein Satz.', 'de'), '<p>Ein Satz.</p>');
});

// --- cover email ------------------------------------------------------------

test('cover email is filled and language-specific', () => {
  const de = buildCoverEmail(baseData, 'de');
  assert.match(de.subject, /Nutzungsvereinbarung/);
  assert.match(de.body, /Sehr geehrte Frau Beispiel/);
  assert.match(de.body, /https:\/\/example\.org\/sign\/abc/);
  assert.deepEqual(remainingMergeFields(de.body), []);

  const en = buildCoverEmail(baseData, 'en');
  assert.match(en.subject, /Usage agreement/);
  assert.match(en.body, /Dear Anna Beispiel/);
  assert.deepEqual(remainingMergeFields(en.body), []);
});

test('WA has its own cover email', () => {
  const de = buildCoverEmail({ ...baseData, locationCode: 'WA' }, 'de');
  assert.ok(de.body.length > 100);
  assert.deepEqual(remainingMergeFields(de.body), []);
});

// --- booking-form terms (unchanged, verbatim) -------------------------------

test('WE gets all ten terms; WA swaps parallel-use for key handover', () => {
  const we = getTermsForLocation('WE', 'de');
  assert.equal(we.length, 10);
  assert.ok(we.some((t) => /Parallelnutzungen/.test(t)));

  const wa = getTermsForLocation('WA', 'de');
  assert.ok(!wa.some((t) => /Parallel/i.test(t)));
  assert.ok(wa.some((t) => /Schlüssel-Übergabe/.test(t)));
});
