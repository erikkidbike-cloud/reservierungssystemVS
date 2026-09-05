// Reminder rules: "this long before/after this anchor, send this template to
// these bookings". The wording itself lives in mail_templates and is edited in
// the same screen as every other automated mail (/admin/mail-templates) — one
// editor, one set of {{placeholders}}, rather than a second parallel system
// for reminder text.
//
// Nothing here sends anything: /api/cron/send-reminders does, on a schedule.

import Link from 'next/link';
import { cookies } from 'next/headers';
import { serverClient } from '@/lib/supabase';
import { getSessionUser, canManageMailTemplates } from '@/lib/auth';
import type { Location, BookingStatus } from '@/lib/db-types';
import { STATUS_LABEL } from '@/lib/booking-labels';
import { saveReminderRule, deleteReminderRule } from './actions';

export const dynamic = 'force-dynamic';

interface ReminderRule {
  id: string;
  name: string;
  template_key: string;
  offset_days: number;
  offset_hours: number;
  anchor: 'event_start' | 'event_end' | 'payment_due';
  statuses: BookingStatus[];
  location_id: string | null;
  recipient: 'customer' | 'location';
  is_active: boolean;
}

const ANCHOR_LABEL: Record<ReminderRule['anchor'], string> = {
  event_start: 'Beginn der Veranstaltung',
  event_end: 'Ende der Veranstaltung',
  payment_due: 'Zahlungsfrist (14 Tage vor Beginn)',
};

/** The statuses a reminder can sensibly target — terminal ones are pointless. */
const SELECTABLE_STATUSES: BookingStatus[] = [
  'requested',
  'approved',
  'agreement_sent',
  'signed',
  'paid',
  'confirmed',
  'completed',
];

/** "3 Tage vorher", "2 Stunden danach" — the schedule in one readable phrase. */
function describeOffset(days: number, hours: number, anchor: ReminderRule['anchor']): string {
  const totalHours = days * 24 + hours;
  if (totalHours === 0) return `genau zum ${ANCHOR_LABEL[anchor]}`;
  const before = totalHours < 0;
  const abs = Math.abs(totalHours);
  const d = Math.floor(abs / 24);
  const h = abs % 24;
  const parts = [d ? `${d} Tag${d === 1 ? '' : 'e'}` : '', h ? `${h} Std.` : ''].filter(Boolean);
  return `${parts.join(' ')} ${before ? 'vor' : 'nach'} ${ANCHOR_LABEL[anchor]}`;
}

function RuleForm({
  rule,
  templateKeys,
  locations,
}: {
  rule?: ReminderRule;
  templateKeys: string[];
  locations: Location[];
}) {
  const isNew = !rule;
  return (
    <form action={saveReminderRule} className="panel">
      {rule && <input type="hidden" name="id" value={rule.id} />}
      <h3 style={{ marginTop: 0 }}>
        {isNew ? 'Neue Erinnerung' : rule.name}
        {rule && !rule.is_active && (
          <span className="badge badge--warn" style={{ marginLeft: 8 }}>
            inaktiv
          </span>
        )}
      </h3>
      {rule && (
        <p className="muted small" style={{ marginTop: -4 }}>
          {describeOffset(rule.offset_days, rule.offset_hours, rule.anchor)}
        </p>
      )}

      <div className="grid-2">
        <label>
          Name (nur intern)
          <input type="text" name="name" defaultValue={rule?.name ?? ''} required placeholder="z. B. Zahlungserinnerung" />
        </label>
        <label>
          Vorlage (<Link href="/admin/mail-templates">Text bearbeiten</Link>)
          <select name="template_key" defaultValue={rule?.template_key ?? 'reminder_before_event'}>
            {templateKeys.map((k) => (
              <option key={k} value={k}>
                {k}
              </option>
            ))}
          </select>
        </label>
        <label>
          Zeitpunkt: Tage (negativ = vorher)
          <input type="number" name="offset_days" defaultValue={rule?.offset_days ?? -3} />
        </label>
        <label>
          … plus Stunden
          <input type="number" name="offset_hours" defaultValue={rule?.offset_hours ?? 0} />
        </label>
        <label>
          Bezugspunkt
          <select name="anchor" defaultValue={rule?.anchor ?? 'event_start'}>
            {(Object.keys(ANCHOR_LABEL) as ReminderRule['anchor'][]).map((a) => (
              <option key={a} value={a}>
                {ANCHOR_LABEL[a]}
              </option>
            ))}
          </select>
        </label>
        <label>
          Empfänger
          <select name="recipient" defaultValue={rule?.recipient ?? 'customer'}>
            <option value="customer">Kund*in</option>
            <option value="location">Standort-Team (cc_emails)</option>
          </select>
        </label>
        <label>
          Standort
          <select name="location_id" defaultValue={rule?.location_id ?? ''}>
            <option value="">Alle Standorte</option>
            {locations.map((l) => (
              <option key={l.id} value={l.id}>
                {l.name}
              </option>
            ))}
          </select>
        </label>
      </div>

      <label style={{ marginBottom: 4 }}>Gilt für Buchungen mit Status</label>
      <div className="row" style={{ marginBottom: 12 }}>
        {SELECTABLE_STATUSES.map((s) => (
          <label key={s} style={{ fontWeight: 400, color: 'var(--fg)', marginBottom: 0 }}>
            <input
              type="checkbox"
              name="statuses"
              value={s}
              defaultChecked={(rule?.statuses ?? ['confirmed']).includes(s)}
              style={{ width: 'auto', display: 'inline', marginRight: 6 }}
            />
            {STATUS_LABEL[s]}
          </label>
        ))}
      </div>

      <label style={{ fontWeight: 400, color: 'var(--fg)' }}>
        <input
          type="checkbox"
          name="is_active"
          defaultChecked={rule?.is_active ?? true}
          style={{ width: 'auto', display: 'inline', marginRight: 8 }}
        />
        Aktiv
      </label>

      <div className="row" style={{ marginTop: 12 }}>
        <button type="submit">{isNew ? 'Erinnerung anlegen' : 'Speichern'}</button>
        {rule && (
          <button type="submit" formAction={deleteReminderRule} className="danger">
            Löschen
          </button>
        )}
      </div>
    </form>
  );
}

export default async function RemindersPage() {
  const me = await getSessionUser();
  if (!canManageMailTemplates(me?.auth)) {
    return (
      <>
        <h1>Erinnerungen</h1>
        <div className="notice">Erinnerungen einrichten können Administratorinnen.</div>
      </>
    );
  }

  const supabase = serverClient(await cookies());
  const [{ data: ruleRows, error }, { data: templateRows }, { data: locationRows }] = await Promise.all([
    supabase.from('reminder_rules').select('*').order('created_at'),
    supabase.from('mail_templates').select('key').order('key'),
    supabase.from('locations').select('*').eq('is_active', true).order('sort_order'),
  ]);

  if (error) {
    return (
      <>
        <h1>Erinnerungen</h1>
        <div className="notice">Konnte Regeln nicht laden: {error.message}</div>
      </>
    );
  }

  const rules = (ruleRows ?? []) as ReminderRule[];
  const templateKeys = ((templateRows ?? []) as Array<{ key: string }>).map((t) => t.key);
  const locations = (locationRows ?? []) as Location[];

  return (
    <>
      <h1>Erinnerungen</h1>
      <p className="muted">
        Automatische E-Mails im Abstand zu einem Termin — z. B. „3 Tage vorher“ oder „1 Tag nach
        der Veranstaltung“. Der Versand läuft über <code>/api/cron/send-reminders</code>; jede
        Erinnerung geht pro Buchung nur ein einziges Mal raus.
      </p>

      {rules.length === 0 && (
        <div className="notice">
          Noch keine Erinnerung eingerichtet. Unten anlegen — die Vorlagen{' '}
          <code>reminder_payment_due</code>, <code>reminder_before_event</code> und{' '}
          <code>reminder_after_event</code> stehen schon bereit.
        </div>
      )}

      {rules.map((r) => (
        <RuleForm key={r.id} rule={r} templateKeys={templateKeys} locations={locations} />
      ))}

      <RuleForm templateKeys={templateKeys} locations={locations} />
    </>
  );
}
