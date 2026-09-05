// "Which migrations is this database missing?"
//
// The console used to discover a stale schema one screen at a time: five
// unrelated-looking errors on five pages, each naming a different table, none
// of them saying that the database was simply seven migrations behind. This
// turns that into one answer.
//
// It probes for the object each migration is responsible for creating, rather
// than reading a ledger of what was run. Those differ in exactly the case that
// matters: a migration that aborts halfway leaves a ledger entry claiming
// success. That has happened in this project already (0014 aborted on a
// missing function and never created the waitlist table), so what is actually
// present is the thing worth measuring.
//
// The SQL equivalent, for the Supabase SQL editor, is
// supabase/post-deploy/check-schema.sql — keep the two lists in step.

import type { SupabaseClient } from '@supabase/supabase-js';

interface MigrationProbe {
  /** File name without the .sql, as it appears in supabase/migrations/. */
  migration: string;
  /** What the reader loses while it is missing. */
  feature: string;
  /** A table or view the migration creates, probed with a zero-row select. */
  relation?: string;
  /** A column that migration adds to an existing table. */
  column?: { relation: string; name: string };
  /** A function it creates, probed by calling it with a harmless argument. */
  rpc?: { name: string; args: Record<string, unknown> };
}

/**
 * One probe per migration that a user can actually collide with in the
 * console. Grants and constraints are left to check-schema.sql, which can ask
 * the catalogue directly; from here only what PostgREST can reach is visible.
 */
const PROBES: MigrationProbe[] = [
  {
    migration: '0012_events',
    feature: 'Termine und Kategorien',
    column: { relation: 'projects', name: 'sort_order' },
  },
  { migration: '0013_mail_templates', relation: 'mail_templates', feature: 'E-Mail-Vorlagen' },
  { migration: '0014_enhancements', relation: 'waitlist_requests', feature: 'Warteliste' },
  { migration: '0015_reminders_ical_ratelimit', relation: 'reminder_rules', feature: 'Erinnerungen, iCal-Feeds' },
  { migration: '0016_roles_permissions', relation: 'roles', feature: 'Rollen und Berechtigungen' },
  { migration: '0017_waitlist_offers', relation: 'waitlist_offers', feature: 'Warteliste benachrichtigen' },
  {
    migration: '0018_occupancy',
    feature: 'Auslastung',
    // A single month for the caller's own locations — cheap enough to run on a
    // database that is already broken, which is the only time this runs.
    rpc: { name: 'occupancy_by_month', args: { p_from: '2000-01-01', p_to: '2000-01-01' } },
  },
];

export interface SchemaGap {
  migration: string;
  feature: string;
}

/**
 * Missing relation (42P01 / PGRST205), missing column (42703) or missing
 * function (PGRST202) — as opposed to any other error, which means the thing
 * IS there and something else went wrong.
 *
 * An object that exists but refuses the read (RLS, a missing GRANT) is
 * therefore PRESENT: that is a different fault, and reporting it as a missing
 * migration would send someone to re-run SQL that is already applied.
 */
function meansAbsent(error: { code?: string; message?: string } | null): boolean {
  if (!error) return false;
  if (['42P01', '42703', 'PGRST202', 'PGRST205'].includes(error.code ?? '')) return true;
  return /does not exist|schema cache|could not find/i.test(error.message ?? '');
}

/**
 * The missing migrations, in order.
 *
 * Only ever called once something has already failed, so these probes cost
 * nothing on a healthy database.
 */
export async function findSchemaGaps(supabase: SupabaseClient): Promise<SchemaGap[]> {
  const results = await Promise.all(
    PROBES.map(async (p) => {
      let error: { code?: string; message?: string } | null = null;

      if (p.relation) {
        ({ error } = await supabase.from(p.relation).select('*', { head: true, count: 'exact' }).limit(1));
      } else if (p.column) {
        ({ error } = await supabase
          .from(p.column.relation)
          .select(p.column.name, { head: true, count: 'exact' })
          .limit(1));
      } else if (p.rpc) {
        ({ error } = await supabase.rpc(p.rpc.name, p.rpc.args));
      }

      return meansAbsent(error) ? { migration: p.migration, feature: p.feature } : null;
    }),
  );
  return results.filter((r): r is SchemaGap => r !== null);
}
