// Renders a location's Nutzungsvereinbarung as a standalone HTML page, using
// the LIVE clause text from agreement_clauses plus example booking data.
//
// A Route Handler returning text/html rather than a React page, deliberately:
// buildNutzungsvereinbarungHtml() already produces a complete document with its
// own print stylesheet (@page A4, margins, page-break rules), so serving it
// as-is means the browser's own "Print → Save as PDF" produces a genuinely
// print-correct PDF. That covers the "let me look at / hand out the contract"
// need with no headless browser anywhere.
//
// Only automated PDF *email attachments* need Chromium (packages/documents'
// renderAgreements), which is a poor fit for a serverless function and is a
// separate, later decision — see docs/08-improvement-plan.md.

import { cookies } from 'next/headers';
import { serverClient } from '@/lib/supabase';
import { loadClauses, toNvClauses } from '@/lib/agreements';
import { buildNutzungsvereinbarungHtml, type Lang, type NvData } from '@vs/documents';
import type { Location } from '@/lib/db-types';

export const dynamic = 'force-dynamic';

/**
 * Stand-in booking, clearly fake, so the preview shows how a real agreement
 * reads with every merge field filled. Marked as an example in the banner the
 * route injects below, so a printed preview can't be mistaken for a real
 * contract.
 */
function sampleBooking(loc: Location, lang: Lang): NvData {
  const start = new Date();
  start.setDate(start.getDate() + 30);
  start.setHours(10, 0, 0, 0);
  const end = new Date(start);
  end.setHours(14, 0, 0, 0);
  const payBy = new Date(start);
  payBy.setDate(payBy.getDate() - 14);

  return {
    locationCode: loc.code,
    locationName: loc.name,
    locationAddress: loc.address ?? '',
    locationPhone: loc.phone,
    customer: {
      salutation: 'Frau',
      firstName: 'Erika',
      lastName: 'Mustermann',
      organization: 'Beispiel-Kita Sonnenschein',
      addressFull: 'Musterweg 5, 10249 Berlin',
      email: 'erika.mustermann@example.com',
      phone: '030 1234567',
    },
    startsAt: start,
    endsAt: end,
    persons: 25,
    eventType: 'Kindergeburtstag',
    extras: 'Grill',
    priceTotal: 135,
    caution: loc.code === 'WA' ? 50 : 200,
    paymentReference: `F${loc.code}000MUER`,
    payBy,
    needsIdUpload: false,
    bookingOrder: 'erste',
    signingLink: 'https://example.org/signieren/beispiel',
    lang,
  };
}

const BANNER: Record<Lang, string> = {
  de: 'VORSCHAU mit Beispieldaten — kein echter Vertrag. Der Klauseltext ist der aktuell gespeicherte.',
  en: 'PREVIEW with example data — not a real contract. The clause text is the one currently stored.',
};

export async function GET(
  request: Request,
  { params }: { params: Promise<{ code: string }> },
): Promise<Response> {
  const { code } = await params;
  const locationCode = code.toUpperCase();
  const lang: Lang = new URL(request.url).searchParams.get('lang') === 'en' ? 'en' : 'de';

  const supabase = serverClient(await cookies());
  const { data: location, error } = await supabase
    .from('locations')
    .select('*')
    .eq('code', locationCode)
    .maybeSingle();

  if (error || !location) {
    return new Response(`Standort ${locationCode} nicht gefunden.`, {
      status: 404,
      headers: { 'content-type': 'text/plain; charset=utf-8' },
    });
  }

  const loc = location as Location;
  const rows = await loadClauses(supabase, loc.id);

  if (rows.length === 0) {
    return new Response(
      `<!doctype html><meta charset="utf-8"><body style="font:15px system-ui;padding:2rem">
       <p>Für <strong>${loc.name}</strong> ist noch kein Vertragstext hinterlegt,
       daher gibt es nichts anzuzeigen.</p>
       <p><a href="/admin/agreements/${loc.code}">Vertrag anlegen →</a></p></body>`,
      { status: 200, headers: { 'content-type': 'text/html; charset=utf-8' } },
    );
  }

  const html = buildNutzungsvereinbarungHtml(sampleBooking(loc, lang), {
    clauses: toNvClauses(rows),
    lang,
  });

  // Inject a preview banner that is hidden when printed, so the printed output
  // is the real document layout while the on-screen version stays unmistakably
  // a preview.
  const banner = `<style>
      .preview-banner{position:sticky;top:0;background:#fdf5e9;border-bottom:2px solid #b45309;
        color:#7c2d12;font:600 13px/1.4 system-ui;padding:10px 14px;margin:-20mm -18mm 8mm;}
      .preview-banner a{color:#7c2d12}
      @media print{.preview-banner{display:none}}
    </style>
    <div class="preview-banner">${BANNER[lang]} ·
      <a href="?lang=${lang === 'de' ? 'en' : 'de'}">${lang === 'de' ? 'English' : 'Deutsch'}</a> ·
      <a href="/admin/agreements/${loc.code}">Zurück zum Bearbeiten</a>
    </div>`;

  return new Response(html.replace('<body>', `<body>${banner}`), {
    status: 200,
    headers: { 'content-type': 'text/html; charset=utf-8' },
  });
}
