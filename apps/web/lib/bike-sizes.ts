// The bike sizes a customer can ask for, and what each one fits.
//
// The old form asked for one number — "how many bikes?" — which is not a
// question the venue can act on: a 26" frame is no use to a four-year-old, and
// staff had to phone back for the sizes anyway. These are the buckets the
// Verkehrsschulen actually keep, with the age range beside each so a parent
// can choose without measuring anything.
//
// The keys are the ones @vs/pricing already documents for its `bikes` record
// ({ lauf: 2, r12: 0, r16: 4, … }), so nothing in the pricing engine or in the
// stored booking JSON has to change to support them.

export interface BikeSize {
  key: string;
  labelDe: string;
  labelEn: string;
  /** Age range, shown under the label. */
  ageDe: string;
  ageEn: string;
}

export const BIKE_SIZES: BikeSize[] = [
  { key: 'lauf', labelDe: 'Laufräder', labelEn: 'Balance bikes', ageDe: '2–3 Jahre', ageEn: '2–3 years' },
  { key: 'r12', labelDe: '12 Zoll', labelEn: '12 inch', ageDe: '3–4 Jahre', ageEn: '3–4 years' },
  { key: 'r16', labelDe: '16 Zoll', labelEn: '16 inch', ageDe: '4–6 Jahre', ageEn: '4–6 years' },
  { key: 'r20', labelDe: '20 Zoll', labelEn: '20 inch', ageDe: '6–8 Jahre', ageEn: '6–8 years' },
  { key: 'r24', labelDe: '24 Zoll', labelEn: '24 inch', ageDe: '8–10 Jahre', ageEn: '8–10 years' },
  { key: 'r26', labelDe: '26 Zoll', labelEn: '26 inch', ageDe: '10–14 Jahre', ageEn: '10–14 years' },
];

/** What the venue can lend of any one size. */
export const MAX_PER_SIZE = 5;

/** Drops zero and out-of-range entries, so the stored JSON stays meaningful. */
export function cleanBikeCounts(counts: Record<string, number>): Record<string, number> | null {
  const out: Record<string, number> = {};
  for (const size of BIKE_SIZES) {
    const n = Math.floor(Number(counts[size.key]) || 0);
    if (n > 0) out[size.key] = Math.min(n, MAX_PER_SIZE);
  }
  return Object.keys(out).length > 0 ? out : null;
}

export function totalBikes(counts: Record<string, number> | null | undefined): number {
  if (!counts) return 0;
  return Object.values(counts).reduce((s, n) => s + (Number(n) || 0), 0);
}
