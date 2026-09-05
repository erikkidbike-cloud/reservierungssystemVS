import { NextResponse } from 'next/server';
import { adminClient } from '@/lib/supabase';
import { isCronAuthorized } from '@/lib/cron-auth';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

export async function GET(request: Request) {
  if (!isCronAuthorized(request)) {
    return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  }

  const admin = adminClient();
  const { data, error } = await admin.rpc('auto_complete_past_bookings');

  if (error) {
    console.error('[cron/auto-complete] RPC failed', error);
    return NextResponse.json({ ok: false, error: error.message }, { status: 500 });
  }

  return NextResponse.json({ ok: true, completed_count: data });
}

export async function POST(request: Request) {
  return GET(request);
}
