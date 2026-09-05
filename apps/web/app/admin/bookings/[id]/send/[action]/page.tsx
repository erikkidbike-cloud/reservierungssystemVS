// Compose-before-send: the edit-an-individual-email step. Shows the template
// (mail_templates, editable at /admin/mail-templates) already rendered with
// this booking's data, as an editable subject + body, before the transition
// actually happens — so a one-off tweak ("actually, mention the rain date")
// doesn't require editing the template for everyone.

import Link from 'next/link';
import { notFound } from 'next/navigation';
import { cookies } from 'next/headers';
import { serverClient } from '@/lib/supabase';
import { getSessionUser, canApprove } from '@/lib/auth';
import { canTransition, type BookingAction } from '@vs/domain';
import { loadBookingForTransition, toMailContext } from '@/lib/booking-transition';
import { loadMailTemplate, MAIL_KEY_FOR_ACTION } from '@/lib/mail-send';
import { buildMailVars, renderMailTemplate, reasonLine } from '@/lib/mail-vars';
import { siteOriginFromHeaders, absoluteUrl } from '@/lib/site-url';
import { ACTION_LABEL, ACTIONS_WITH_REASON, fmtDateTime } from '@/lib/booking-labels';
import { sendComposedMail } from './actions';

export const dynamic = 'force-dynamic';

export default async function ComposeMailPage({
  params,
}: {
  params: Promise<{ id: string; action: string }>;
}) {
  const { id, action: actionParam } = await params;
  const action = actionParam as BookingAction;

  const me = await getSessionUser();
  if (!canApprove(me?.auth)) {
    return (
      <>
        <h1>E-Mail verfassen</h1>
        <div className="notice">Dafür fehlt die Berechtigung.</div>
      </>
    );
  }

  const templateKey = MAIL_KEY_FOR_ACTION[action];
  if (!templateKey) notFound();

  const supabase = serverClient(await cookies());
  const b = await loadBookingForTransition(supabase, id);

  if (!canTransition(b.status, action)) {
    return (
      <>
        <h1>E-Mail verfassen</h1>
        <div className="notice">
          „{ACTION_LABEL[action]}" ist aus dem aktuellen Status nicht mehr möglich — die Buchung
          wurde vermutlich inzwischen geändert.
        </div>
        <p>
          <Link href={`/admin/bookings/${id}`}>← Zurück zur Buchung</Link>
        </p>
      </>
    );
  }

  const ctx = toMailContext(b);
  if (!ctx) {
    return (
      <>
        <h1>E-Mail verfassen</h1>
        <div className="notice">
          Für diese Buchung ist keine E-Mail-Adresse hinterlegt — „{ACTION_LABEL[action]}" kann nur
          ohne Benachrichtigung ausgeführt werden.
        </div>
        <p>
          <Link href={`/admin/bookings/${id}`}>← Zurück zur Buchung (dort direkt ausführen)</Link>
        </p>
      </>
    );
  }

  const tpl = await loadMailTemplate(supabase, templateKey);
  if (!tpl) {
    return (
      <>
        <h1>E-Mail verfassen</h1>
        <div className="notice">
          Die Vorlage „{templateKey}" fehlt in der Datenbank (supabase/seed/mail_templates.sql wurde
          vermutlich noch nicht ausgeführt).
        </div>
      </>
    );
  }

  let signingLink = '';
  if (action === 'send_agreement') {
    signingLink = absoluteUrl(await siteOriginFromHeaders(), `/sign/${id}`);
  }

  const lang = ctx.lang === 'en' ? 'en' : 'de';
  const vars = buildMailVars(ctx, lang, { reasonLine: reasonLine(null, lang), signingLink });
  const { subject, body } = renderMailTemplate(tpl, lang, vars);

  return (
    <>
      <p className="small">
        <Link href={`/admin/bookings/${id}`}>← Zurück zur Buchung</Link>
      </p>
      <h1>{ACTION_LABEL[action]}: E-Mail an {ctx.customerName}</h1>
      <p className="muted small">
        {ctx.customerEmail} · {b.locations?.name} · {fmtDateTime(b.starts_at)}
      </p>
      <p className="muted small">
        Vorbelegt aus der Vorlage „{templateKey}" (<Link href="/admin/mail-templates">bearbeiten</Link>
        ). Änderungen hier gelten nur für diese eine E-Mail.
      </p>

      <form action={sendComposedMail} className="panel">
        <input type="hidden" name="bookingId" value={id} />
        <input type="hidden" name="action" value={action} />

        {ACTIONS_WITH_REASON.includes(action) && (
          <label>
            Grund (optional, wird in die E-Mail übernommen wenn Sie ihn unten ergänzen)
            <input type="text" name="reason" placeholder="Nur intern — für den Verlauf" />
          </label>
        )}

        <label>
          Betreff
          <input type="text" name="subject" defaultValue={subject} required />
        </label>
        <label>
          Text
          <textarea name="body" rows={16} defaultValue={body} required />
        </label>

        <button type="submit">Senden &amp; Status ändern</button>
      </form>
    </>
  );
}
