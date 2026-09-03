// Kaution (deposit). Ports PRICING.WE.cautionFn (index.html:1030-1057) and
// PRICING.WA.cautionFn (index.html:1091-1095). See docs/01-business-rules.md §3.5.
//
// ⚠️ The WE BRANCHING is flagged "Verify" by the owner (open question 7),
// including the now-unreachable 500 € "runs past 22:00" branch. This
// reproduces the live code's decision structure exactly; do not change WHEN
// each amount applies without the owner's confirmation. The amounts
// THEMSELVES (personsThreshold/amountInWindow/amountStandard/amountHigh) are
// now config parameters rather than literals — see TariffConfig's caution
// field — specifically so they can be tuned from the admin tariff editor
// without touching this file at all.

import type { CautionRule } from './types.ts';
import { minutesOfDay, crossesMidnight, touchesSunday } from './time.ts';

export function computeCaution(
  rule: CautionRule,
  persons: number,
  start: Date | null,
  end: Date | null,
): number | null {
  if (rule.type === 'none') return null;

  const p = Number(persons || 0);

  if (rule.type === 'wa') {
    if (!p) return null;
    return p <= rule.personsThreshold ? rule.amountBelow : rule.amountAtOrAbove;
  }

  // rule.type === 'we'
  if (!p || !start || !end) return null;

  const withinDayTimes = (dt: Date) => {
    const m = minutesOfDay(dt);
    return m >= 9 * 60 && m <= 17 * 60 + 30;
  };
  const cross = crossesMidnight(start, end);
  const sunday = touchesSunday(start, end);
  const runsPast22 =
    cross || minutesOfDay(end) > 22 * 60 || minutesOfDay(start) > 22 * 60;

  const inWindow = !cross && withinDayTimes(start) && withinDayTimes(end) && !sunday;

  if (runsPast22) return rule.amountHigh; // unreachable for new bookings since the 22:00 block
  if (p > rule.personsThreshold && !inWindow) return rule.amountHigh;
  if (p > rule.personsThreshold) return rule.amountStandard;
  if (inWindow) return rule.amountInWindow;
  return rule.amountStandard;
}
