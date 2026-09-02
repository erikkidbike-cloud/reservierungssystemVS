// Public API of the pricing package. Import from here.
//   import { computePrice, DEFAULT_TARIFFS, validateRequest } from '@vs/pricing';

export * from './types.ts';
export { computePrice } from './pricing.ts';
export { computeSurcharge } from './surcharge.ts';
export { computeCaution } from './caution.ts';
export {
  WE_STANDARD,
  WI_STANDARD,
  WA_STANDARD,
  DEFAULT_TARIFFS,
} from './config.ts';
export {
  overlaps,
  minStartDate,
  violatesClosing,
  validateRequest,
  type LocationRules,
  type ValidationCode,
  type ValidationResult,
  type ValidateRequestInput,
} from './validation.ts';
export {
  minutesOfDay,
  parseHmToMinutes,
  crossesMidnight,
  touchesWeekend,
  touchesSunday,
  durationMinutes,
} from './time.ts';
