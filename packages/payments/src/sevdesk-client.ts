// Thin SevDesk API client — the part of backlog 4.1 that could NOT be pinned
// with tests, because this project has no SevDesk API token (open question 14
// in docs/05-open-questions.md is still open). The endpoint, auth scheme and
// field names below are from SevDesk's own published API reference as of this
// writing, NOT verified against a real response — before relying on this in
// production, run fetchRecentTransactions() once against a real account and
// confirm the field names below still match what comes back.
//
// What IS trustworthy without a token: matching.ts's matchPayments(), which
// takes plain objects and has no SevDesk dependency at all.

export interface SevDeskConfig {
  apiToken: string;
  /** Defaults to SevDesk's own base URL; overridable for a sandbox/mock in tests. */
  baseUrl?: string;
}

interface SevDeskTransactionResponse {
  objects: Array<{
    id: string;
    amount: string | number;
    paymtPurpose: string | null;
    valueDate: string;
    status: number;
  }>;
}

export interface RawSevDeskTransaction {
  id: string;
  amount: number;
  purpose: string | null;
  bookedAt: string;
}

/**
 * Transactions booked in the given window. SevDesk's own docs show
 * start/endDate as Unix-seconds query params on GET /CheckAccountTransaction,
 * with the response's `objects[].amount` as a numeric string, `paymtPurpose`
 * as the bank payment reference text, and `valueDate` as an ISO date.
 */
export async function fetchRecentTransactions(
  config: SevDeskConfig,
  sinceDate: Date,
): Promise<RawSevDeskTransaction[]> {
  const base = config.baseUrl ?? 'https://my.sevdesk.de/api/v1';
  const startDate = Math.floor(sinceDate.getTime() / 1000);
  const endDate = Math.floor(Date.now() / 1000);

  const res = await fetch(
    `${base}/CheckAccountTransaction?startDate=${startDate}&endDate=${endDate}&limit=200`,
    { headers: { Authorization: config.apiToken } },
  );

  if (!res.ok) {
    throw new Error(`SevDesk API responded ${res.status}: ${await res.text().catch(() => '')}`);
  }

  const json = (await res.json()) as SevDeskTransactionResponse;
  return (json.objects ?? []).map((o) => ({
    id: o.id,
    amount: typeof o.amount === 'string' ? parseFloat(o.amount) : o.amount,
    purpose: o.paymtPurpose,
    bookedAt: o.valueDate,
  }));
}
