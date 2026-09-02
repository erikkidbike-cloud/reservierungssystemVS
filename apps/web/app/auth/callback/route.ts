// Exchanges the magic-link code for a session. Supabase's own verify endpoint
// checks the emailed token, then redirects the browser here with a fresh
// `code` — a Route Handler, not a Server Component, because establishing the
// session means writing cookies, which only Actions and Route Handlers can do.

import { NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import { serverClient } from '@/lib/supabase';

export async function GET(request: Request): Promise<Response> {
  const { searchParams, origin } = new URL(request.url);
  const code = searchParams.get('code');
  const next = searchParams.get('next') ?? '/admin';

  if (code) {
    const supabase = serverClient(await cookies());
    const { error } = await supabase.auth.exchangeCodeForSession(code);
    if (!error) {
      return NextResponse.redirect(`${origin}${next}`);
    }
    return NextResponse.redirect(`${origin}/login?error=${encodeURIComponent(error.message)}`);
  }

  return NextResponse.redirect(
    `${origin}/login?error=${encodeURIComponent('Ungültiger oder abgelaufener Link')}`,
  );
}
