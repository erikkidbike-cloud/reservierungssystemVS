// Supabase client factories.
//
// Three distinct clients, because they carry different authority:
//   browserClient() — anon key, runs in the user's browser, RLS applies.
//   serverClient()  — anon key + the user's session cookies, RLS applies as that
//                     user. Use for every authenticated read in a server component.
//   adminClient()   — SERVICE ROLE key. Bypasses RLS. Server-only, never imported
//                     into a client component, and only used where the code has
//                     already established what the caller may do (e.g. the public
//                     booking route calling create_booking_request).
//
// Env is read lazily so `next build` succeeds without secrets present.

import { createBrowserClient, createServerClient } from '@supabase/ssr';
import { createClient } from '@supabase/supabase-js';
import type { CookieOptions } from '@supabase/ssr';

function required(name: string): string {
  const v = process.env[name];
  if (!v) throw new Error(`Missing environment variable ${name}`);
  return v;
}

export function browserClient() {
  return createBrowserClient(
    required('NEXT_PUBLIC_SUPABASE_URL'),
    required('NEXT_PUBLIC_SUPABASE_ANON_KEY'),
  );
}

type CookieStore = {
  getAll(): Array<{ name: string; value: string }>;
  set(name: string, value: string, options?: CookieOptions): void;
};

/**
 * Session-aware server client. Pass Next's cookie store:
 *   import { cookies } from 'next/headers';
 *   const supabase = serverClient(await cookies());
 */
export function serverClient(cookieStore: CookieStore) {
  return createServerClient(
    required('NEXT_PUBLIC_SUPABASE_URL'),
    required('NEXT_PUBLIC_SUPABASE_ANON_KEY'),
    {
      cookies: {
        getAll: () => cookieStore.getAll(),
        // Annotated explicitly: createServerClient accepts a union of the
        // current and deprecated cookie shapes, which blocks contextual typing
        // of these callbacks.
        setAll: (cookiesToSet: Array<{ name: string; value: string; options: CookieOptions }>) => {
          // Cookies are read-only inside a Server Component; Next throws on
          // write. Session refresh happens in middleware / route handlers, so
          // swallowing here is correct rather than masking a bug.
          try {
            for (const { name, value, options } of cookiesToSet) {
              cookieStore.set(name, value, options);
            }
          } catch {
            /* read-only context */
          }
        },
      },
    },
  );
}

/**
 * Service-role client. Bypasses RLS — never expose to the browser and never use
 * it to serve data the caller has not been authorised for.
 */
export function adminClient() {
  return createClient(
    required('NEXT_PUBLIC_SUPABASE_URL'),
    required('SUPABASE_SERVICE_ROLE_KEY'),
    { auth: { persistSession: false, autoRefreshToken: false } },
  );
}
