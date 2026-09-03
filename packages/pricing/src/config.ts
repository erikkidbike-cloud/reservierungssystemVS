// Default tariff configs, ported verbatim from the live front-end
// (reference/legacy-kidbike-json/index.html:1000-1097). These mirror the seeded
// DB configs in supabase/seed/seed.sql — config-parity.test.ts asserts the two
// agree. In production the app loads configs from `tariffs.config`; these serve
// as the typed default/fallback and as the fixture the tests pin behaviour to.

import type { TariffConfig } from './types.ts';

const DURATION_TIERS_STD = [
  { maxMin: 240, hoursLabel: 4, base: 100 },
  { maxMin: 360, hoursLabel: 6, base: 130 },
  { maxMin: 480, hoursLabel: 8, base: 160 },
  { maxMin: 600, hoursLabel: 10, base: 190 },
  { maxMin: 720, hoursLabel: 12, base: 220 },
  { maxMin: 960, hoursLabel: 16, base: 280 },
  { maxMin: 1440, hoursLabel: 24, base: 360 },
];

const PERSON_TIERS_STD = [
  { max: 30, mult: 1.0 },
  { max: 40, mult: 1.25 },
  { max: 50, mult: 1.5 },
  { max: 75, mult: 1.75 },
  { max: 100, mult: 2.0 },
];

export const WE_STANDARD: TariffConfig = {
  model: 'multiplier',
  durationTiers: DURATION_TIERS_STD,
  personTiers: PERSON_TIERS_STD,
  surcharge: { type: 'window_or_weekend', amount: 35, windowStart: '09:00', windowEnd: '17:30' },
  extras: [
    { id: 'parcours', type: 'toggle', price: 10, labelDe: 'Fahrradparcours', labelEn: 'Bike course' },
    { id: 'grill', type: 'toggle', price: 10, labelDe: 'Grill', labelEn: 'Grill' },
    { id: 'tisch', type: 'toggle', price: 10, labelDe: 'Tischtennisplatte', labelEn: 'Table tennis' },
  ],
  bikePricePerUnit: 1,
  caution: { type: 'we', personsThreshold: 50, amountInWindow: null, amountStandard: 200, amountHigh: 500 },
};

export const WI_STANDARD: TariffConfig = {
  model: 'multiplier',
  durationTiers: DURATION_TIERS_STD,
  personTiers: PERSON_TIERS_STD,
  surcharge: { type: 'window_or_weekend', amount: 35, windowStart: '09:00', windowEnd: '17:30' },
  extras: [],
  caution: { type: 'none' },
};

export const WA_STANDARD: TariffConfig = {
  model: 'person_band',
  durationTiers: [
    { maxMin: 720, hoursLabel: 12, base: 140 },
    { maxMin: 960, hoursLabel: 16, base: 200 },
  ],
  personBands: [
    { max: 45, addByTier: { '12': 0, '16': 0 } },
    { max: 9999, addByTier: { '12': 80, '16': 110 } },
  ],
  surcharge: { type: 'none' },
  extras: [],
  caution: { type: 'wa', personsThreshold: 45, amountBelow: 50, amountAtOrAbove: 70 },
};

/** By location code, the standard (Normal) tariff. */
export const DEFAULT_TARIFFS: Record<string, TariffConfig> = {
  WE: WE_STANDARD,
  WA: WA_STANDARD,
  WI: WI_STANDARD,
};
