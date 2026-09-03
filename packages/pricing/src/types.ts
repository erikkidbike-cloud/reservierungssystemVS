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

/** A flat on/off extra: selecting it adds `price` once, regardless of quantity. */
export interface ToggleExtraDef {
  id: string;
  type: 'toggle';
  price: number;
  labelDe: string;
  labelEn: string;
}

/**
 * A per-unit extra: the customer enters a quantity (e.g. "4 bikes"), priced at
 * `pricePerUnit` each, optionally clamped to [min, max]. Generalises what used
 * to be WE's bike-specific `bikePricePerUnit`/`bikes` fields (kept, for
 * backward compatibility — see TariffConfig.bikePricePerUnit) into something
 * any location's tariff can define any number of.
 */
export interface QuantityExtraDef {
  id: string;
  type: 'quantity';
  pricePerUnit: number;
  /** Defaults to 0 when absent. */
  min?: number;
  /** Unbounded when absent. */
  max?: number;
  labelDe: string;
  labelEn: string;
}

export type ExtraDef = ToggleExtraDef | QuantityExtraDef;

export type CautionRule =
  | { type: 'none' }
  /**
   * Ports PRICING.WE.cautionFn (index.html:1030-1057) — see caution.ts's own
   * header for why the branching itself (not just these amounts) is flagged
   * ⚠️ unverified (open question 7) and should not be changed without the
   * owner's confirmation. The AMOUNTS below are exactly the numbers that code
   * always used; they're only now parameters instead of literals, so an admin
   * can tune the price without touching the branch logic.
   */
  | {
      type: 'we';
      /** Persons at/below this pay `amountInWindow`/`amountStandard`; above it, `amountStandard`/`amountHigh`. */
      personsThreshold: number;
      /** Charged when at/below the threshold AND the event is fully within the daytime window (and not Sunday). null = no deposit. */
      amountInWindow: number | null;
      /** Charged at/below the threshold outside the window, or above the threshold inside it. */
      amountStandard: number;
      /** Charged above the threshold outside the window, or for an event that runs past closing. */
      amountHigh: number;
    }
  | {
      type: 'wa';
      personsThreshold: number;
      amountBelow: number;
      amountAtOrAbove: number;
    };

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
  /** Selected TOGGLE extra ids (must match config.extras[].id). */
  extras?: string[];
  /** Chosen quantity for each QUANTITY extra, keyed by config.extras[].id. */
  extraQuantities?: Record<string, number>;
  /** WE bike buckets, e.g. { lauf: 2, r12: 0, r16: 4, ... }. Legacy — see TariffConfig.bikePricePerUnit. */
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
