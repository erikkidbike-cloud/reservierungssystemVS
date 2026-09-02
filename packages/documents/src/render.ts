// HTML → PDF via headless Chromium (playwright-core).
//
// Chromium rather than a JS PDF library because the agreement is a print
// document: @page margins, page breaks and text shaping come for free, and the
// same HTML can be previewed in a browser while iterating.

import { buildNutzungsvereinbarungHtml, type RenderOptions } from './nv-template.ts';
import type { NvData, Lang } from './nv-contract.ts';

export interface PdfOptions extends RenderOptions {
  /**
   * Explicit Chromium binary. Needed when the installed browser build differs
   * from playwright-core's pinned revision; otherwise PLAYWRIGHT_BROWSERS_PATH
   * is enough. Falls back to the CHROMIUM_PATH environment variable.
   */
  executablePath?: string;
}

/** Render arbitrary print HTML to a PDF buffer. */
export async function htmlToPdf(html: string, opts: PdfOptions = {}): Promise<Uint8Array> {
  // Imported lazily so the templates can be used (and tested) without Chromium.
  const { chromium } = await import('playwright-core');

  const browser = await chromium.launch({
    executablePath: opts.executablePath ?? process.env.CHROMIUM_PATH ?? undefined,
    args: ['--no-sandbox', '--disable-dev-shm-usage'],
  });
  try {
    const page = await browser.newPage();
    await page.setContent(html, { waitUntil: 'load' });
    return await page.pdf({
      format: 'A4',
      printBackground: true,
      preferCSSPageSize: true, // margins come from the stylesheet's @page rule
    });
  } finally {
    await browser.close();
  }
}

/** Render one language's Nutzungsvereinbarung to PDF. */
export async function renderNutzungsvereinbarung(
  data: NvData,
  opts: PdfOptions = {},
): Promise<Uint8Array> {
  return htmlToPdf(buildNutzungsvereinbarungHtml(data, opts), opts);
}

export interface AgreementFile {
  lang: Lang;
  filename: string;
  pdf: Uint8Array;
}

export interface AgreementSetOptions extends PdfOptions {
  /**
   * Which language versions to produce.
   *
   * Defaults to just the language the customer chose when booking
   * (`data.lang`). The previous manual process always attached both a German
   * and an English PDF; pass `['de', 'en']` to keep doing that.
   */
  languages?: Lang[];
}

function filenameFor(data: NvData, lang: Lang): string {
  const who = [data.customer.lastName, data.customer.firstName]
    .filter(Boolean)
    .join('-')
    .replace(/[^\p{L}\p{N}-]+/gu, '_');
  const date = data.startsAt.toISOString().slice(0, 10);
  const stem = lang === 'en' ? 'Usage-Agreement' : 'Nutzungsvereinbarung';
  return [stem, data.locationCode, date, who].filter(Boolean).join('_') + '.pdf';
}

/**
 * Render the agreement in one or more languages, ready to attach to the cover
 * email. Each file carries the language and a descriptive filename so the
 * recipient can tell the versions apart.
 */
export async function renderAgreements(
  data: NvData,
  opts: AgreementSetOptions = {},
): Promise<AgreementFile[]> {
  const languages = opts.languages ?? [data.lang];
  const unique = [...new Set(languages)];

  const files: AgreementFile[] = [];
  for (const lang of unique) {
    const pdf = await renderNutzungsvereinbarung(data, { ...opts, lang });
    files.push({ lang, filename: filenameFor(data, lang), pdf });
  }
  return files;
}
