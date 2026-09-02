// The pricing engine. Ports updatePricePreview (index.html:2191-2435) exactly,
// for both the multiplier model (WE, WI) and the person-band model (WA).
// Pure function: computePrice(request, config) -> PriceResult.

import type {
  TariffConfig,
  PriceRequest,
  PriceResult,
  DurationTier,
} from './types.ts';
import { durationMinutes } from './time.ts';
import { computeSurcharge } from './surcharge.ts';
import { computeCaution } from './caution.ts';

function tierForDuration(tiers: DurationTier[], totalMin: number): DurationTier | null {
  return tiers.find((t) => totalMin <= t.maxMin) ?? null;
}

function bikeTotal(bikes?: Record<string, number>): number {
  if (!bikes) return 0;
  return Object.values(bikes).reduce((sum, n) => sum + (Number(n) || 0), 0);
}

function extraLabel(cfg: TariffConfig, id: string, lang: 'de' | 'en'): string {
  const ex = cfg.extras.find((e) => e.id === id);
  if (!ex) return id;
  return (lang === 'en' ? ex.labelEn : ex.labelDe) || ex.id;
}

/** Label like "≤30", or "≥46" for an open-ended (sentinel max) top band. */
function boundLabel(max: number, prevMax: number): string {
  return max >= 9999 ? `≥${prevMax + 1}` : `≤${max}`;
}

function onRequestResult(caution: number | null, personsLabel = ''): PriceResult {
  return {
    currency: 'EUR',
    onRequest: true,
    tierHours: null,
    personsMultiplier: null,
    personsLabel,
    base: null,
    personsDelta: 0,
    timeSurcharge: 0,
    extrasCost: 0,
    extrasSelected: [],
    bikeCount: 0,
    total: null,
    caution,
  };
}

export function computePrice(req: PriceRequest, cfg: TariffConfig): PriceResult {
  const { start, end } = req;
  const persons = Number(req.persons || 0);
  const lang = req.lang ?? 'de';

  // Invalid range -> nothing to price.
  if (!start || !end || end.getTime() <= start.getTime()) {
    return onRequestResult(null);
  }

  const totalMin = durationMinutes(start, end);

  // --- Person-band model (WA) ------------------------------------------------
  if (cfg.model === 'person_band') {
    const tier = tierForDuration(cfg.durationTiers, totalMin);
    const caution = computeCaution(cfg.caution, persons, start, end);

    if (!tier) {
      const label = persons ? (persons <= 45 ? '≤45' : '≥46') : '';
      return onRequestResult(caution, label);
    }

    const bands = cfg.personBands ?? [];
    let band = null;
    let prevMax = 0;
    for (const b of bands) {
      if (persons <= b.max) {
        band = b;
        break;
      }
      prevMax = b.max;
    }
    // Fall back to the last band (mirrors "|| null" then treating >max as top band).
    const effectiveBand = band ?? bands[bands.length - 1] ?? null;
    const personsAdd = effectiveBand ? (effectiveBand.addByTier[String(tier.hoursLabel)] ?? 0) : 0;
    const personsLabel = effectiveBand
      ? boundLabel(effectiveBand.max, prevMax)
      : persons
        ? '≥46'
        : '';
    const total = tier.base + personsAdd;

    return {
      currency: 'EUR',
      onRequest: false,
      tierHours: tier.hoursLabel,
      personsMultiplier: 1,
      personsLabel,
      base: tier.base,
      personsDelta: personsAdd,
      timeSurcharge: 0,
      extrasCost: 0,
      extrasSelected: [],
      bikeCount: 0,
      total,
      caution,
    };
  }

  // --- Multiplier model (WE, WI) --------------------------------------------
  const tier = tierForDuration(cfg.durationTiers, totalMin);
  const personTiers = cfg.personTiers ?? [];

  let mult: number | null = null;
  let pplLabel = personTiers.length ? `>${personTiers[personTiers.length - 1].max}` : '';
  for (const pt of personTiers) {
    if (persons <= pt.max) {
      mult = pt.mult;
      pplLabel = boundLabel(pt.max, 0);
      break;
    }
  }

  const caution = computeCaution(cfg.caution, persons, start, end);

  if (!tier || mult === null) {
    return onRequestResult(caution);
  }

  const base = tier.base;
  const basePlusPersons = base * mult;
  const personsDelta = basePlusPersons - base;
  const timeAdd = computeSurcharge(cfg.surcharge, start, end);

  const selectedIds = req.extras ?? [];
  let extrasCost = 0;
  const extrasSelected: string[] = [];
  for (const id of selectedIds) {
    const ex = cfg.extras.find((e) => e.id === id);
    if (!ex) continue;
    extrasCost += ex.price;
    extrasSelected.push(extraLabel(cfg, id, lang));
  }

  // Bikes (WE): 1 € per bike across all size buckets.
  let bikes = 0;
  if (cfg.bikePricePerUnit != null) {
    bikes = bikeTotal(req.bikes);
    if (bikes > 0) {
      extrasCost += bikes * cfg.bikePricePerUnit;
      extrasSelected.push(lang === 'en' ? `${bikes}x Kids bike(s)` : `${bikes}x Kinderfahrrad`);
    }
  }

  const total = basePlusPersons + timeAdd + extrasCost;

  return {
    currency: 'EUR',
    onRequest: false,
    tierHours: tier.hoursLabel,
    personsMultiplier: mult,
    personsLabel: pplLabel,
    base,
    personsDelta,
    timeSurcharge: timeAdd,
    extrasCost,
    extrasSelected,
    bikeCount: bikes,
    total,
    caution,
  };
}
