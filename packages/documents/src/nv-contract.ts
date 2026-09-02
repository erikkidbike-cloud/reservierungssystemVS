// Nutzungsvereinbarung: structure, known constants, and clause registry.
//
// ⚠️ READ THIS BEFORE FILLING IN CLAUSES ⚠️
// The Nutzungsvereinbarung is a binding contract. The clause BODIES below are
// deliberately empty placeholders — the verbatim wording must be copied from the
// owner's Word template ("Nutzungsvereinbarung VS WE DE EN"), not paraphrased,
// invented or re-drafted. What is captured here is only what could be
// established from the existing system with certainty: the clause set and order,
// the organisation/bank details, and the monetary figures.
//
// renderNutzungsvereinbarung() refuses to produce a "final" document while any
// required clause body is still empty (see render.ts), so a half-filled template
// cannot quietly be sent to a customer.
//
// Backlog task 3.1.

export type Lang = 'de' | 'en';

/** Organisation + bank details (from the existing Word template). */
export const ORGANISATION = {
  name: 'KidBike e.V.',
  bank: 'Berliner Sparkasse',
  iban: 'DE09 1005 0000 0190 8304 17',
} as const;

/**
 * Monetary and time constants referenced by the clauses. These were established
 * from the current system and are safe to render; the surrounding sentences are
 * not.
 */
export const NV_CONSTANTS = {
  /** Cancellation is free up to this many days before the event. */
  cancellationFreeDays: 14,
  /** Noise violation. */
  noisePenalty: 100,
  /** Additional penalty if police / Ordnungsamt attend. */
  noiseAuthorityPenalty: 200,
  /** Cap on the combined noise penalty. */
  noisePenaltyMax: 300,
  /** Administration fee added to damage claims. */
  damageAdminFee: 50,
  /** Charge per started hour for late closing. */
  lateClosingPerHour: 50,
  /** Kinderfreizeitprojekt window (indoor room stays exclusive to the renter). */
  kidsProjectDays: 'Mo–Sa',
  kidsProjectFrom: '14:00',
  kidsProjectTo: '18:00',
  /** Sammel-NV only: discount for paying all dates in advance. */
  sammelSkontoPercent: 30,
} as const;

export interface NvClause {
  /** Stable id — used to match a clause to its verbatim text when filled in. */
  id: string;
  titleDe: string;
  titleEn: string;
  /** Verbatim clause text. Empty string = NOT YET FILLED IN. */
  bodyDe: string;
  bodyEn: string;
  /**
   * Whether this clause must be present for the document to be valid. The
   * Sammel-NV omits the deposit clause, so that one is optional.
   */
  required?: boolean;
}

/**
 * The 16 clauses of the standard Nutzungsvereinbarung, in the order they appear
 * in the Word template. Titles are known; bodies await the verbatim text.
 */
export const NV_CLAUSES: NvClause[] = [
  { id: 'nutzungszeit', titleDe: 'Nutzungszeit', titleEn: 'Period of use', bodyDe: '', bodyEn: '', required: true },
  { id: 'entgelt_kaution', titleDe: 'Nutzungsentgelt und Kaution', titleEn: 'Fee and deposit', bodyDe: '', bodyEn: '', required: true },
  { id: 'personenzahl', titleDe: 'Personenzahl', titleEn: 'Number of people', bodyDe: '', bodyEn: '', required: true },
  { id: 'stornierung', titleDe: 'Stornierung', titleEn: 'Cancellation', bodyDe: '', bodyEn: '', required: true },
  { id: 'reinigung', titleDe: 'Reinigung', titleEn: 'Cleaning', bodyDe: '', bodyEn: '', required: true },
  { id: 'laerm', titleDe: 'Lärm', titleEn: 'Noise', bodyDe: '', bodyEn: '', required: true },
  { id: 'rauchverbot', titleDe: 'Rauchverbot', titleEn: 'No smoking', bodyDe: '', bodyEn: '', required: true },
  { id: 'haftung', titleDe: 'Haftung', titleEn: 'Liability', bodyDe: '', bodyEn: '', required: true },
  { id: 'schaeden', titleDe: 'Schäden', titleEn: 'Damages', bodyDe: '', bodyEn: '', required: true },
  { id: 'auf_abbau', titleDe: 'Auf- und Abbau', titleEn: 'Set-up and take-down', bodyDe: '', bodyEn: '', required: true },
  { id: 'parallelveranstaltungen', titleDe: 'Parallelveranstaltungen', titleEn: 'Parallel events', bodyDe: '', bodyEn: '', required: true },
  { id: 'kinderfreizeitprojekt', titleDe: 'Kinderfreizeitprojekt', titleEn: "Children's leisure project", bodyDe: '', bodyEn: '', required: true },
  { id: 'autolieferungen', titleDe: 'Anlieferungen mit dem Auto', titleEn: 'Deliveries by car', bodyDe: '', bodyEn: '', required: true },
  { id: 'verspaetetes_abschliessen', titleDe: 'Verspätetes Abschließen', titleEn: 'Late closing', bodyDe: '', bodyEn: '', required: true },
  { id: 'flurnutzung', titleDe: 'Nutzung des Flurs', titleEn: 'Use of the corridor', bodyDe: '', bodyEn: '', required: true },
  { id: 'hausrecht', titleDe: 'Hausrecht', titleEn: 'House rules', bodyDe: '', bodyEn: '', required: true },
];

/** Clause ids whose verbatim text is still missing. */
export function missingClauseBodies(clauses: NvClause[] = NV_CLAUSES, lang: Lang = 'de'): string[] {
  const key = lang === 'en' ? 'bodyEn' : 'bodyDe';
  return clauses.filter((c) => c.required !== false && !c[key].trim()).map((c) => c.id);
}

/** Data merged into the document for one booking. */
export interface NvData {
  contractNumber?: string;
  locationName: string;
  locationAddress: string;
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
  priceTotal: number | null;
  caution: number | null;
  /** Payment reference (Verwendungszweck). */
  paymentReference?: string | null;
  /** Deadline for payment, per the 14-day rule. */
  payBy?: Date | null;
  /** Whether an identity document must be uploaded when signing. */
  needsIdUpload: boolean;
  lang: Lang;
}
