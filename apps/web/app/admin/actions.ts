'use server';

import { cookies } from 'next/headers';
import { redirect } from 'next/navigation';
import { serverClient } from '@/lib/supabase';

export async function signOut(): Promise<void> {
  const supabase = serverClient(await cookies());
  await supabase.auth.signOut();
  redirect('/login');
}
