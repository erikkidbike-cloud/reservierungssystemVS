// Merge variables for the editable mail templates (mail_templates table, see
// 0013_mail_templates.sql). This is the DATA half of "editable email
// templates" — lib/mail-send.ts is the half that loads a template row and
// renders it; /admin/mail-templates is where a human edits the wording.
//
// German for staff-facing mail; customer-facing mail follows the language the
// customer chose when booking, matching how the Nutzungsvereinbarung is
// rendered.

import { fmtDateTime, fmtEuro } from './mail';

export interface BookingMailContext {
  locationName: string;
  locationCode: string;
  startsAt: string | Date;
  endsAt: string | Date;
  persons: number | null;
  eventType?: string | null;
  priceTotal?: number | null;
  caution?: number | null;
  message?: string | null;
  customerName: string;
  customerEmail: string;
  customerPhone?: string | null;
  holdExpiresAt?: string | Date | null;
  /** Absolute link into the admin console for this booking. */
  adminUrl?: string | null;
  lang?: 'de' | 'en';
}

export interface MailTemplateRow {
  key: string;
  subject_de: string;
  subject_en: string;
  body_de: string;
  body_en: string;
}

function bookingFacts(c: BookingMailContext, lang: 'de' | 'en'): string {
  const L =
    lang === 'en'
      ? { loc: 'Venue', when: 'When', people: 'People', type: 'Type', fee: 'Fee', dep: 'Deposit' }
      : { loc: 'Ort', when: 'Zeit', people: 'Personen', type: 'Art', fee: 'Entgelt', dep: 'Kaution' };

  const lines = [
    `${L.loc}: ${c.locationName}`,
    `${L.when}: ${fmtDateTime(c.startsAt, lang)} – ${fmtDateTime(c.endsAt, lang)}`,
    `${L.people}: ${c.persons ?? '—'}`,
  ];
  if (c.eventType) lines.push(`${L.type}: ${c.eventType}`);
  if (c.priceTotal !== null && c.priceTotal !== undefined) {
    lines.push(`${L.fee}: ${fmtEuro(c.priceTotal, lang)}`);
  }
  if (c.caution !== null && c.caution !== undefined) {
    lines.push(`${L.dep}: ${fmtEuro(c.caution, lang)}`);
  }
  return lines.join('\n');
}

/** "Grund: X" (or its English equivalent) as one line, or "" when there is no reason. */
export function reasonLine(reason: string | null | undefined, lang: 'de' | 'en' = 'de'): string {
  if (!reason) return '';
  return lang === 'en' ? `Reason: ${reason}` : `Grund: ${reason}`;
}

/** "Die Reservierung ist bis X vorgemerkt..." as one line, or "" when there's no hold. */
export function holdLine(holdExpiresAt: string | Date | null | undefined, lang: 'de' | 'en' = 'de'): string {
  if (!holdExpiresAt) return '';
  const when = fmtDateTime(holdExpiresAt, lang);
  return lang === 'en'
    ? `The reservation is held until ${when} and will then expire automatically.`
    : `Die Reservierung ist bis ${when} vorgemerkt und verfällt danach automatisch.`;
}

/**
 * Every {{placeholder}} a template body may reference. Unused ones are
 * harmless (renderTemplateString leaves an unrecognised {{x}} as-is, and an
 * unreferenced key here is simply never substituted) — this is one shared
 * vocabulary for all 7 templates rather than a bespoke variable set per key.
 */
export function buildMailVars(
  c: BookingMailContext,
  lang: 'de' | 'en',
  extra: Record<string, string> = {},
): Record<string, string> {
  return {
    customerName: c.customerName,
    customerEmail: c.customerEmail,
    customerPhone: c.customerPhone ?? '',
    locationName: c.locationName,
    locationCode: c.locationCode,
    startsAt: fmtDateTime(c.startsAt, lang),
    endsAt: fmtDateTime(c.endsAt, lang),
    persons: c.persons != null ? String(c.persons) : '',
    eventType: c.eventType ?? '',
    priceTotal: c.priceTotal != null ? fmtEuro(c.priceTotal, lang) : '',
    caution: c.caution != null ? fmtEuro(c.caution, lang) : '',
    holdExpiresAt: c.holdExpiresAt ? fmtDateTime(c.holdExpiresAt, lang) : '',
    holdLine: holdLine(c.holdExpiresAt, lang),
    adminUrl: c.adminUrl ?? '',
    message: c.message ?? '',
    bookingFacts: bookingFacts(c, lang),
    reasonLine: '',
    signingLink: '',
    ...extra,
  };
}

/** {{key}} → vars[key], or left untouched if the key isn't in vars. */
export function renderTemplateString(template: string, vars: Record<string, string>): string {
  return template.replace(/\{\{(\w+)\}\}/g, (whole, key) => (key in vars ? vars[key] : whole));
}

export function renderMailTemplate(
  tpl: MailTemplateRow,
  lang: 'de' | 'en',
  vars: Record<string, string>,
): { subject: string; body: string } {
  return {
    subject: renderTemplateString(lang === 'en' ? tpl.subject_en : tpl.subject_de, vars),
    body: renderTemplateString(lang === 'en' ? tpl.body_en : tpl.body_de, vars),
  };
}
