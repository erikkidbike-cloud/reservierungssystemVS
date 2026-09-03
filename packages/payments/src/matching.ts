// Payment matching: which bank transaction pays for which booking.
// Backlog 4.1. Pure function, no SevDesk or database dependency, so the
// matching RULE can be pinned with tests independent of ever having a real
// SevDesk API token — see sevdesk-client.ts for the (unverified, see its own
// header) part that actually talks to SevDesk.
//
// Rule: a transaction matches a booking when its stated purpose CONTAINS the
// booking's Verwendungszweck (case- and whitespace-insensitive — a bank's own
// UI or the payer's phone autocorrect can reformat spacing) AND the amount
// equals the booking's price_total exactly. Case-cost of being wrong here is
// asymmetric: this only ever proposes 'signed'→'paid'; a missed match is
// merely a booking that needs manual entry (see admin/payments), a wrong
// match would silently mark someone else's booking paid — so ambiguity
// (two candidate bookings for one transaction) is refused rather than guessed,
// and only 'signed' bookings are proposed at all: at every other status this
// booking isn't expecting a matching payment right now, so it isn't offered as
// a candidate even if the numbers happen to line up.

export interface PaymentTransaction {
  /** SevDesk transaction id. */
  id: string;
  amount: number;
  /** Bank-supplied payment purpose text ("Verwendungszweck" as the payer typed it). */
  purpose: string | null;
  bookedAt: string; // ISO date
}

export interface PayableBooking {
  id: string;
  status: string;
  verwendungszweck: string | null;
  priceTotal: number | null;
}

export interface PaymentMatch {
  transactionId: string;
  bookingId: string;
  amount: number;
}

function normalize(s: string): string {
  return s.toUpperCase().replace(/\s+/g, '');
}

/**
 * Match each transaction to at most one booking. A transaction that matches
 * zero or more than one 'signed' booking is skipped (left for manual review)
 * rather than guessed — see the module doc for why.
 */
export function matchPayments(
  transactions: PaymentTransaction[],
  bookings: PayableBooking[],
): PaymentMatch[] {
  const candidates = bookings.filter(
    (b) => b.status === 'signed' && b.verwendungszweck && b.priceTotal != null,
  );

  const matches: PaymentMatch[] = [];
  const claimed = new Set<string>();

  for (const tx of transactions) {
    if (!tx.purpose) continue;
    const purposeNorm = normalize(tx.purpose);

    const found = candidates.filter(
      (b) =>
        !claimed.has(b.id) &&
        purposeNorm.includes(normalize(b.verwendungszweck as string)) &&
        Math.abs(tx.amount - (b.priceTotal as number)) < 0.01,
    );

    if (found.length === 1) {
      matches.push({ transactionId: tx.id, bookingId: found[0].id, amount: tx.amount });
      claimed.add(found[0].id);
    }
  }

  return matches;
}
