-- Seeds the editable mail templates from their previous hardcoded wording
-- (apps/web/lib/mail-templates.ts, before this migration). ON CONFLICT DO
-- NOTHING — same rule as nv_clauses.sql: this only ever fills in a template
-- that doesn't exist yet, never overwrites an edit made through
-- /admin/mail-templates. See apps/web/lib/mail-vars.ts for what every
-- {{placeholder}} below expands to.

insert into mail_templates (key, subject_de, subject_en, body_de, body_en) values
(
  'request_received',
  'Ihre Anfrage ist eingegangen — {{locationName}}',
  'We received your booking request — {{locationName}}',
  $body$Hallo {{customerName}},

vielen Dank für Ihre Anfrage. Wir haben sie erhalten und melden uns bei Ihnen.
Es handelt sich noch nicht um eine bestätigte Buchung — Sie hören von uns,
sobald wir die Anfrage geprüft haben.

{{bookingFacts}}

Mit freundlichen Grüßen
KidBike e.V. — Verkehrsschulen Friedrichshain-Kreuzberg$body$,
  $body$Hello {{customerName}},

thank you for your request. We have received it and will get back to you.
It is not yet a confirmed booking — you will hear from us once we have
reviewed it.

{{bookingFacts}}

Kind regards
KidBike e.V. — Verkehrsschulen Friedrichshain-Kreuzberg$body$
),
(
  'approved',
  'Ihre Buchung ist bestätigt — {{locationName}}',
  'Your booking is approved — {{locationName}}',
  $body$Hallo {{customerName}},

gute Nachrichten — wir können Ihren Wunschtermin bestätigen.

{{bookingFacts}}

Die Nutzungsvereinbarung schicken wir Ihnen separat zu. Verbindlich wird die
Buchung, sobald die Vereinbarung unterzeichnet ist und die Zahlung bei uns
eingegangen ist.

Mit freundlichen Grüßen
KidBike e.V. — Verkehrsschulen Friedrichshain-Kreuzberg$body$,
  $body$Hello {{customerName}},

good news — we can confirm your requested date.

{{bookingFacts}}

We will send you the usage agreement separately. The booking becomes finally
binding once the agreement is signed and payment has reached us.

Kind regards
KidBike e.V. — Verkehrsschulen Friedrichshain-Kreuzberg$body$
),
(
  'rejected',
  'Zu Ihrer Anfrage — {{locationName}}',
  'About your booking request — {{locationName}}',
  $body$Hallo {{customerName}},

vielen Dank für Ihr Interesse. Leider können wir Ihre Anfrage für diesen
Termin nicht bestätigen.

{{bookingFacts}}
{{reasonLine}}
Für einen anderen Termin sprechen Sie uns gerne wieder an.

Mit freundlichen Grüßen
KidBike e.V. — Verkehrsschulen Friedrichshain-Kreuzberg$body$,
  $body$Hello {{customerName}},

thank you for your interest. Unfortunately we cannot accommodate your request
for this date.

{{bookingFacts}}
{{reasonLine}}
You are very welcome to ask us about a different date.

Kind regards
KidBike e.V. — Verkehrsschulen Friedrichshain-Kreuzberg$body$
),
(
  'cancelled',
  'Ihre Buchung wurde storniert — {{locationName}}',
  'Your booking has been cancelled — {{locationName}}',
  $body$Hallo {{customerName}},

Ihre Buchung wurde storniert.

{{bookingFacts}}
{{reasonLine}}
Bei Rückfragen melden Sie sich gerne bei uns.

Mit freundlichen Grüßen
KidBike e.V. — Verkehrsschulen Friedrichshain-Kreuzberg$body$,
  $body$Hello {{customerName}},

your booking has been cancelled.

{{bookingFacts}}
{{reasonLine}}
Please get in touch if you have any questions.

Kind regards
KidBike e.V. — Verkehrsschulen Friedrichshain-Kreuzberg$body$
),
(
  'confirmed',
  'Ihre Buchung ist verbindlich bestätigt — {{locationName}}',
  'Your booking is confirmed — {{locationName}}',
  $body$Hallo {{customerName}},

alles ist erledigt — Ihre Buchung ist jetzt endgültig bestätigt.

{{bookingFacts}}

Wir freuen uns auf Sie. Sollte sich noch etwas ändern, geben Sie uns bitte
frühzeitig Bescheid.

Mit freundlichen Grüßen
KidBike e.V. — Verkehrsschulen Friedrichshain-Kreuzberg$body$,
  $body$Hello {{customerName}},

everything is in place — your booking is now finally confirmed.

{{bookingFacts}}

We look forward to hosting you. If anything changes on your end, please let
us know as early as you can.

Kind regards
KidBike e.V. — Verkehrsschulen Friedrichshain-Kreuzberg$body$
),
(
  'agreement_sent',
  'Bitte prüfen und unterschreiben — {{locationName}}',
  'Please review and sign — {{locationName}}',
  $body$Hallo {{customerName}},

Ihre Buchung ist bestätigt. Bitte prüfen Sie die Nutzungsvereinbarung und
unterschreiben Sie hier:

{{signingLink}}

{{bookingFacts}}

Verbindlich wird die Buchung, sobald die Vereinbarung unterzeichnet ist und
die Zahlung bei uns eingegangen ist.

Mit freundlichen Grüßen
KidBike e.V. — Verkehrsschulen Friedrichshain-Kreuzberg$body$,
  $body$Hello {{customerName}},

your booking is confirmed. Please review the usage agreement and sign it here:

{{signingLink}}

{{bookingFacts}}

The booking becomes finally binding once the agreement is signed and payment
has reached us.

Kind regards
KidBike e.V. — Verkehrsschulen Friedrichshain-Kreuzberg$body$
),
(
  'new_request_to_location',
  'Neue Anfrage {{locationCode}}: {{customerName}}, {{startsAt}}',
  'New request {{locationCode}}: {{customerName}}, {{startsAt}}',
  $body$Es ist eine neue Buchungsanfrage eingegangen.

{{bookingFacts}}

Anfragende Person:
{{customerName}}
{{customerEmail}}
{{customerPhone}}
{{message}}
{{holdLine}}
{{adminUrl}}

(Diese E-Mail wurde automatisch vom Reservierungssystem verschickt. Antworten
gehen direkt an die anfragende Person.)$body$,
  $body$A new booking request has come in.

{{bookingFacts}}

Requesting person:
{{customerName}}
{{customerEmail}}
{{customerPhone}}
{{message}}
{{holdLine}}
{{adminUrl}}

(This email was sent automatically by the booking system. Replies go
directly to the requesting person.)$body$
)
on conflict (key) do nothing;

-- Reminder templates (0015). Same table, same editor, same placeholders — a
-- reminder rule just points at one of these keys.
insert into mail_templates (key, subject_de, subject_en, body_de, body_en) values
(
  'reminder_payment_due',
  'Erinnerung: Zahlung für {{locationName}}',
  'Reminder: payment for {{locationName}}',
  $body$Hallo {{customerName}},

eine kurze Erinnerung: für Ihre Buchung steht die Zahlung noch aus.
Verbindlich wird die Reservierung erst, wenn der Betrag bei uns eingegangen ist.

{{bookingFacts}}

Mit freundlichen Grüßen
KidBike e.V. — Verkehrsschulen Friedrichshain-Kreuzberg$body$,
  $body$Hello {{customerName}},

a short reminder: payment for your booking is still outstanding. The
reservation only becomes binding once we have received the amount.

{{bookingFacts}}

Kind regards
KidBike e.V. — Verkehrsschulen Friedrichshain-Kreuzberg$body$
),
(
  'reminder_before_event',
  'Ihr Termin bei {{locationName}} steht bevor',
  'Your booking at {{locationName}} is coming up',
  $body$Hallo {{customerName}},

Ihr Termin rückt näher — hier noch einmal die wichtigsten Angaben.

{{bookingFacts}}

Bitte denken Sie an eine pünktliche Übergabe und daran, das Gelände sauber
zu hinterlassen. Bei Fragen melden Sie sich gerne.

Mit freundlichen Grüßen
KidBike e.V. — Verkehrsschulen Friedrichshain-Kreuzberg$body$,
  $body$Hello {{customerName}},

your booking is coming up — here are the key details once more.

{{bookingFacts}}

Please arrive on time and leave the site clean. Get in touch if you have any
questions.

Kind regards
KidBike e.V. — Verkehrsschulen Friedrichshain-Kreuzberg$body$
),
(
  'reminder_after_event',
  'Danke für Ihren Besuch bei {{locationName}}',
  'Thank you for visiting {{locationName}}',
  $body$Hallo {{customerName}},

vielen Dank, dass Sie bei uns gefeiert haben. Wir hoffen, Sie hatten einen
schönen Tag.

{{bookingFacts}}

Eine etwaige Kaution erstatten wir innerhalb von 14 Tagen zurück.

Mit freundlichen Grüßen
KidBike e.V. — Verkehrsschulen Friedrichshain-Kreuzberg$body$,
  $body$Hello {{customerName}},

thank you for celebrating with us. We hope you had a lovely day.

{{bookingFacts}}

Any deposit held will be refunded within 14 days.

Kind regards
KidBike e.V. — Verkehrsschulen Friedrichshain-Kreuzberg$body$
)
on conflict (key) do nothing;
