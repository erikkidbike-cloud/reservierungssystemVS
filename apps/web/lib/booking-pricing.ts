// Server-side pricing: loads the tariff config from the database and runs the
// shared engine. This is the ONLY place a price is produced for a booking — the
// client's number is never trusted, and the algorithm has one implementation
// (@vs/pricing) shared with the public form's live preview.

import {
  computePrice,
  parseTariffConfig,
  validateRequest,
  type PriceRequest,
  type PriceResult,
  type LocationRules,
  type ValidationCode,
} from '@vs/pricing';
import { adminClient } from './supabase';
import type { Location, TariffType } from './db-types';

/**
 * Parse a naive local datetime ("2026-03-10T10:00") as Berlin wall-clock time.
 *
 * The engine reads wall-clock values with local date getters, matching the
 * browser it was ported from, so the server process must run in Europe/Berlin
 * (set TZ=Europe/Berlin — see .env.example). Building the Date with the local
 * multi-argument constructor then makes getHours() return exactly the hour the
 * customer picked, and the stored UTC instant is correct.
 */
export function parseBerlinLocal(value: string): Date | null {
  const m = /^(\d{4})-(\d{2})-(\d{2})[T ](\d{2}):(\d{2})/.exec(value);
  if (!m) return null;
  const [, y, mo, d, h, mi] = m;
  const dt = new Date(Number(y), Number(mo) - 1, Number(d), Number(h), Number(mi));
  return Number.isNaN(dt.getTime()) ? null : dt;
}

export async function loadLocation(code: string): Promise<Location | null> {
  const { data, error } = await adminClient()
    .from('locations')
    .select('*')
    .eq('code', code)
    .eq('is_active', true)
    .maybeSingle();
  if (error) throw new Error(`Failed to load location ${code}: ${error.message}`);
  return (data as Location) ?? null;
}

/** The tariff in force today for this location + type. */
export async function loadTariffConfig(locationId: string, tariffType: TariffType) {
  const today = new Date().toISOString().slice(0, 10);
  const { data, error } = await adminClient()
    .from('tariffs')
    .select('config, valid_from, valid_to')
    .eq('location_id', locationId)
    .eq('tariff_type', tariffType)
    .eq('is_active', true)
    .lte('valid_from', today)
    .order('valid_from', { ascending: false })
    .limit(1);

  if (error) throw new Error(`Failed to load tariff: ${error.message}`);
  const row = data?.[0];
  if (!row) throw new Error(`No active ${tariffType} tariff for location ${locationId}`);
  if (row.valid_to && row.valid_to < today) {
    throw new Error(`Tariff for location ${locationId} expired on ${row.valid_to}`);
  }
  // Throws TariffConfigError (with a field path) if the row is malformed.
  return parseTariffConfig(row.config);
}

export function rulesFor(location: Location): LocationRules {
  return {
    closingHour: location.closing_hour,
    minLeadDays: location.min_lead_days,
    minDurationMinutes: location.min_duration_minutes,
  };
}

export interface QuoteResult {
  ok: boolean;
  errors: ValidationCode[];
  price: PriceResult | null;
}

/**
 * Validate and price a request. Validation runs here as well as in the database
 * function: this gives the caller all failing codes at once for a good error
 * message, while create_booking_request remains the authoritative guard.
 */
export async function quote(
  location: Location,
  req: PriceRequest,
  tariffType: TariffType = 'standard',
  opts: { enforceLeadTime?: boolean } = {},
): Promise<QuoteResult> {
  const rules = rulesFor(location);
  const effectiveRules =
    opts.enforceLeadTime === false ? { ...rules, minLeadDays: 0 } : rules;

  const validation = validateRequest({
    start: req.start,
    end: req.end,
    rules: effectiveRules,
  });

  const config = await loadTariffConfig(location.id, tariffType);
  const price = computePrice(req, config);

  return { ok: validation.ok, errors: validation.errors, price };
}
