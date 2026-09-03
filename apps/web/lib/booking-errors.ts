// German wording for the machine codes raised by the two guards a booking has
// to pass: validateRequest() in @vs/pricing and create_booking_request() in the
// database. Both use the same vocabulary deliberately (see 0007_functions.sql),
// so one table covers them and a code can never be phrased two different ways
// in two different screens.

export const BOOKING_ERROR_DE: Record<string, string> = {
  invalid_range: 'Ende liegt vor dem Beginn — bitte Zeitraum prüfen.',
  too_short: 'Der Zeitraum ist kürzer als die Mindestdauer dieses Standorts.',
  too_soon: 'Der Termin liegt innerhalb der Vorlauffrist.',
  closing_violation:
    'Außerhalb der Öffnungszeiten: der Zeitraum muss am selben Tag zwischen 06:00 Uhr und der Schließzeit des Standorts liegen.',
  overlap: 'In diesem Zeitraum ist der Standort bereits belegt.',
  slot_taken: 'In diesem Zeitraum ist der Standort bereits belegt.',
  location_not_found: 'Der Standort wurde nicht gefunden oder ist nicht aktiv.',
  not_online_bookable: 'Dieser Standort ist nicht online buchbar.',
  invalid_persons: 'Bitte eine Personenzahl größer als 0 angeben.',
  invalid_email: 'Die E-Mail-Adresse sieht nicht gültig aus.',
  missing_location: 'Bitte einen Standort auswählen.',
  forbidden: 'Für diesen Standort fehlt die Berechtigung, Buchungen anzulegen.',
  pricing_failed: 'Der Preis konnte nicht berechnet werden — bitte den Tarif prüfen.',
};

/** Falls back to the raw code rather than hiding an error we have no wording for. */
export function bookingErrorDe(code: string): string {
  return BOOKING_ERROR_DE[code] ?? code;
}
