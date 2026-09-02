// Keeps the Supabase session cookie fresh on every page request.
//
// Server Components can only READ cookies — Next.js forbids writing them
// during render — so a refreshed access token has nowhere to be written from
// there. Without this middleware, a session can silently die when its
// short-lived access token expires even though the long-lived refresh-token
// cookie is still good, logging someone out mid-session for no reason visible
// to them. Middleware runs before rendering and CAN write response cookies,
// which is the one place this refresh belongs. This is Supabase's own
// documented pattern for Next.js App Router (@supabase/ssr).
//
// Uses its own inline client rather than lib/supabase.ts's serverClient():
// middleware's request/response cookie API has a different shape (read from
// the request, write to the response) than the unified cookies() object
// serverClient() is built for (Server Components/Actions/Route Handlers).

import { createServerClient, type CookieOptions } from '@supabase/ssr';
import { NextResponse, type NextRequest } from 'next/server';

export async function middleware(request: NextRequest) {
  let response = NextResponse.next({ request });

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll: () => request.cookies.getAll(),
        // Annotated explicitly: createServerClient accepts a union of the
        // current and deprecated cookie shapes, which blocks contextual typing
        // of this callback (see lib/supabase.ts for the same fix).
        setAll: (cookiesToSet: Array<{ name: string; value: string; options: CookieOptions }>) => {
          cookiesToSet.forEach(({ name, value }) => request.cookies.set(name, value));
          response = NextResponse.next({ request });
          cookiesToSet.forEach(({ name, value, options }) =>
            response.cookies.set(name, value, options),
          );
        },
      },
    },
  );

  // The call itself is what triggers "refresh if the access token is stale,
  // and if so rewrite the cookies via setAll above."
  await supabase.auth.getUser();

  return response;
}

export const config = {
  // Page routes only. /api/* handles its own auth per-route (the public
  // booking endpoint needs none at all), so it's excluded to avoid an
  // unnecessary Supabase round-trip on every anonymous request there.
  matcher: ['/((?!_next/static|_next/image|favicon.ico|api|.*\\.(?:svg|png|jpg|jpeg|webp)$).*)'],
};
