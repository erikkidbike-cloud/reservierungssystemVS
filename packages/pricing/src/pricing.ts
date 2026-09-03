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

interface ExtrasTotal {
  extrasCost: number;
  extrasSelected: string[];
  bikeCount: number;
}

/**
 * Toggle + quantity extras, plus the legacy WE bike fields — computed once and
 * shared by both pricing models. Extras used to be multiplier-model-only
 * (person_band/WA never processed them, always contributing 0); now that
 * extras are admin-editable per location regardless of model, EVERY model
 * must actually charge whatever is configured, or an admin adding an extra to
 * a person_band tariff would see it in the editor but never on an invoice.
 */
function computeExtras(cfg: TariffConfig, req: PriceRequest, lang: 'de' | 'en'): ExtrasTotal {
  let extrasCost = 0;
  const extrasSelected: string[] = [];

  for (const id of req.extras ?? []) {
    const ex = cfg.extras.find((e) => e.id === id);
    if (!ex || ex.type !== 'toggle') continue;
    extrasCost += ex.price;
    extrasSelected.push(extraLabel(cfg, id, lang));
  }

  for (const ex of cfg.extras) {
    if (ex.type !== 'quantity') continue;
    const raw = req.extraQuantities?.[ex.id];
    if (!raw) continue;
    const qty = Math.min(ex.max ?? Infinity, Math.max(ex.min ?? 0, Math.round(Number(raw) || 0)));
    if (qty <= 0) continue;
    extrasCost += qty * ex.pricePerUnit;
    extrasSelected.push(`${qty}x ${lang === 'en' ? ex.labelEn : ex.labelDe}`);
  }

  // Legacy WE field: 1 € per bike across all size buckets. Kept separate from
  // the generic quantity-extra mechanism above (rather than migrated into it)
  // so existing bookings' stored `bikes` JSON keeps meaning what it always
  // meant — see TariffConfig.bikePricePerUnit.
  let bikeCount = 0;
  if (cfg.bikePricePerUnit != null) {
    bikeCount = bikeTotal(req.bikes);
    if (bikeCount > 0) {
      extrasCost += bikeCount * cfg.bikePricePerUnit;
      extrasSelected.push(lang === 'en' ? `${bikeCount}x Kids bike(s)` : `${bikeCount}x Kinderfahrrad`);
    }
  }

  return { extrasCost, extrasSelected, bikeCount };
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
    const { extrasCost, extrasSelected, bikeCount } = computeExtras(cfg, req, lang);
    const total = tier.base + personsAdd + extrasCost;

    return {
      currency: 'EUR',
      onRequest: false,
      tierHours: tier.hoursLabel,
      personsMultiplier: 1,
      personsLabel,
      base: tier.base,
      personsDelta: personsAdd,
      timeSurcharge: 0,
      extrasCost,
      extrasSelected,
      bikeCount,
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

  const { extrasCost, extrasSelected, bikeCount } = computeExtras(cfg, req, lang);
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
    bikeCount,
    total,
    caution,
  };
}
