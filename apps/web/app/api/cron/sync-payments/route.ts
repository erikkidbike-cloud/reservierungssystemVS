// SevDesk sync (backlog 4.1) — pulls recent bank transactions and matches
// them to bookings awaiting payment. NOT wired to a schedule by anything in
// this repo yet: call it from a Supabase pg_cron job (via `net.http_post`,
// same idea as supabase/post-deploy/schedule-expire-holds.sql) or any external
// scheduler, once SEVDESK_API_TOKEN is set — see .env.example.
//
// Inert without configuration, same pattern as lib/mail.ts: no token means
// "skipped", not an error, so the app runs fine before SevDesk access exists.
// The matching RULE (packages/payments' matchPayments) is fully tested; the
// SevDesk API SHAPE (sevdesk-client.ts) is not verified against a real
// response yet — see that file's header before trusting this in production.
//
// Authenticated by a shared secret rather than a user session: nobody is
// logged in when this fires from a scheduler.

import { NextResponse } from 'next/server';
import { adminClient } from '@/lib/supabase';
import { applyPayment } from '@/lib/payments';
import { fetchRecentTransactions, matchPayments, type PayableBooking } from '@vs/payments';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

/** How far back to pull transactions: past the 14-day cancellation window, with slack for a slow transfer. */
const LOOKBACK_DAYS = 60;

export async function POST(request: Request): Promise<Response> {
  const secret = process.env.CRON_SECRET;
  if (!secret || request.headers.get('x-cron-secret') !== secret) {
    return NextResponse.json({ ok: false, error: 'unauthorized' }, { status: 401 });
  }

  const apiToken = process.env.SEVDESK_API_TOKEN;
  if (!apiToken) {
    return NextResponse.json({ ok: true, skipped: true, reason: 'SEVDESK_API_TOKEN not configured' });
  }

  const admin = adminClient();
  const { data: bookingsRaw, error } = await admin
    .from('bookings')
    .select('id, status, verwendungszweck, price_total')
    .eq('status', 'signed');

  if (error) return NextResponse.json({ ok: false, error: error.message }, { status: 500 });

  const bookings: PayableBooking[] = (bookingsRaw ?? []).map((b) => ({
    id: b.id,
    status: b.status,
    verwendungszweck: b.verwendungszweck,
    priceTotal: b.price_total,
  }));

  if (bookings.length === 0) {
    return NextResponse.json({ ok: true, awaiting: 0, matched: 0, applied: 0 });
  }

  const since = new Date();
  since.setDate(since.getDate() - LOOKBACK_DAYS);

  let transactions;
  try {
    transactions = await fetchRecentTransactions({ apiToken }, since);
  } catch (err) {
    console.error('[sevdesk-sync] fetch failed', err);
    return NextResponse.json({ ok: false, error: 'sevdesk_fetch_failed' }, { status: 502 });
  }

  const matches = matchPayments(
    transactions.map((t) => ({ id: t.id, amount: t.amount, purpose: t.purpose, bookedAt: t.bookedAt })),
    bookings,
  );

  let applied = 0;
  for (const m of matches) {
    const tx = transactions.find((t) => t.id === m.transactionId);
    if (!tx) continue;
    const result = await applyPayment(admin, {
      bookingId: m.bookingId,
      amount: m.amount,
      purpose: tx.purpose,
      sevdeskId: tx.id,
      matchKind: 'sevdesk',
      bookedAt: tx.bookedAt.slice(0, 10),
    });
    if (result.ok) applied += 1;
    else console.error('[sevdesk-sync] apply failed for booking', m.bookingId, result.error);
  }

  return NextResponse.json({
    ok: true,
    awaiting: bookings.length,
    transactions: transactions.length,
    matched: matches.length,
    applied,
  });
}
