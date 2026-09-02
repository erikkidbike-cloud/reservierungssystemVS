// Nutzungsvereinbarung: types, constants, clause lookup and merge fields.
//
// The clause wording itself lives in nv-clauses.generated.ts, extracted
// mechanically from the owner's Word templates by scripts/import-nv-docx.py.
// It is a binding contract, so it is never retyped or paraphrased here — to
// change the wording, edit the Word file and re-run the importer.

import { NV_CLAUSE_SETS, NV_EMAIL_TEMPLATES } from './nv-clauses.generated.ts';

export type Lang = 'de' | 'en';

/** Organisation and bank details, as printed in the agreement. */
export const ORGANISATION = {
  name: 'KidBike e.V.',
  address: 'Bergholzstr. 8, 12099 Berlin',
  bank: 'Berliner Sparkasse',
  iban: 'DE09 1005 0000 0190 8304 17',
  bic: 'BELADEBEXXX',
  email: 'events@kidbike.de',
  web: 'www.kidbike.de',
} as const;

/**
 * Figures the clauses refer to. Kept here so the app can reason about them
 * (e.g. deposit-refund deadlines) without parsing prose.
 */
export const NV_CONSTANTS = {
  cancellationFreeDays: 14,
  depositRefundDays: 14,
  noisePenalty: 100,
  noiseAuthorityPenalty: 200,
  noisePenaltyMax: 300,
  damageAdminFee: 50,
  lateClosingPerHour: 50,
} as const;

export interface NvClause {
  id: string;
  titleDe: string;
  titleEn: string;
  bodyDe: string;
  bodyEn: string;
}

/**
 * The clause set for a location. WE has 16 clauses, WA has 11 with materially
 * different wording (no deposit clause, different liability, and its children's
 * project runs Mon–Fri rather than Mon–Sat), so the sets are not interchangeable.
 */
export function getClausesForLocation(locationCode: string): NvClause[] {
  const set = NV_CLAUSE_SETS[locationCode];
  if (!set) {
    throw new Error(
      `No Nutzungsvereinbarung clauses for location "${locationCode}". ` +
        `Available: ${Object.keys(NV_CLAUSE_SETS).join(', ')}. ` +
        `Import the location's Word template with scripts/import-nv-docx.py.`,
    );
  }
  return set;
}

export function hasClausesForLocation(locationCode: string): boolean {
  return Boolean(NV_CLAUSE_SETS[locationCode]);
}

export function getEmailTemplate(locationCode: string, lang: Lang): string {
  const tpl = NV_EMAIL_TEMPLATES[locationCode];
  if (!tpl) throw new Error(`No cover email template for location "${locationCode}"`);
  return lang === 'en' ? tpl.en : tpl.de;
}

/** Data merged into the agreement and the cover email for one booking. */
export interface NvData {
  locationCode: string;
  locationName: string;
  locationAddress: string;
  locationPhone?: string | null;
  customer: {
    salutation?: string | null;
    firstName?: string | null;
    lastName?: string | null;
    organization?: string | null;
    addressFull?: string | null;
    email?: string | null;
    phone?: string | null;
  };
  /** Berlin wall-clock start/end. */
  startsAt: Date;
  endsAt: Date;
  persons: number | null;
  eventType?: string | null;
  /** Free-text extras ("Extra-Wünsche"). */
  extras?: string | null;
  priceTotal: number | null;
  caution: number | null;
  paymentReference?: string | null;
  payBy?: Date | null;
  /** Whether an identity document must be uploaded when signing. */
  needsIdUpload: boolean;
  /** WE only: whether this party booked first or second ("erste"/"zweite"). */
  bookingOrder?: 'erste' | 'zweite' | null;
  /** Link to the online signing page. */
  signingLink?: string | null;
  lang: Lang;
}

const dtf = (lang: Lang, opts: Intl.DateTimeFormatOptions) =>
  new Intl.DateTimeFormat(lang === 'en' ? 'en-GB' : 'de-DE', {
    ...opts,
    timeZone: 'Europe/Berlin',
  });

export function formatDate(d: Date, lang: Lang): string {
  return dtf(lang, { dateStyle: 'long' }).format(d);
}

export function formatTime(d: Date, lang: Lang): string {
  return dtf(lang, { hour: '2-digit', minute: '2-digit' }).format(d);
}

export function formatEuro(n: number | null | undefined, lang: Lang): string {
  if (n === null || n === undefined) return '—';
  return new Intl.NumberFormat(lang === 'en' ? 'en-GB' : 'de-DE', {
    style: 'currency',
    currency: 'EUR',
  }).format(n);
}

/** German salutation inflection, as the Word template's «GeehrteGeehrterGeehrte». */
function geehrte(salutation?: string | null): string {
  const s = (salutation || '').trim().toLowerCase();
  if (s.startsWith('herr')) return 'geehrter';
  if (s.startsWith('frau')) return 'geehrte';
  return 'geehrte/r';
}

/**
 * The ID-upload paragraph («TxtAusweisDE» / «TxtAusweisEN»), included only when
 * the event requires an identity document.
 */
const ID_TEXT: Record<Lang, string> = {
  de: 'Zusätzlich benötigen wir für diese Veranstaltung eine Kopie Ihres Ausweises, die Sie beim Unterzeichnen hochladen können.',
  en: 'For this event we additionally require a copy of your identity document, which you can upload when signing.',
};

/**
 * Values for the Word merge fields («Nachname», «Nutzung_Üw», …). Field names
 * are exactly those in the templates so the extracted text substitutes cleanly.
 */
export function mergeFields(data: NvData): Record<string, string> {
  const lang = data.lang;
  const c = data.customer;
  const total =
    data.priceTotal !== null && data.priceTotal !== undefined
      ? data.priceTotal + (data.caution ?? 0)
      : null;

  const payBy = data.payBy
    ? lang === 'en'
      ? `by ${formatDate(data.payBy, 'en')}`
      : `bis zum ${formatDate(data.payBy, 'de')}`
    : lang === 'en'
      ? 'immediately'
      : 'umgehend';

  return {
    Nachname: c.lastName ?? '',
    Vorname: c.firstName ?? '',
    Anrede: c.salutation ?? '',
    GeehrteGeehrterGeehrte: geehrte(c.salutation),
    Einrichtung: c.organization ?? '',
    Anschrift: c.addressFull ?? '',
    Telefon_nummer: c.phone ?? '',
    EmailAdresse: c.email ?? '',

    Datum: formatDate(data.startsAt, lang),
    Zeit_von: formatTime(data.startsAt, lang),
    Zeit_bis: formatTime(data.endsAt, lang),
    Art_der_Veranstaltung_: data.eventType ?? '',
    Anzahl_Personen: data.persons != null ? String(data.persons) : '',
    Anzahl__Kinder_Erwachsene: data.persons != null ? String(data.persons) : '',
    'ExtraWünsche': data.extras ?? '',

    'Nutzung_Üw': formatEuro(data.priceTotal, lang),
    Kaution: formatEuro(data.caution, lang),
    'Betrag_Summe_Nutzung_Üw__Kaution': formatEuro(total, lang),
    AutoVZweck: data.paymentReference ?? '',
    Zahlung_bis: payBy,
    Zahlung_bis_Englisch: payBy,

    TxtAusweisDE: data.needsIdUpload ? ID_TEXT.de : '',
    TxtAusweisEN: data.needsIdUpload ? ID_TEXT.en : '',
    ErstbucherZweite_Bucher: data.bookingOrder ?? '',
    LinkUnterschreiben: data.signingLink ?? '',
  };
}

const FIELD_RE = /«([^»]+)»/g;
// Captures the character immediately before a field, to repair missing spaces.
const FIELD_WITH_PREV_RE = /(\S?)«([^»]+)»/g;

/**
 * Replace «FieldName» placeholders. Unknown fields resolve to an empty string.
 *
 * The Word templates are inconsistent about spacing — some fields are written
 * flush against the preceding word ("in Höhe von«Nutzung_Üw»") while others
 * already have a space (": «Nutzung_Üw»"). A space is therefore inserted only
 * when the field directly abuts a non-space character, which fixes the former
 * without double-spacing the latter.
 */
export function applyMergeFields(text: string, fields: Record<string, string>): string {
  return text.replace(FIELD_WITH_PREV_RE, (_, prev: string, name: string) => {
    const value = fields[name] ?? '';
    if (!value) return prev;
    return prev && !/\s/.test(prev) ? `${prev} ${value}` : `${prev}${value}`;
  });
}

/** Merge-field names still present in a string — useful for diagnostics/tests. */
export function remainingMergeFields(text: string): string[] {
  return [...text.matchAll(FIELD_RE)].map((m) => m[1]);
}
