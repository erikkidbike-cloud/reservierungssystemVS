// Bridges the database to the engine: turns an untrusted `tariffs.config` JSONB
// value into a validated TariffConfig. Backlog task 1.2.
//
// Why validate at all: a malformed or half-edited tariff row must fail loudly at
// load time, not silently mis-price a booking. Everything the engine relies on
// (required fields, numeric types, tier ordering) is checked here, so
// computePrice can stay free of defensive branches.
//
// Tier ordering is normalised rather than merely checked: computePrice picks the
// first tier whose bound the value fits, so ascending order is a correctness
// requirement, and rows may come back from Postgres in any order.

import type {
  TariffConfig,
  DurationTier,
  PersonTier,
  PersonBand,
  SurchargeRule,
  ExtraDef,
  CautionRule,
} from './types.ts';

export class TariffConfigError extends Error {
  constructor(message: string) {
    super(`Invalid tariff config: ${message}`);
    this.name = 'TariffConfigError';
  }
}

function isRecord(v: unknown): v is Record<string, unknown> {
  return typeof v === 'object' && v !== null && !Array.isArray(v);
}

function num(v: unknown, path: string): number {
  if (typeof v !== 'number' || !Number.isFinite(v)) {
    throw new TariffConfigError(`${path} must be a finite number, got ${JSON.stringify(v)}`);
  }
  return v;
}

function str(v: unknown, path: string): string {
  if (typeof v !== 'string' || v.length === 0) {
    throw new TariffConfigError(`${path} must be a non-empty string, got ${JSON.stringify(v)}`);
  }
  return v;
}

function arr(v: unknown, path: string): unknown[] {
  if (!Array.isArray(v)) {
    throw new TariffConfigError(`${path} must be an array, got ${JSON.stringify(v)}`);
  }
  return v;
}

const HHMM = /^([01]\d|2[0-3]):[0-5]\d$/;

function parseDurationTiers(v: unknown): DurationTier[] {
  const raw = arr(v, 'durationTiers');
  if (raw.length === 0) throw new TariffConfigError('durationTiers must not be empty');
  const tiers = raw.map((t, i) => {
    if (!isRecord(t)) throw new TariffConfigError(`durationTiers[${i}] must be an object`);
    const maxMin = num(t.maxMin, `durationTiers[${i}].maxMin`);
    if (maxMin <= 0) throw new TariffConfigError(`durationTiers[${i}].maxMin must be > 0`);
    return {
      maxMin,
      hoursLabel: num(t.hoursLabel, `durationTiers[${i}].hoursLabel`),
      base: num(t.base, `durationTiers[${i}].base`),
    };
  });
  return tiers.sort((a, b) => a.maxMin - b.maxMin);
}

function parsePersonTiers(v: unknown): PersonTier[] {
  const raw = arr(v, 'personTiers');
  if (raw.length === 0) throw new TariffConfigError('personTiers must not be empty');
  const tiers = raw.map((t, i) => {
    if (!isRecord(t)) throw new TariffConfigError(`personTiers[${i}] must be an object`);
    return {
      max: num(t.max, `personTiers[${i}].max`),
      mult: num(t.mult, `personTiers[${i}].mult`),
    };
  });
  return tiers.sort((a, b) => a.max - b.max);
}

function parsePersonBands(v: unknown): PersonBand[] {
  const raw = arr(v, 'personBands');
  if (raw.length === 0) throw new TariffConfigError('personBands must not be empty');
  const bands = raw.map((b, i) => {
    if (!isRecord(b)) throw new TariffConfigError(`personBands[${i}] must be an object`);
    const addRaw = b.addByTier;
    if (!isRecord(addRaw)) {
      throw new TariffConfigError(`personBands[${i}].addByTier must be an object`);
    }
    const addByTier: Record<string, number> = {};
    for (const [k, val] of Object.entries(addRaw)) {
      addByTier[k] = num(val, `personBands[${i}].addByTier.${k}`);
    }
    return { max: num(b.max, `personBands[${i}].max`), addByTier };
  });
  return bands.sort((a, b) => a.max - b.max);
}

function parseSurcharge(v: unknown): SurchargeRule {
  if (!isRecord(v)) throw new TariffConfigError('surcharge must be an object');
  const type = str(v.type, 'surcharge.type');
  if (type === 'none') return { type: 'none' };
  if (type === 'window_or_weekend') {
    const windowStart = str(v.windowStart, 'surcharge.windowStart');
    const windowEnd = str(v.windowEnd, 'surcharge.windowEnd');
    for (const [label, val] of [
      ['surcharge.windowStart', windowStart],
      ['surcharge.windowEnd', windowEnd],
    ] as const) {
      if (!HHMM.test(val)) {
        throw new TariffConfigError(`${label} must be "HH:MM", got ${JSON.stringify(val)}`);
      }
    }
    return {
      type: 'window_or_weekend',
      amount: num(v.amount, 'surcharge.amount'),
      windowStart,
      windowEnd,
    };
  }
  throw new TariffConfigError(`unknown surcharge.type ${JSON.stringify(type)}`);
}

function parseExtras(v: unknown): ExtraDef[] {
  if (v === undefined || v === null) return [];
  const raw = arr(v, 'extras');
  const seen = new Set<string>();
  return raw.map((e, i) => {
    if (!isRecord(e)) throw new TariffConfigError(`extras[${i}] must be an object`);
    const id = str(e.id, `extras[${i}].id`);
    if (seen.has(id)) throw new TariffConfigError(`duplicate extra id ${JSON.stringify(id)}`);
    seen.add(id);
    return {
      id,
      price: num(e.price, `extras[${i}].price`),
      labelDe: str(e.labelDe, `extras[${i}].labelDe`),
      labelEn: str(e.labelEn, `extras[${i}].labelEn`),
    };
  });
}

function parseCaution(v: unknown): CautionRule {
  if (!isRecord(v)) throw new TariffConfigError('caution must be an object');
  const type = str(v.type, 'caution.type');
  if (type === 'none' || type === 'we' || type === 'wa') return { type };
  throw new TariffConfigError(`unknown caution.type ${JSON.stringify(type)}`);
}

/**
 * Parse and validate a `tariffs.config` value. Throws TariffConfigError with a
 * field path on anything malformed.
 */
export function parseTariffConfig(input: unknown): TariffConfig {
  if (!isRecord(input)) throw new TariffConfigError('config must be an object');

  const model = str(input.model, 'model');
  if (model !== 'multiplier' && model !== 'person_band') {
    throw new TariffConfigError(`unknown model ${JSON.stringify(model)}`);
  }

  const cfg: TariffConfig = {
    model,
    durationTiers: parseDurationTiers(input.durationTiers),
    surcharge: parseSurcharge(input.surcharge),
    extras: parseExtras(input.extras),
    caution: parseCaution(input.caution),
  };

  if (model === 'multiplier') {
    cfg.personTiers = parsePersonTiers(input.personTiers);
  } else {
    cfg.personBands = parsePersonBands(input.personBands);
    // Every duration tier must have an entry in every band, or a booking that
    // lands on that tier would silently price as +0.
    for (const band of cfg.personBands) {
      for (const tier of cfg.durationTiers) {
        if (!(String(tier.hoursLabel) in band.addByTier)) {
          throw new TariffConfigError(
            `personBands[max=${band.max}].addByTier is missing an entry for tier "${tier.hoursLabel}"`,
          );
        }
      }
    }
  }

  if (input.bikePricePerUnit !== undefined && input.bikePricePerUnit !== null) {
    cfg.bikePricePerUnit = num(input.bikePricePerUnit, 'bikePricePerUnit');
  }

  return cfg;
}
