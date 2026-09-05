// Narrowing a `locations` row down to what a public page may know about it.
//
// Shared by /book and /widget/booking rather than duplicated: it is the line
// between internal and public fields, and a second copy of that line is a
// second chance to leak cc_emails or hold_business_days into a page anyone can
// open.

import type { Location } from './db-types';
import type { PublicLocation } from '../app/book/BookingWizard';

export function toPublicLocation(l: Location): PublicLocation {
  return {
    code: l.code,
    name: l.name,
    address: l.address,
    phone: l.phone,
    onlineBookability: l.online_bookability,
    closingHour: l.closing_hour,
    minLeadDays: l.min_lead_days,
    minDurationMinutes: l.min_duration_minutes,
    gridMinHour: l.grid_min_hour,
    gridMaxEndHour: l.grid_max_end_hour,
  };
}
