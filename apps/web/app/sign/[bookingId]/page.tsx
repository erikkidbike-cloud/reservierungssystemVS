// Public signing page (backlog 3.3) — no account. The link is the booking's
// own UUID (mailed only to the customer at agreement_sent, see
// admin/bookings/actions.ts's markAgreementSent/agreementSentToCustomer); a v4
// UUID is not guessable, the same trust model the two JotForm links it
// replaces relied on.
//
// Reads through adminClient() (service role) rather than the session-scoped
// client, deliberately: a visitor here has no Supabase session at all — they
// followed an emailed link, nothing more — so this route IS the access check,
// gated entirely on booking status, not on RLS. Two states end the flow before
// any signature UI: not found (wrong/stale link) and already signed
// (idempotent — the emailed link may be opened twice).

import { adminClient } from '@/lib/supabase';
import { buildNutzungsvereinbarungHtml } from '@vs/documents';
import { bookingToNvData } from '@/lib/nv-data';
import { siteOriginFromHeaders, absoluteUrl } from '@/lib/site-url';
import SigningForm from './SigningForm';
import { PublicShell } from '../../PublicShell';

export const dynamic = 'force-dynamic';

export default async function SignPage({
  params,
}: {
  params: Promise<{ bookingId: string }>;
}) {
  const { bookingId } = await params;
  const admin = adminClient();

  const { data: booking, error } = await admin
    .from('bookings')
    .select(
      'id, location_id, status, starts_at, ends_at, persons, event_type, price_total, caution, ' +
        'verwendungszweck, needs_id_upload, lang, locations(code, name, address, phone), ' +
        'customers(salutation, first_name, last_name, organization, address_full, email, phone)',
    )
    .eq('id', bookingId)
    .maybeSingle();

  if (error || !booking) {
    return (
      <PublicShell width={640}>
        <h1>Nicht gefunden</h1>
        <p className="muted">
          Dieser Link ist ungültig oder abgelaufen. Bitte wenden Sie sich an{' '}
          <a href="mailto:events@kidbike.de">events@kidbike.de</a>.
        </p>
      </PublicShell>
    );
  }

  /* eslint-disable @typescript-eslint/no-explicit-any */
  const b = booking as any;
  const loc = b.locations;
  const lang: 'de' | 'en' = b.lang === 'en' ? 'en' : 'de';

  const { data: doc } = await admin
    .from('documents')
    .select('*')
    .eq('booking_id', bookingId)
    .eq('type', 'nutzungsvereinbarung')
    .maybeSingle();

  if (b.status === 'signed' || b.status === 'paid' || b.status === 'confirmed' || b.status === 'completed') {
    return (
      <PublicShell width={640} lang={lang}>
        <h1>{lang === 'en' ? 'Already signed' : 'Bereits unterschrieben'}</h1>
        <p>
          {lang === 'en'
            ? 'Thank you — this agreement has already been signed.'
            : 'Vielen Dank — diese Nutzungsvereinbarung wurde bereits unterschrieben.'}
        </p>
        {doc?.signed_at && (
          <p className="muted small">
            {lang === 'en' ? 'Signed on' : 'Unterschrieben am'}{' '}
            {new Intl.DateTimeFormat(lang === 'en' ? 'en-GB' : 'de-DE', {
              dateStyle: 'medium',
              timeStyle: 'short',
              timeZone: 'Europe/Berlin',
            }).format(new Date(doc.signed_at))}
            {doc.signer_name ? ` · ${doc.signer_name}` : ''}
          </p>
        )}
      </PublicShell>
    );
  }

  if (b.status !== 'agreement_sent') {
    return (
      <PublicShell width={640} lang={lang}>
        <h1>{lang === 'en' ? 'Not ready for signing' : 'Noch nicht bereit zur Unterschrift'}</h1>
        <p className="muted">
          {lang === 'en'
            ? 'This booking is not currently awaiting a signature.'
            : 'Diese Buchung wartet aktuell nicht auf eine Unterschrift.'}
        </p>
      </PublicShell>
    );
  }

  const { data: clauseRows, error: clauseError } = await admin
    .from('agreement_clauses')
    .select('*')
    .eq('location_id', b.location_id)
    .order('sort_order');

  if (clauseError || !clauseRows || clauseRows.length === 0) {
    return (
      <PublicShell width={640} lang={lang}>
        <h1>{lang === 'en' ? 'Agreement unavailable' : 'Vertrag nicht verfügbar'}</h1>
        <p className="muted">
          {lang === 'en'
            ? 'Please contact us so we can send the agreement another way.'
            : 'Bitte kontaktieren Sie uns, damit wir Ihnen die Vereinbarung anders zukommen lassen können.'}{' '}
          <a href="mailto:events@kidbike.de">events@kidbike.de</a>
        </p>
      </PublicShell>
    );
  }

  const origin = await siteOriginFromHeaders();
  const signingLink = absoluteUrl(origin, `/sign/${bookingId}`);

  const nvData = bookingToNvData(b, loc, b.customers, signingLink);
  const clauses = clauseRows.map((c) => ({
    id: c.clause_key,
    titleDe: c.title_de,
    titleEn: c.title_en,
    bodyDe: c.body_de,
    bodyEn: c.body_en,
  }));
  const html = buildNutzungsvereinbarungHtml(nvData, { clauses, lang });

  return (
    <PublicShell width={900} lang={lang}>
      <h1>{lang === 'en' ? 'Usage agreement' : 'Nutzungsvereinbarung'}</h1>
      <p className="muted">
        {lang === 'en'
          ? 'Please read the agreement below, then sign at the bottom of this page.'
          : 'Bitte lesen Sie die Vereinbarung unten und unterschreiben Sie anschließend am Ende dieser Seite.'}
      </p>
      <iframe
        srcDoc={html}
        title={lang === 'en' ? 'Usage agreement' : 'Nutzungsvereinbarung'}
        style={{ width: '100%', height: '70vh', border: '1px solid var(--line)', borderRadius: 'var(--radius)' }}
      />
      <SigningForm bookingId={bookingId} lang={lang} needsIdUpload={b.needs_id_upload} customerName={
        [b.customers?.first_name, b.customers?.last_name].filter(Boolean).join(' ')
      } />
    </PublicShell>
  );
}
