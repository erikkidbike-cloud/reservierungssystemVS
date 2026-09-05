// Session + permission helpers for server components.
//
// The profile is created automatically on first Entra ID login by the
// handle_new_user() trigger (default role: staff).
//
// Since 0016 a role is a row in `roles`, not one of five enum values, and what
// a role may do is a set of rows in `role_permissions` that an administrator
// edits at /admin/roles. So nothing in this file may ask "is this person an
// admin?" — it asks "does this person hold this permission?", exactly like the
// RLS policies do. A helper that hard-codes a role name would silently ignore
// every role the owner invents afterwards, which is the whole point of the
// feature.
//
// These helpers hide navigation and refuse actions early with a readable
// message. They are NOT the security boundary — RLS is. Both consult the same
// role_permissions rows, so they cannot drift apart.

import { cookies } from 'next/headers';
import { serverClient } from './supabase';
import type { Profile } from './db-types';

/**
 * Every permission the application checks for. Mirrors the `permissions` table
 * seeded in 0016; the union type is what turns a typo into a build error
 * rather than a silently-false check.
 */
export type Permission =
  | 'system.admin'
  | 'roles.manage'
  | 'users.manage'
  | 'locations.manage'
  | 'bookings.read'
  | 'bookings.write'
  | 'bookings.approve'
  | 'contact_data.read'
  | 'waitlist.manage'
  | 'customers.read'
  | 'customers.write'
  | 'experiences.read'
  | 'experiences.write'
  | 'documents.access'
  | 'agreements.manage'
  | 'mail_templates.manage'
  | 'payments.manage'
  | 'tariffs.manage'
  | 'events.manage'
  | 'categories.manage'
  | 'tasks.manage'
  | 'tasks.own'
  | 'tasks.caretaker';

/** What the signed-in user may do, resolved once per request. */
export interface Auth {
  role: string;
  roleLabel: string;
  /** From `roles.all_locations` — the role sees every location. */
  allLocations: boolean;
  permissions: ReadonlySet<string>;
}

export interface SessionUser {
  id: string;
  email: string | null;
  profile: Profile | null;
  /** null when the account has no profile yet (never signed off by an admin). */
  auth: Auth | null;
  /**
   * True when the `roles` tables could not be read at all — almost always
   * because this build is deployed but migration 0016 has not been applied to
   * this database yet. The console shows a banner saying so; see the note on
   * LEGACY_ROLE_PERMISSIONS below for why the session still works.
   */
  schemaOutdated?: boolean;
}

/**
 * What the five built-in roles could do BEFORE roles became rows (0016).
 *
 * This exists for one situation only: the code is deployed but the migration
 * has not run yet. A deploy and a migration are never atomic, and the first
 * version of this file treated "the roles table does not exist" exactly like
 * "this role holds no permissions" — which locked the administrator out of the
 * console with a message claiming it was a deliberate restriction. That is the
 * worst possible failure mode: it looks like a decision, so nobody thinks to
 * check the schema.
 *
 * The mapping is a copy of what 0016 seeds, and it is only ever consulted when
 * the tables are missing — in which case the database is still running the old
 * enum-based RLS policies, which enforce exactly these same rules. So the two
 * layers stay consistent; this is not a bypass. Once 0016 is applied, this
 * table is dead code and can be deleted.
 */
const LEGACY_ROLE_PERMISSIONS: Record<string, Permission[]> = {
  admin: ['system.admin'],
  location_manager: [
    'bookings.read', 'bookings.write', 'bookings.approve', 'contact_data.read',
    'waitlist.manage', 'customers.read', 'customers.write', 'experiences.read',
    'experiences.write', 'documents.access', 'agreements.manage', 'events.manage',
    'tasks.manage', 'tasks.own',
  ],
  finance: [
    'bookings.read', 'contact_data.read', 'customers.read', 'experiences.read',
    'payments.manage', 'waitlist.manage',
  ],
  staff: ['bookings.read', 'tasks.own'],
  hausmeister: ['bookings.read', 'tasks.own', 'tasks.caretaker'],
};

const LEGACY_ROLE_LABEL: Record<string, string> = {
  admin: 'Administrator',
  location_manager: 'Standortleitung',
  finance: 'Finanzen',
  staff: 'Mitarbeiter*in',
  hausmeister: 'Hausmeister',
};

/** Roles that saw every location under the old has_location() definition. */
const LEGACY_ALL_LOCATIONS = new Set(['admin', 'finance']);

/**
 * Does this error mean "the table isn't there", as opposed to "you may not
 * read it"? PostgREST reports a missing relation as 42P01 from Postgres, or as
 * PGRST205 when its own schema cache has no such table. A permission or RLS
 * problem reports something else entirely, and must NOT fall back — being
 * refused is an answer, and answering it with a default permission set would
 * turn a locked door into an open one.
 */
function isMissingRelation(error: { code?: string; message?: string } | null): boolean {
  if (!error) return false;
  if (error.code === '42P01' || error.code === 'PGRST205') return true;
  const m = error.message ?? '';
  return /does not exist|schema cache/i.test(m) && /roles|role_permissions/i.test(m);
}

/** The signed-in user, their profile and their resolved permissions. */
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

  const typedProfile = (profile as Profile) ?? null;
  let auth: Auth | null = null;
  let schemaOutdated = false;

  if (typedProfile && typedProfile.is_active !== false) {
    const [roleResult, grantResult] = await Promise.all([
      supabase
        .from('roles')
        .select('key, label_de, all_locations')
        .eq('key', typedProfile.role)
        .maybeSingle(),
      supabase.from('role_permissions').select('permission_key').eq('role_key', typedProfile.role),
    ]);

    if (isMissingRelation(roleResult.error) || isMissingRelation(grantResult.error)) {
      // Deployed ahead of the migration. Fall back to the pre-0016 rules,
      // which is what this database is still enforcing anyway, and flag it so
      // the console can say what is actually wrong.
      schemaOutdated = true;
      const legacy = LEGACY_ROLE_PERMISSIONS[typedProfile.role] ?? [];
      auth = {
        role: typedProfile.role,
        roleLabel: LEGACY_ROLE_LABEL[typedProfile.role] ?? typedProfile.role,
        allLocations: LEGACY_ALL_LOCATIONS.has(typedProfile.role),
        permissions: new Set<string>(legacy),
      };
    } else {
      if (roleResult.error) console.error('[auth] role lookup failed:', roleResult.error.message);
      if (grantResult.error) console.error('[auth] permission lookup failed:', grantResult.error.message);

      const r = roleResult.data as { key: string; label_de: string; all_locations: boolean } | null;
      auth = {
        role: typedProfile.role,
        // A role row that has gone missing would be a broken FK; fall back to
        // the raw key rather than rendering "undefined" in the header.
        roleLabel: r?.label_de ?? typedProfile.role,
        allLocations: r?.all_locations ?? false,
        permissions: new Set(
          (grantResult.data ?? []).map((g) => (g as { permission_key: string }).permission_key),
        ),
      };
    }
  }

  return {
    id: user.id,
    email: user.email ?? null,
    profile: typedProfile,
    auth,
    schemaOutdated,
  };
}

/**
 * The one primitive. `system.admin` implies every other permission — the same
 * rule role_has_permission() applies in SQL, so an administrator never has to
 * be re-ticked when a later migration adds a permission.
 */
export function can(auth: Auth | null | undefined, permission: Permission): boolean {
  if (!auth) return false;
  return auth.permissions.has('system.admin') || auth.permissions.has(permission);
}

// Named helpers, kept because they say WHY a screen is gated rather than which
// string it checks — and because the call sites read better.

export function canSeeContactData(auth: Auth | null | undefined): boolean {
  return can(auth, 'contact_data.read');
}

export function canApprove(auth: Auth | null | undefined): boolean {
  return can(auth, 'bookings.approve');
}

export function canWriteBookings(auth: Auth | null | undefined): boolean {
  return can(auth, 'bookings.write');
}

export function canWriteCustomers(auth: Auth | null | undefined): boolean {
  return can(auth, 'customers.write');
}

/** The internal notes about past customers — GDPR-sensitive, own permission. */
export function canWriteExperiences(auth: Auth | null | undefined): boolean {
  return can(auth, 'experiences.write');
}

export function canManageTariffs(auth: Auth | null | undefined): boolean {
  return can(auth, 'tariffs.manage');
}

export function canManageUsers(auth: Auth | null | undefined): boolean {
  return can(auth, 'users.manage');
}

/** Roles themselves — the owner asked for this to be administrators only. */
export function canManageRoles(auth: Auth | null | undefined): boolean {
  return can(auth, 'roles.manage');
}

/** Tasks: the manager view, or one's own caretaker jobs. */
export function canSeeTasks(auth: Auth | null | undefined): boolean {
  return can(auth, 'tasks.manage') || can(auth, 'tasks.own');
}

export function canManageTasks(auth: Auth | null | undefined): boolean {
  return can(auth, 'tasks.manage');
}

export function canManagePayments(auth: Auth | null | undefined): boolean {
  return can(auth, 'payments.manage');
}

export function canManageEvents(auth: Auth | null | undefined): boolean {
  return can(auth, 'events.manage');
}

export function canManageCategories(auth: Auth | null | undefined): boolean {
  return can(auth, 'categories.manage');
}

export function canManageMailTemplates(auth: Auth | null | undefined): boolean {
  return can(auth, 'mail_templates.manage');
}

export function canManageWaitlist(auth: Auth | null | undefined): boolean {
  return can(auth, 'waitlist.manage');
}

export function canManageAgreements(auth: Auth | null | undefined): boolean {
  return can(auth, 'agreements.manage');
}

export function canAccessDocuments(auth: Auth | null | undefined): boolean {
  return can(auth, 'documents.access');
}

/**
 * The location ids this user may act on, or `null` for "all of them".
 *
 * Needed wherever a write bypasses RLS. Creating a booking does: it goes
 * through create_booking_request(), which only service_role may execute, so the
 * `bookings_write` policy never gets a chance to run and this check takes its
 * place. It mirrors has_location() in 0016 — the role's `all_locations` flag,
 * else the user's memberships — so the two cannot disagree about who may touch
 * what.
 */
export async function actionableLocationIds(session?: SessionUser | null): Promise<string[] | null> {
  // Every caller has already resolved the session for its own permission
  // check; passing it in avoids a second round of profile + role + permission
  // queries on the same request.
  const me = session !== undefined ? session : await getSessionUser();
  if (!me?.auth) return [];
  if (me.auth.allLocations) return null;

  const supabase = serverClient(await cookies());
  const { data } = await supabase
    .from('user_locations')
    .select('location_id')
    .eq('user_id', me.id);

  return (data ?? []).map((r) => (r as { location_id: string }).location_id);
}

/** Whether this user may create or change bookings at a given location. */
export function mayActOnLocation(allowed: string[] | null, locationId: string): boolean {
  return allowed === null || allowed.includes(locationId);
}

/**
 * Which relation to read bookings from.
 *
 * Without contact_data.read there is no SELECT policy on `bookings` at all —
 * such a role reads the column-restricted view instead, so the personal and
 * financial columns never reach the client. See docs/03-roles-and-rls.md.
 */
export function bookingsRelationFor(auth: Auth | null | undefined): 'bookings' | 'bookings_staff' {
  return canSeeContactData(auth) ? 'bookings' : 'bookings_staff';
}
