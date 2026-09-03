// Builds @vs/documents' NvData from a real booking row — the one place that
// turns "a row from the bookings/locations/customers tables" into "what the
// agreement renderer needs", so the signing page and any future PDF/email step
// can't each invent a slightly different mapping.

import type { NvData, Lang } from '@vs/documents';

export interface BookingForNv {
  starts_at: string;
  ends_at: string;
  persons: number | null;
  event_type: string | null;
  price_total: number | null;
  caution: number | null;
  verwendungszweck: string | null;
  needs_id_upload: boolean;
  lang: string;
}

export interface LocationForNv {
  code: string;
  name: string;
  address: string | null;
  phone: string | null;
}

export interface CustomerForNv {
  salutation: string | null;
  first_name: string | null;
  last_name: string | null;
  organization: string | null;
  address_full: string | null;
  email: string | null;
  phone: string | null;
}

export function bookingToNvData(
  booking: BookingForNv,
  location: LocationForNv,
  customer: CustomerForNv | null,
  signingLink: string | null,
): NvData {
  const startsAt = new Date(booking.starts_at);
  const payBy = new Date(startsAt);
  payBy.setDate(payBy.getDate() - 14);

  return {
    locationCode: location.code,
    locationName: location.name,
    locationAddress: location.address ?? '',
    locationPhone: location.phone,
    customer: {
      salutation: customer?.salutation,
      firstName: customer?.first_name,
      lastName: customer?.last_name,
      organization: customer?.organization,
      addressFull: customer?.address_full,
      email: customer?.email,
      phone: customer?.phone,
    },
    startsAt,
    endsAt: new Date(booking.ends_at),
    persons: booking.persons,
    eventType: booking.event_type,
    priceTotal: booking.price_total,
    caution: booking.caution,
    paymentReference: booking.verwendungszweck,
    payBy,
    needsIdUpload: booking.needs_id_upload,
    signingLink,
    lang: (booking.lang === 'en' ? 'en' : 'de') as Lang,
  };
}
