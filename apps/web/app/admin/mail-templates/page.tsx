// Editable wording for every automated email (backlog: "templates should be
// editable in the UI"). A booking transition (app/admin/bookings/actions.ts,
// app/api/booking-request/route.ts) renders one of these with the booking's
// data — see lib/mail-vars.ts for the full {{placeholder}} list. Editing a
// template here changes the DEFAULT for every future send; an individual
// email can still be hand-edited once more right before it goes out, at
// /admin/bookings/[id]/send/[action].

import { cookies } from 'next/headers';
import { serverClient } from '@/lib/supabase';
import { getSessionUser, canManageMailTemplates } from '@/lib/auth';
import type { MailTemplateRow } from '@/lib/mail-vars';
import { saveMailTemplate } from './actions';

export const dynamic = 'force-dynamic';

const KEY_LABEL: Record<string, string> = {
  request_received: 'Anfrage eingegangen (an Kund*in)',
  approved: 'Anfrage bestätigt (an Kund*in)',
  rejected: 'Anfrage abgelehnt (an Kund*in)',
  cancelled: 'Buchung storniert (an Kund*in)',
  confirmed: 'Buchung endgültig bestätigt (an Kund*in)',
  agreement_sent: 'Nutzungsvereinbarung zum Unterschreiben (an Kund*in)',
  new_request_to_location: 'Neue Anfrage (an das Standort-Team)',
};

const PLACEHOLDERS = [
  'customerName', 'customerEmail', 'customerPhone',
  'locationName', 'locationCode',
  'startsAt', 'endsAt', 'persons', 'eventType',
  'priceTotal', 'caution',
  'holdExpiresAt', 'holdLine', 'adminUrl', 'message',
  'bookingFacts', 'reasonLine', 'signingLink',
];

export default async function MailTemplatesPage() {
  const me = await getSessionUser();
  const auth = me?.auth;

  if (!canManageMailTemplates(auth)) {
    return (
      <>
        <h1>E-Mail-Vorlagen</h1>
        <div className="notice">E-Mail-Vorlagen bearbeiten können Administratorinnen.</div>
      </>
    );
  }

  const supabase = serverClient(await cookies());
  const { data, error } = await supabase.from('mail_templates').select('*').order('key');

  if (error) {
    return (
      <>
        <h1>E-Mail-Vorlagen</h1>
        <div className="notice">Konnte Vorlagen nicht laden: {error.message}</div>
      </>
    );
  }

  const templates = (data ?? []) as MailTemplateRow[];

  return (
    <>
      <h1>E-Mail-Vorlagen</h1>
      <p className="muted small">
        Verfügbare Platzhalter (leer, wenn nicht zutreffend):{' '}
        {PLACEHOLDERS.map((p) => (
          <code key={p} style={{ marginRight: 6 }}>
            {`{{${p}}}`}
          </code>
        ))}
      </p>

      {templates.map((t) => (
        <form action={saveMailTemplate} key={t.key} className="panel">
          <input type="hidden" name="key" value={t.key} />
          <h2 style={{ marginTop: 0 }}>{KEY_LABEL[t.key] ?? t.key}</h2>
          <div className="grid-2">
            <label>
              Betreff (DE)
              <input type="text" name="subject_de" defaultValue={t.subject_de} required />
            </label>
            <label>
              Betreff (EN)
              <input type="text" name="subject_en" defaultValue={t.subject_en} required />
            </label>
          </div>
          <div className="grid-2">
            <label>
              Text (DE)
              <textarea name="body_de" rows={12} defaultValue={t.body_de} required />
            </label>
            <label>
              Text (EN)
              <textarea name="body_en" rows={12} defaultValue={t.body_en} required />
            </label>
          </div>
          <button type="submit">Speichern</button>
        </form>
      ))}
    </>
  );
}
