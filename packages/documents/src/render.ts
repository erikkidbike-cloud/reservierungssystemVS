// HTML → PDF via headless Chromium (playwright-core).
//
// Chromium is used rather than a JS PDF library because the agreement is a
// print document: @page margins, page breaks and real text shaping all come for
// free, and the same HTML can be previewed in a browser while iterating.
//
// playwright-core is a peer of the environment's browser install — set
// PLAYWRIGHT_BROWSERS_PATH (or pass executablePath) rather than downloading.

import { buildNutzungsvereinbarungHtml, type RenderOptions } from './nv-template.ts';
import type { NvData } from './nv-contract.ts';

export interface PdfOptions extends RenderOptions {
  /** Explicit Chromium binary, when not discoverable via PLAYWRIGHT_BROWSERS_PATH. */
  executablePath?: string;
}

/** Render arbitrary print HTML to a PDF buffer. */
export async function htmlToPdf(html: string, opts: PdfOptions = {}): Promise<Uint8Array> {
  // Imported lazily so the template can be used (and tested) without Chromium.
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
      // Margins come from the stylesheet's @page rule.
      preferCSSPageSize: true,
    });
  } finally {
    await browser.close();
  }
}

/** Render a booking's Nutzungsvereinbarung to PDF. */
export async function renderNutzungsvereinbarung(
  data: NvData,
  opts: PdfOptions = {},
): Promise<Uint8Array> {
  const html = buildNutzungsvereinbarungHtml(data, opts);
  return htmlToPdf(html, opts);
}
