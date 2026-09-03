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

/** Assigning roles and locations is admin-only — it is how access itself is granted. */
export function canManageUsers(role: AppRole | undefined): boolean {
  return role === 'admin';
}

/** All assignable roles, for the user-admin dropdown. */
export const ALL_ROLES: AppRole[] = [
  'admin',
  'location_manager',
  'staff',
  'finance',
  'hausmeister',
];

/** German labels for the roles, used wherever a role is shown to staff. */
export const ROLE_LABEL: Record<AppRole, string> = {
  admin: 'Administrator',
  location_manager: 'Standortleitung',
  staff: 'Mitarbeiter*in',
  finance: 'Finanzen',
  hausmeister: 'Hausmeister',
};

/**
 * Editing the Nutzungsvereinbarung text is scoped like bookings (admin
 * everywhere, location_manager for their own location) rather than restricted
 * to admin like tariffs — contract wording is operational, not financial, and
 * the RLS policy on agreement_clauses matches this exactly. See
 * docs/03-roles-and-rls.md.
 */
export function canManageAgreements(role: AppRole | undefined): boolean {
  return role === 'admin' || role === 'location_manager';
}

/**
 * The location ids this user may act on, or `null` for "all of them".
 *
 * Needed wherever a write bypasses RLS. Creating a booking does: it goes
 * through create_booking_request(), which only service_role may execute, so the
 * `bookings_manager_write` policy never gets a chance to run and this check
 * takes its place. It deliberately mirrors has_location() in 0005_rls.sql —
 * admin and finance see everything, everyone else only their memberships — so
 * the two cannot disagree about who may touch what.
 */
export async function actionableLocationIds(): Promise<string[] | null> {
  const supabase = serverClient(await cookies());
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return [];

  const { data: profile } = await supabase
    .from('profiles')
    .select('role')
    .eq('id', user.id)
    .maybeSingle();

  const role = (profile as Pick<Profile, 'role'> | null)?.role;
  if (role === 'admin' || role === 'finance') return null;

  const { data } = await supabase
    .from('user_locations')
    .select('location_id')
    .eq('user_id', user.id);

  return (data ?? []).map((r) => (r as { location_id: string }).location_id);
}

/** Whether this user may create or change bookings at a given location. */
export function mayActOnLocation(allowed: string[] | null, locationId: string): boolean {
  return allowed === null || allowed.includes(locationId);
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
