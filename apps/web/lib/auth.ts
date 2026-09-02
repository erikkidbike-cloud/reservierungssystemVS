// Session + role helpers for server components.
//
// The role is read from `profiles`, which is created automatically on first
// Entra ID login by the handle_new_user() trigger (default role: staff).

import { cookies } from 'next/headers';
import { serverClient } from './supabase';
import type { AppRole, Profile } from './db-types';

export interface SessionUser {
  id: string;
  email: string | null;
  profile: Profile | null;
}

/** The signed-in user and their profile, or null when not signed in. */
export async function getSessionUser(): Promise<SessionUser | null> {
  const supabase = serverClient(await cookies());
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return null;

  const { data: profile } = await supabase
    .from('profiles')
    .select('*')
    .eq('id', user.id)
    .maybeSingle();

  return { id: user.id, email: user.email ?? null, profile: (profile as Profile) ?? null };
}

/** Roles allowed to open the internal console at all. */
export const CONSOLE_ROLES: AppRole[] = [
  'admin',
  'location_manager',
  'staff',
  'finance',
  'hausmeister',
];

export function canSeeContactData(role: AppRole | undefined): boolean {
  return role === 'admin' || role === 'location_manager' || role === 'finance';
}

export function canApprove(role: AppRole | undefined): boolean {
  return role === 'admin' || role === 'location_manager';
}

export function canManageTariffs(role: AppRole | undefined): boolean {
  return role === 'admin';
}

/**
 * Which relation to read bookings from for this role.
 *
 * Staff and caretakers have no SELECT policy on `bookings` at all — they read
 * the column-restricted view instead, so the personal and financial columns
 * never reach the client. See docs/03-roles-and-rls.md.
 */
export function bookingsRelationFor(role: AppRole | undefined): 'bookings' | 'bookings_staff' {
  return canSeeContactData(role) ? 'bookings' : 'bookings_staff';
}
