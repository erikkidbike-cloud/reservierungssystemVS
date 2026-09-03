// Message bodies, kept separate from the transport (lib/mail.ts) so the wording
// is easy to find and change without touching sending logic.
//
// German for staff-facing mail; customer-facing mail follows the language the
// customer chose when booking, matching how the Nutzungsvereinbarung is
// rendered.

import { fmtDateTime, fmtEuro, type MailMessage } from './mail';

export interface BookingMailContext {
  locationName: string;
  locationCode: string;
  startsAt: string | Date;
  endsAt: string | Date;
  persons: number | null;
  eventType?: string | null;
  priceTotal?: number | null;
  caution?: number | null;
  message?: string | null;
  customerName: string;
  customerEmail: string;
  customerPhone?: string | null;
  holdExpiresAt?: string | Date | null;
  /** Absolute link into the admin console for this booking. */
  adminUrl?: string | null;
  lang?: 'de' | 'en';
}

function bookingFacts(c: BookingMailContext, lang: 'de' | 'en'): string {
  const L =
    lang === 'en'
      ? { loc: 'Venue', when: 'When', people: 'People', type: 'Type', fee: 'Fee', dep: 'Deposit' }
      : { loc: 'Ort', when: 'Zeit', people: 'Personen', type: 'Art', fee: 'Entgelt', dep: 'Kaution' };

  const lines = [
    `${L.loc}: ${c.locationName}`,
    `${L.when}: ${fmtDateTime(c.startsAt, lang)} – ${fmtDateTime(c.endsAt, lang)}`,
    `${L.people}: ${c.persons ?? '—'}`,
  ];
  if (c.eventType) lines.push(`${L.type}: ${c.eventType}`);
  if (c.priceTotal !== null && c.priceTotal !== undefined) {
    lines.push(`${L.fee}: ${fmtEuro(c.priceTotal, lang)}`);
  }
  if (c.caution !== null && c.caution !== undefined) {
    lines.push(`${L.dep}: ${fmtEuro(c.caution, lang)}`);
  }
  return lines.join('\n');
}

/** To the location's team: a new request has come in and needs a decision. */
export function newRequestToLocation(c: BookingMailContext, to: string[]): MailMessage {
  const hold = c.holdExpiresAt
    ? `\nDie Reservierung ist bis ${fmtDateTime(c.holdExpiresAt, 'de')} vorgemerkt und verfällt danach automatisch.`
    : '';

  return {
    to,
    replyTo: c.customerEmail,
    subject: `Neue Anfrage ${c.locationCode}: ${c.customerName}, ${fmtDateTime(c.startsAt, 'de')}`,
    text: `Es ist eine neue Buchungsanfrage eingegangen.

${bookingFacts(c, 'de')}

Anfragende Person:
${c.customerName}
${c.customerEmail}${c.customerPhone ? `\n${c.customerPhone}` : ''}
${c.message ? `\nNachricht:\n${c.message}\n` : ''}${hold}
${c.adminUrl ? `\nBearbeiten: ${c.adminUrl}` : ''}

(Diese E-Mail wurde automatisch vom Reservierungssystem verschickt. Antworten
gehen direkt an die anfragende Person.)`,
  };
}

/** To the customer: we received it, here's what happens next. */
export function requestReceivedToCustomer(c: BookingMailContext): MailMessage {
  const lang = c.lang ?? 'de';

  if (lang === 'en') {
    return {
      to: [c.customerEmail],
      subject: `We received your booking request — ${c.locationName}`,
      text: `Hello ${c.customerName},

thank you for your request. We have received it and will get back to you.
It is not yet a confirmed booking — you will hear from us once we have
reviewed it.

${bookingFacts(c, 'en')}

Kind regards
KidBike e.V. — Verkehrsschulen Friedrichshain-Kreuzberg`,
    };
  }

  return {
    to: [c.customerEmail],
    subject: `Ihre Anfrage ist eingegangen — ${c.locationName}`,
    text: `Hallo ${c.customerName},

vielen Dank für Ihre Anfrage. Wir haben sie erhalten und melden uns bei Ihnen.
Es handelt sich noch nicht um eine bestätigte Buchung — Sie hören von uns,
sobald wir die Anfrage geprüft haben.

${bookingFacts(c, 'de')}

Mit freundlichen Grüßen
KidBike e.V. — Verkehrsschulen Friedrichshain-Kreuzberg`,
  };
}

/** To the customer: approved. */
export function approvedToCustomer(c: BookingMailContext): MailMessage {
  const lang = c.lang ?? 'de';

  if (lang === 'en') {
    return {
      to: [c.customerEmail],
      subject: `Your booking is approved — ${c.locationName}`,
      text: `Hello ${c.customerName},

good news — we can confirm your requested date.

${bookingFacts(c, 'en')}

We will send you the usage agreement separately. The booking becomes finally
binding once the agreement is signed and payment has reached us.

Kind regards
KidBike e.V. — Verkehrsschulen Friedrichshain-Kreuzberg`,
    };
  }

  return {
    to: [c.customerEmail],
    subject: `Ihre Buchung ist bestätigt — ${c.locationName}`,
    text: `Hallo ${c.customerName},

gute Nachrichten — wir können Ihren Wunschtermin bestätigen.

${bookingFacts(c, 'de')}

Die Nutzungsvereinbarung schicken wir Ihnen separat zu. Verbindlich wird die
Buchung, sobald die Vereinbarung unterzeichnet ist und die Zahlung bei uns
eingegangen ist.

Mit freundlichen Grüßen
KidBike e.V. — Verkehrsschulen Friedrichshain-Kreuzberg`,
  };
}

/**
 * To the customer: declined. This closes open question 13 — the old system
 * silently set a hold to "rejected" and never told the requester anything.
 */
export function rejectedToCustomer(c: BookingMailContext, reason?: string | null): MailMessage {
  const lang = c.lang ?? 'de';

  if (lang === 'en') {
    return {
      to: [c.customerEmail],
      subject: `About your booking request — ${c.locationName}`,
      text: `Hello ${c.customerName},

thank you for your interest. Unfortunately we cannot accommodate your request
for this date.

${bookingFacts(c, 'en')}
${reason ? `\nReason: ${reason}\n` : ''}
You are very welcome to ask us about a different date.

Kind regards
KidBike e.V. — Verkehrsschulen Friedrichshain-Kreuzberg`,
    };
  }

  return {
    to: [c.customerEmail],
    subject: `Zu Ihrer Anfrage — ${c.locationName}`,
    text: `Hallo ${c.customerName},

vielen Dank für Ihr Interesse. Leider können wir Ihre Anfrage für diesen
Termin nicht bestätigen.

${bookingFacts(c, 'de')}
${reason ? `\nGrund: ${reason}\n` : ''}
Für einen anderen Termin sprechen Sie uns gerne wieder an.

Mit freundlichen Grüßen
KidBike e.V. — Verkehrsschulen Friedrichshain-Kreuzberg`,
  };
}

/** To the customer: cancelled after it had already been approved. */
export function cancelledToCustomer(c: BookingMailContext, reason?: string | null): MailMessage {
  return {
    to: [c.customerEmail],
    subject: `Ihre Buchung wurde storniert — ${c.locationName}`,
    text: `Hallo ${c.customerName},

Ihre Buchung wurde storniert.

${bookingFacts(c, 'de')}
${reason ? `\nGrund: ${reason}\n` : ''}
Bei Rückfragen melden Sie sich gerne bei uns.

Mit freundlichen Grüßen
KidBike e.V. — Verkehrsschulen Friedrichshain-Kreuzberg`,
  };
}
