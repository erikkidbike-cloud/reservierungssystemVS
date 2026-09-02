// Booking-form terms, copied VERBATIM from the live front-end
// (reference/legacy-kidbike-json/index.html — I18N.de.terms :805-816,
// I18N.en.terms :890-901, and getTermsForSchool :935-945).
//
// These are the short terms the customer accepts in the booking wizard. They are
// NOT the Nutzungsvereinbarung clauses — that is a separate, longer contract
// (see nv-contract.ts). Do not edit the strings below without the owner's
// approval: they are what customers have been agreeing to.

export type Lang = 'de' | 'en';

const TERMS_DE: readonly string[] = [
  'Nutzungsentgelt vorab per Überweisung; Reservierung erst verbindlich nach Zahlungseingang.',
  'Stornierung bis 14 Tage vor Termin: volle Erstattung; danach Einbehalt als Entschädigung.',
  'Saubere Übergabe; Müll bitte mitnehmen. Unzureichende Reinigung kann berechnet werden.',
  'Rücksicht auf Nachbarn: werktags & So ab 20:00, Sa ab 22:00 Lautstärke reduzieren.',
  'Rauchverbot auf dem Gelände (nur außerhalb, Aschenbecher nutzen).',
  'Nutzung auf eigene Gefahr; empfohlen: Veranstaltungshaftpflichtversicherung.',
  'Für verursachte Schäden haften die Nutzer*innen.',
  'Kein exklusives Nutzungsrecht am gesamten Gelände; ggf. Parallelnutzungen ohne Konflikte.',
  'Mo–Sa 14:00–18:00 Kinderfreizeitprojekt: Innenraum steht Ihnen exklusiv zur Verfügung.',
  'Verspätete An-/Abmeldung kann mit 50 €/angefangene Stunde berechnet werden.',
] as const;

const TERMS_EN: readonly string[] = [
  'Pay in advance by bank transfer; booking becomes binding only after receipt of payment.',
  'Cancellation up to 14 days before: full refund; after that, fee retained as compensation.',
  'Leave the venue clean; take your rubbish with you. Extra cleaning may be charged.',
  'Be mindful of neighbours: lower noise after 20:00 (Mon–Fri & Sun) and after 22:00 (Sat).',
  'No smoking on the premises (outside only; use an ashtray).',
  'Use at your own risk; event liability insurance recommended.',
  'Users are liable for any damages caused.',
  'No exclusive right to the entire site; parallel use may occur without conflicts.',
  "Mon–Sat 14:00–18:00 kids' project: indoor room is exclusively yours.",
  'Late start/overrun may be charged at €50 per started hour.',
] as const;

/** Wassertorplatz has no parallel-use clause but does have a key handover one. */
const WA_EXTRA: Record<Lang, string> = {
  de: 'Schlüssel-Übergabe und -Rückgabe sind vorab mit der Mitarbeiter*in vor Ort abzustimmen.',
  en: 'Key handover and return must be arranged in advance with the staff on site.',
};

/**
 * The terms for a location, reproducing getTermsForSchool(): for WA the
 * "Parallelveranstaltungen" term is dropped and a key-handover term appended.
 */
export function getTermsForLocation(locationCode: string, lang: Lang = 'de'): string[] {
  const base = [...(lang === 'en' ? TERMS_EN : TERMS_DE)];
  if (locationCode !== 'WA') return base;

  const filtered = base.filter((t) => !/Parallel/i.test(t));
  filtered.push(WA_EXTRA[lang]);
  return filtered;
}
