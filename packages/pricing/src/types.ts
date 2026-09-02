// Pricing engine types.
//
// The engine is a pure function of (request, tariff config). Configs are stored
// in the DB `tariffs.config` column and mirrored by src/config.ts. See
// docs/01-business-rules.md §3 for the rules these types encode.

export type PricingModel = 'multiplier' | 'person_band';

export interface DurationTier {
  /** Inclusive upper bound of the tier, in minutes. */
  maxMin: number;
  /** Label used in the breakdown (4, 6, 8, ... hours). */
  hoursLabel: number;
  /** Base price in EUR for this duration tier. */
  base: number;
}

/** Multiplier model (WE, WI): base is multiplied by this factor. */
export interface PersonTier {
  /** Inclusive upper bound of persons. */
  max: number;
  /** Multiplier applied to the base price. */
  mult: number;
}

/** Person-band model (WA): a flat amount is added, keyed by the matched tier. */
export interface PersonBand {
  /** Inclusive upper bound of persons. */
  max: number;
  /** Flat add-on per duration-tier hours label, e.g. { "12": 80, "16": 110 }. */
  addByTier: Record<string, number>;
}

export type SurchargeRule =
  | { type: 'none' }
  | {
      type: 'window_or_weekend';
      /** Flat surcharge amount in EUR (35 in production). */
      amount: number;
      /** Daytime window, "HH:MM". Outside it (or on a weekend) the surcharge applies. */
      windowStart: string;
      windowEnd: string;
    };

export interface ExtraDef {
  id: string;
  price: number;
  labelDe: string;
  labelEn: string;
}

export type CautionRule =
  | { type: 'none' }
  | { type: 'we' }
  | { type: 'wa' };

export interface TariffConfig {
  model: PricingModel;
  durationTiers: DurationTier[];
  /** Present for the multiplier model. */
  personTiers?: PersonTier[];
  /** Present for the person-band model. */
  personBands?: PersonBand[];
  surcharge: SurchargeRule;
  extras: ExtraDef[];
  /** WE only: price per bike (1 €). Absent elsewhere. */
  bikePricePerUnit?: number;
  caution: CautionRule;
}

export interface PriceRequest {
  start: Date;
  end: Date;
  persons: number;
  /** Selected extra ids (must match config.extras[].id). */
  extras?: string[];
  /** WE bike buckets, e.g. { lauf: 2, r12: 0, r16: 4, ... }. */
  bikes?: Record<string, number>;
  /** 'de' | 'en' — only affects extra labels in the result. */
  lang?: 'de' | 'en';
}

export interface PriceResult {
  currency: 'EUR';
  /** True when no tier/person match → "Preis nach Vereinbarung". total is null. */
  onRequest: boolean;
  tierHours: number | null;
  /** Multiplier model only. */
  personsMultiplier: number | null;
  personsLabel: string;
  base: number | null;
  personsDelta: number;
  timeSurcharge: number;
  extrasCost: number;
  extrasSelected: string[];
  bikeCount: number;
  total: number | null;
  caution: number | null;
}
