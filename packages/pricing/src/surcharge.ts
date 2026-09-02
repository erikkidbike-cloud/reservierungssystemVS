// Time surcharge. Ports defaultSurcharge30 (index.html:984-998).
// A flat surcharge applies when start OR end falls outside the daytime window,
// OR the period touches a weekend. Otherwise 0. The 'none' rule (WA) is always 0.

import type { SurchargeRule } from './types.ts';
import { minutesOfDay, parseHmToMinutes, touchesWeekend } from './time.ts';

export function computeSurcharge(rule: SurchargeRule, start: Date, end: Date): number {
  if (rule.type === 'none') return 0;

  const winStart = parseHmToMinutes(rule.windowStart);
  const winEnd = parseHmToMinutes(rule.windowEnd);
  const insideWindow = (dt: Date) => {
    const m = minutesOfDay(dt);
    return m >= winStart && m <= winEnd;
  };

  const bothOutside = !(insideWindow(start) && insideWindow(end));
  return bothOutside || touchesWeekend(start, end) ? rule.amount : 0;
}
