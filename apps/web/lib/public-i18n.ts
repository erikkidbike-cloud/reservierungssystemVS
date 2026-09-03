// DE/EN copy for the public booking wizard.
//
// Labels, error wording and the 10 terms per language are ported **verbatim**
// from reference/legacy-kidbike-json/index.html (its `I18N` object and
// `getTermsForSchool`) per backlog 2.2's acceptance criterion — the current
// customers have read this exact wording for years, and changing it silently
// alongside a system rewrite is its own kind of risk. Anything below that is
// NOT a verbatim copy is called out in a comment.
//
// Client-safe: no imports beyond plain TypeScript, so this loads into the
// browser bundle for the live-updating wizard.

export type Lang = 'de' | 'en';

export interface PublicCopy {
  appTitle: string;
  labelSchool: string;
  labelLang: string;
  loadingCalendar: string;
  intro1: string;
  introHint: string;
  formSchool: string;
  persons: string;
  from: string;
  to: string;
  date: string;
  salutation: string;
  firstName: string;
  lastName: string;
  email: string;
  phone: string;
  street: string;
  house: string;
  zip: string;
  city: string;
  organization: string;
  type: string;
  bikesLabel: string;
  extras: string;
  message: string;
  accept: string;
  waitlistBtn: string;
  waitlistTitle: string;
  waitlistLead: string;
  waitlistSuccess: string;
  btnJoinWaitlist: string;
  overlapWarning: string;
  conflict: string;
  shortTermWarning: string;
  lateBlocked: string;
  closedLabel: string;
  priceTitle: string;
  priceHint: string;
  termsSummary: string;
  terms: string[];
  btnBack: string;
  btnNext: string;
  btnSend: string;
  btnSending: string;
  phPersons: string;
  phType: string;
  bdBase: (hours: number) => string;
  bdPersons: (label: string) => string;
  bdTime: string;
  bdExtras: string;
  bdTotal: string;
  bdNoExtras: string;
  bdTimeInfo: string;
  successTitle: string;
  successLead: string;
  successBack: string;
  successNew: string;
  startTitle: string;
  startLead: string;
  onlineBookable: string;
  phoneBookable: string;
  notOnline: string;
  choose: string;
  phoneInfoTitle: (school: string) => string;
  phoneInfoText: (phone: string) => string;
  stepTime: string;
  stepContact: string;
  freeSlot: string;
  busySlot: string;
  todayLabel: string;
}

// Bike-size buckets, WE only (see @vs/pricing config.ts). Not in the legacy
// I18N table verbatim (the legacy form used free-text checkboxes per size) —
// kept short since the internal form (booking-labels.ts) has no equivalent
// and this is new wording.
export const BIKE_LABEL: Record<Lang, string> = {
  de: 'Kinderfahrräder (1 € / Fahrrad)',
  en: "Kids' bikes (€1 / bike)",
};

const TERMS_DE = [
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
];

const TERMS_EN = [
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
];

/**
 * Location-specific term substitution, ported from getTermsForSchool():
 * Wassertorplatz (WA) drops the "parallel use" clause (it has no parallel
 * activity like WE's Kinderfreizeitprojekt) and adds a key handover clause.
 */
export function getTermsForSchool(lang: Lang, locationCode: string): string[] {
  const base = lang === 'en' ? TERMS_EN.slice() : TERMS_DE.slice();
  if (locationCode === 'WA') {
    const filtered = base.filter((t) => !/Parallel/i.test(t));
    filtered.push(
      lang === 'en'
        ? 'Key handover and return must be arranged in advance with the staff on site.'
        : 'Schlüssel-Übergabe und -Rückgabe sind vorab mit der Mitarbeiter*in vor Ort abzustimmen.',
    );
    return filtered;
  }
  return base;
}

export const I18N: Record<Lang, PublicCopy> = {
  de: {
    appTitle: 'Belegung Verkehrsschulen',
    labelSchool: 'Standort',
    labelLang: 'Sprache',
    loadingCalendar: 'Lade Kalender...',
    intro1:
      'Wählen Sie oben Ihre Verkehrsschule. Blaue Blöcke sind bereits belegt. Wählen Sie einen freien Zeitraum, um eine Anfrage zu senden.',
    introHint: 'Hinweis: Ihre Anfrage ist unverbindlich. Wir melden uns per E-Mail mit einer Bestätigung.',
    formSchool: 'Verkehrsschule',
    persons: 'Anzahl Personen',
    from: 'Von',
    to: 'Bis',
    date: 'Datum',
    salutation: 'Anrede',
    firstName: 'Vorname',
    lastName: 'Nachname',
    email: 'E-Mail',
    phone: 'Telefon',
    street: 'Straße',
    house: 'Hausnummer',
    zip: 'Postleitzahl',
    city: 'Stadt / Ort',
    organization: 'Einrichtung / Organisation (optional)',
    type: 'Art der Feier',
    bikesLabel: BIKE_LABEL.de,
    extras: 'Extras',
    message: 'Nachricht (optional)',
    accept: 'Ich habe die wesentlichen Bedingungen gelesen und akzeptiere sie.',
    waitlistBtn: 'Auf die Warteliste setzen',
    waitlistTitle: 'Auf Warteliste eintragen',
    waitlistLead: 'Dieser Termin ist bereits belegt. Hinterlassen Sie Ihre Kontaktdaten — falls der Termin frei wird, melden wir uns.',
    waitlistSuccess: 'Vielen Dank! Sie wurden auf die Warteliste gesetzt.',
    btnJoinWaitlist: 'In Warteliste eintragen',
    overlapWarning: 'In diesem Zeitraum liegt bereits eine Reservierung vor. Eine Buchung ist leider nicht möglich.',
    conflict: 'Ungültige Zeit (Ende vor Beginn) oder Zeitraum zu kurz (min. 30 Min).',
    shortTermWarning:
      'Kurzfristige Anfrage: Da Ihr gewünschter Termin in weniger als der Vorlauffrist liegt, können wir nicht garantieren, dass wir Ihre Anfrage rechtzeitig bearbeiten können.',
    lateBlocked: 'Veranstaltungen an diesem Standort können nur bis zur Schließzeit stattfinden.',
    closedLabel: 'Geschlossen',
    priceTitle: 'Vorläufige Preisindikation:',
    priceHint: ' (unverbindlich; endgültige Bestätigung und ggf. Anpassungen vorbehalten)',
    termsSummary: 'Wesentliche Bedingungen (Kurzfassung)',
    terms: TERMS_DE,
    btnBack: 'Zurück',
    btnNext: 'Weiter',
    btnSend: 'Anfrage senden',
    btnSending: 'Wird gesendet …',
    phPersons: 'z. B. 30',
    phType: 'z. B. Kindergeburtstag, Jubiläum, …',
    bdBase: (h) => `Basis (bis ${h} Std.)`,
    bdPersons: (label) => `Personen-Staffel (${label})`,
    bdTime: 'Zeit-Zuschlag',
    bdExtras: 'Extras',
    bdTotal: 'Summe',
    bdNoExtras: 'keine',
    bdTimeInfo:
      '35 € Zuschlag, wenn Beginn und/oder Ende nicht innerhalb der Tageszeit liegen oder wenn der Zeitraum (auch teilweise) am Wochenende liegt.',
    successTitle: 'Anfrage gesendet',
    successLead:
      'Vielen Dank. Ihre Anfrage ist noch nicht verbindlich. Wir prüfen die Angaben und melden uns per E-Mail. Sie erhalten dann die Nutzungsvereinbarung sowie weitere Hinweise.',
    successBack: 'Zurück zum Kalender',
    successNew: 'Neue Anfrage',
    startTitle: 'Bitte wählen Sie Ihre Verkehrsschule',
    startLead: 'Einige Standorte sind ggf. noch nicht online buchbar.',
    onlineBookable: 'Online buchbar',
    phoneBookable: 'Telefonisch buchbar',
    notOnline: 'Derzeit nicht buchbar',
    choose: 'Auswählen',
    phoneInfoTitle: (school) => `Buchung ${school}`,
    phoneInfoText: (phone) =>
      `Dieser Standort kann nicht online gebucht werden.\n\nGrüne Bereiche im Kalender sind voraussichtlich frei. Bitte rufen Sie uns an, um Details zu besprechen und Ihre Buchung vorzunehmen: ${phone}`,
    stepTime: 'Zeitraum & Preis',
    stepContact: 'Kontakt & Bedingungen',
    freeSlot: 'frei',
    busySlot: 'belegt',
    todayLabel: 'Heute',
  },
  en: {
    appTitle: 'Traffic School Availability',
    labelSchool: 'Location',
    labelLang: 'Language',
    loadingCalendar: 'Loading calendar...',
    intro1: 'Pick your location above. Blue blocks are already booked. Choose a free time slot to send a request.',
    introHint: "Note: Your request is non-binding. We'll confirm by email.",
    formSchool: 'Traffic school',
    persons: 'Number of people',
    from: 'From',
    to: 'Until',
    date: 'Date',
    salutation: 'Salutation',
    firstName: 'First name',
    lastName: 'Last name',
    email: 'Email',
    phone: 'Phone number',
    street: 'Street',
    house: 'House number',
    zip: 'Postal code',
    city: 'City',
    organization: 'Organization (optional)',
    type: 'Type of event',
    bikesLabel: BIKE_LABEL.en,
    extras: 'Extras',
    message: 'Message (optional)',
    accept: 'I have read and accept the key conditions.',
    waitlistBtn: 'Join waitlist',
    waitlistTitle: 'Join the waitlist',
    waitlistLead: 'This time slot is already taken. Leave your contact details — if it becomes available, we will contact you.',
    waitlistSuccess: 'Thank you! You have been added to the waitlist.',
    btnJoinWaitlist: 'Join waitlist',
    overlapWarning: 'There is already a reservation in this time slot. Booking is not possible.',
    conflict: 'Invalid time (end before start) or too short (min. 30 mins).',
    shortTermWarning:
      'Short-notice request: as your requested time is within the lead time, we cannot guarantee timely processing.',
    lateBlocked: 'Events at this location can only take place until closing time.',
    closedLabel: 'Closed',
    priceTitle: 'Preliminary price indication:',
    priceHint: ' (non-binding; subject to confirmation and possible adjustments)',
    termsSummary: 'Key conditions (short version)',
    terms: TERMS_EN,
    btnBack: 'Back',
    btnNext: 'Next',
    btnSend: 'Send request',
    btnSending: 'Sending …',
    phPersons: 'e.g. 30',
    phType: "e.g. kids' birthday, anniversary …",
    bdBase: (h) => `Base (up to ${h} h)`,
    bdPersons: (label) => `People tier (${label})`,
    bdTime: 'Time surcharge',
    bdExtras: 'Extras',
    bdTotal: 'Total',
    bdNoExtras: 'none',
    bdTimeInfo:
      "€35 surcharge if start and/or end are outside the daytime window, or if any part of the booking falls on a weekend.",
    successTitle: 'Request submitted',
    successLead:
      'Thank you. Your request is not yet binding. We will review the details and contact you by email. You will then receive the usage agreement and further instructions.',
    successBack: 'Back to calendar',
    successNew: 'New request',
    startTitle: 'Please choose your traffic school',
    startLead: 'Some locations may not yet be available for online booking.',
    onlineBookable: 'Bookable online',
    phoneBookable: 'Bookable by phone',
    notOnline: 'Currently not bookable',
    choose: 'Choose',
    phoneInfoTitle: (school) => `Booking ${school}`,
    phoneInfoText: (phone) =>
      `This location cannot be booked online.\n\nGreen areas in the calendar are likely available. Please call us to discuss the details and make a booking: ${phone}`,
    stepTime: 'Time & price',
    stepContact: 'Contact & conditions',
    freeSlot: 'free',
    busySlot: 'busy',
    todayLabel: 'Today',
  },
};

/** Server-code → customer-facing wording, DE and EN. Mirrors lib/booking-errors.ts. */
const ERROR_COPY: Record<string, { de: string; en: string }> = {
  invalid_range: {
    de: 'Ende liegt vor dem Beginn — bitte Zeitraum prüfen.',
    en: 'End is before the start — please check the time range.',
  },
  too_short: {
    de: 'Der Zeitraum ist kürzer als die Mindestdauer dieses Standorts.',
    en: 'The time range is shorter than this location’s minimum duration.',
  },
  too_soon: {
    de: 'Der Termin liegt innerhalb der Vorlauffrist.',
    en: 'The date is within the required lead time.',
  },
  closing_violation: {
    de: 'Außerhalb der Öffnungszeiten: der Zeitraum muss am selben Tag zwischen 06:00 Uhr und der Schließzeit des Standorts liegen.',
    en: 'Outside opening hours: the time range must be on the same day, between 06:00 and the location’s closing time.',
  },
  overlap: {
    de: 'In diesem Zeitraum ist der Standort bereits belegt.',
    en: 'The location is already booked for this time range.',
  },
  slot_taken: {
    de: 'In diesem Zeitraum ist der Standort bereits belegt.',
    en: 'The location is already booked for this time range.',
  },
  location_not_found: {
    de: 'Der Standort wurde nicht gefunden oder ist nicht aktiv.',
    en: 'The location was not found or is not active.',
  },
  not_online_bookable: {
    de: 'Dieser Standort ist nicht online buchbar.',
    en: 'This location cannot be booked online.',
  },
  invalid_persons: {
    de: 'Bitte eine Personenzahl größer als 0 angeben.',
    en: 'Please enter a number of people greater than 0.',
  },
  invalid_email: {
    de: 'Die E-Mail-Adresse sieht nicht gültig aus.',
    en: 'The email address does not look valid.',
  },
  server_error: {
    de: 'Die Anfrage konnte nicht gesendet werden. Bitte später erneut versuchen.',
    en: 'The request could not be sent. Please try again later.',
  },
  rate_limited: {
    de: 'Es sind zu viele Anfragen in kurzer Zeit eingegangen. Bitte versuchen Sie es in einer Stunde erneut oder rufen Sie uns an.',
    en: 'Too many requests in a short time. Please try again in an hour, or give us a call.',
  },
  pricing_failed: {
    de: 'Der Preis konnte nicht berechnet werden.',
    en: 'The price could not be calculated.',
  },
};

export function publicErrorMessage(code: string, lang: Lang): string {
  return ERROR_COPY[code]?.[lang] ?? (lang === 'en' ? 'Something went wrong.' : 'Etwas ist schiefgelaufen.');
}
