// The cover email that goes out with the agreement. Its wording is extracted
// from the same Word templates (they carry the email text after the agreement),
// so it stays in step with the contract.

import {
  getEmailTemplate,
  mergeFields,
  applyMergeFields,
  formatDate,
  type NvData,
  type Lang,
} from './nv-contract.ts';

export interface CoverEmail {
  lang: Lang;
  subject: string;
  /** Plain-text body, merge fields filled. */
  body: string;
}

const SUBJECT: Record<Lang, (venue: string, date: string) => string> = {
  de: (venue, date) => `Nutzungsvereinbarung für Ihre Veranstaltung am ${date} – ${venue}`,
  en: (venue, date) => `Usage agreement for your event on ${date} – ${venue}`,
};

/** Build the cover email for one language. */
export function buildCoverEmail(data: NvData, lang: Lang = data.lang): CoverEmail {
  const fields = mergeFields({ ...data, lang });
  const template = getEmailTemplate(data.locationCode, lang);
  return {
    lang,
    subject: SUBJECT[lang](data.locationName, formatDate(data.startsAt, lang)),
    body: applyMergeFields(template, fields).trim(),
  };
}
