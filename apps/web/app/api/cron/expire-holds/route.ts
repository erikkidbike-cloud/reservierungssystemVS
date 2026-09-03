import { NextResponse } from 'next/server';
import { adminClient } from '@/lib/supabase';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

function isAuthorized(request: Request): boolean {
  const secret = process.env.CRON_SECRET;
  if (!secret) return false;
  const authHeader = request.headers.get('authorization');
  if (authHeader === `Bearer ${secret}`) return true;
  const url = new URL(request.url);
  if (url.searchParams.get('secret') === secret) return true;
  return false;
}

export async function GET(request: Request) {
  if (!isAuthorized(request)) {
    return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  }

  const admin = adminClient();
  const { data, error } = await admin.rpc('expire_holds');

  if (error) {
    console.error('[cron/expire-holds] RPC failed', error);
    return NextResponse.json({ ok: false, error: error.message }, { status: 500 });
  }

  return NextResponse.json({ ok: true, expired_count: data });
}

export async function POST(request: Request) {
  return GET(request);
}
