import { NextResponse } from 'next/server';
import { adminClient } from '@/lib/supabase';
import { loadLocation, parseBerlinLocal } from '@/lib/booking-pricing';
import { checkRateLimit, looksLikeBot, WAITLIST_LIMITS } from '@/lib/rate-limit';
import { text, LIMITS } from '@/lib/input';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

interface WaitlistBody {
  school?: string;
  from?: string;
  to?: string;
  persons?: number | string;
  customer_name?: string;
  customer_email?: string;
  customer_phone?: string;
  message?: string;
}

export async function POST(request: Request) {
  let body: WaitlistBody;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ ok: false, error: 'invalid_json' }, { status: 400 });
  }

  // Same abuse protection as /api/booking-request — this endpoint is just as
  // anonymous and writes just as freely.
  if (looksLikeBot(body as Record<string, unknown>)) {
    console.warn('[waitlist] honeypot tripped, rejecting');
    return NextResponse.json({ ok: false, error: 'rate_limited' }, { status: 429 });
  }
  const rate = await checkRateLimit(request, WAITLIST_LIMITS);
  if (!rate.allowed) {
    console.warn(`[waitlist] rate limit hit: ${rate.tripped}`);
    return NextResponse.json({ ok: false, error: 'rate_limited' }, { status: 429 });
  }

  const code = (text(body.school, 16) ?? '').toUpperCase();
  if (!code) return NextResponse.json({ ok: false, error: 'missing_school' }, { status: 400 });

  const start = body.from ? parseBerlinLocal(body.from) : null;
  const end = body.to ? parseBerlinLocal(body.to) : null;
  if (!start || !end || end <= start) {
    return NextResponse.json({ ok: false, error: 'invalid_range' }, { status: 400 });
  }

  // Capped for the same reason as /api/booking-request — see lib/input.ts.
  const name = text(body.customer_name) ?? '';
  if (!name) return NextResponse.json({ ok: false, error: 'missing_name' }, { status: 400 });

  const email = text(body.customer_email, 254) ?? '';
  if (!email || !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) {
    return NextResponse.json({ ok: false, error: 'invalid_email' }, { status: 400 });
  }

  const location = await loadLocation(code);
  if (!location) {
    return NextResponse.json({ ok: false, error: 'location_not_found' }, { status: 404 });
  }

  const persons = Number(body.persons || 0);

  const admin = adminClient();
  const { data, error } = await admin
    .from('waitlist_requests')
    .insert({
      location_id: location.id,
      starts_at: start.toISOString(),
      ends_at: end.toISOString(),
      customer_name: name,
      customer_email: email,
      customer_phone: text(body.customer_phone, 40),
      persons: Number.isFinite(persons) && persons > 0 ? persons : null,
      message: text(body.message, LIMITS.message),
      status: 'waiting',
    })
    .select('id')
    .single();

  if (error) {
    console.error('[waitlist] insert failed', error);
    return NextResponse.json({ ok: false, error: 'server_error' }, { status: 500 });
  }

  return NextResponse.json({ ok: true, id: data.id });
}
