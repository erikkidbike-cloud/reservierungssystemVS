'use server';

// Sends a Supabase magic link. Must run as a Server Action (not during a
// Server Component's render) because it needs to WRITE a cookie — the PKCE
// code verifier signInWithOtp generates, which /auth/callback later needs to
// exchange the emailed code for a session. Server Components can only read
// cookies; Actions and Route Handlers can write them.

import { cookies, headers } from 'next/headers';
import { redirect } from 'next/navigation';
import { serverClient } from '@/lib/supabase';

export async function requestMagicLink(formData: FormData): Promise<void> {
  const email = String(formData.get('email') ?? '').trim();
  if (!email) redirect('/login?error=' + encodeURIComponent('E-Mail-Adresse fehlt'));

  // NEXT_PUBLIC_SITE_URL (see .env.example) is preferred when set — more
  // reliable than the request's Origin header behind some proxy/CDN setups.
  // Falls back to the request itself, so local dev needs no configuration.
  const origin =
    process.env.NEXT_PUBLIC_SITE_URL || (await headers()).get('origin') || 'http://localhost:3000';

  const supabase = serverClient(await cookies());
  const { error } = await supabase.auth.signInWithOtp({
    email,
    options: { emailRedirectTo: `${origin}/auth/callback` },
  });

  if (error) redirect(`/login?error=${encodeURIComponent(error.message)}`);
  redirect(`/login?sent=${encodeURIComponent(email)}`);
}
