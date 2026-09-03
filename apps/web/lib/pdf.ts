// Renders the Nutzungsvereinbarung to a PDF for the agreement_sent email —
// backlog: "the NV needs to be an attachment in the email".
//
// ⚠️ Production risk, flagged rather than hidden: this launches headless
// Chromium (playwright-core, packages/documents/src/render.ts) inside a
// Netlify serverless function via @sparticuz/chromium's bundled binary. That
// combination is known to be finicky in practice — cold starts of several
// seconds, and real reports of executable-path/version issues specifically on
// Netlify (unlike AWS Lambda directly, which it targets first). This file was
// verified locally (the HTML→PDF pipeline itself produces a correct PDF given
// a matching Chromium binary) but the exact Netlify + @sparticuz/chromium
// pairing has NOT been exercised against a real deploy — do that once, by
// triggering one real "send_agreement" in staging, before relying on it.
//
// The fallback if any of this fails — wrong Chromium version, a cold-start
// timeout, anything — is to log and send the email WITHOUT the attachment,
// never to fail the send or the transition. The signing link in the email
// body still works either way; the PDF is a courtesy on top, exactly like
// every other best-effort send in lib/mail.ts.

import type { NvData, NvClause } from '@vs/documents';
import type { MailAttachment } from './mail';

// @sparticuz/chromium-min (not the full @sparticuz/chromium) deliberately:
// the full package bundles an ~70MB Chromium, which risks blowing Netlify's
// ~50MB function bundle limit outright — a deploy-time failure, not a
// runtime one this file's try/catch could ever recover from. The -min
// package instead downloads a matching Chromium pack from a URL at cold
// start, at the cost of that download (a few seconds, cached per warm
// instance). CHROMIUM_PACK_URL lets that URL be swapped without a code
// change if the pinned release below ever moves or its filename changes —
// see .env.example.
const DEFAULT_CHROMIUM_PACK_URL =
  'https://github.com/Sparticuz/chromium/releases/download/v149.0.0/chromium-v149.0.0-pack.x64.tar';

export async function renderAgreementPdfSafely(
  data: NvData,
  clauses: NvClause[],
): Promise<MailAttachment[]> {
  try {
    const { renderAgreements } = await import('@vs/documents');

    // An explicit CHROMIUM_PATH (a path already on disk) always wins — useful
    // for a custom Netlify build plugin, or any environment that provides its
    // own Chromium. Otherwise fetch the pack @sparticuz/chromium-min points at.
    let executablePath = process.env.CHROMIUM_PATH;
    if (!executablePath) {
      const chromium = (await import('@sparticuz/chromium-min')).default;
      executablePath = await chromium.executablePath(
        process.env.CHROMIUM_PACK_URL || DEFAULT_CHROMIUM_PACK_URL,
      );
    }

    const files = await renderAgreements(data, { clauses, executablePath });
    return files.map((f) => ({ filename: f.filename, content: f.pdf, contentType: 'application/pdf' }));
  } catch (err) {
    console.error(
      '[pdf] Nutzungsvereinbarung rendering failed — sending the email without a PDF attachment.',
      err,
    );
    return [];
  }
}
