// Receives a signature (and optional ID upload) from the public signing page
// and completes the agreement_sent → signed transition (backlog 3.3).
//
// Runs entirely with adminClient() (service role): the visitor here has no
// Supabase session — see app/sign/[bookingId]/page.tsx's note on why the
// booking id itself is the access token — so there is no RLS-authenticated
// identity to write as. The status guard below (only from 'agreement_sent')
// is what stands in for access control on the WRITE side, mirroring how
// create_booking_request is the trusted boundary on the public booking route.

import { NextResponse } from 'next/server';
import { adminClient } from '@/lib/supabase';
import { checkRateLimit, SIGN_LIMITS } from '@/lib/rate-limit';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

function bad(error: string, status = 400) {
  return NextResponse.json({ ok: false, error }, { status });
}

/**
 * What an ID document may be, decided HERE and not by the uploader.
 *
 * This matters more than it looks: whatever lands in storage is later served
 * back to a staff member by /api/admin/bookings/[id]/document/[type]. If the
 * uploader could choose the type, they could store an SVG or an HTML file and
 * have it executed on the console's own origin the moment someone opened it —
 * stored XSS, from a link we mailed to a customer. So the extension comes from
 * this table, never from the uploaded filename (which is attacker-controlled
 * and could also smuggle path separators into the storage key).
 */
const ALLOWED_ID_TYPES: Record<string, string> = {
  'image/jpeg': 'jpg',
  'image/png': 'png',
  'image/webp': 'webp',
  'image/heic': 'heic',
  'image/heif': 'heif',
  'application/pdf': 'pdf',
};

/** An ID photo or a scan; anything larger is a mistake or an attack. */
const MAX_ID_BYTES = 10 * 1024 * 1024;
/** A canvas PNG of a signature is a few tens of KB. */
const MAX_SIGNATURE_BYTES = 2 * 1024 * 1024;

export async function POST(
  request: Request,
  { params }: { params: Promise<{ bookingId: string }> },
): Promise<Response> {
  const { bookingId } = await params;

  // Anonymous endpoint that writes to storage: throttled like the other two.
  // A valid booking id is needed to get past the status guard below, but the
  // upload happens before any human reviews it, so the cost of a flood is
  // real even when every request is rejected later.
  const rate = await checkRateLimit(request, SIGN_LIMITS);
  if (!rate.allowed) {
    console.warn(`[sign] rate limit hit: ${rate.tripped}`);
    return bad('rate_limited', 429);
  }

  const admin = adminClient();

  const { data: booking, error: loadError } = await admin
    .from('bookings')
    .select('id, status, needs_id_upload')
    .eq('id', bookingId)
    .maybeSingle();

  if (loadError) return bad('server_error', 500);
  if (!booking) return bad('not_found', 404);

  // Idempotent: the emailed link can be opened and submitted more than once
  // (a slow connection retried, a second tab) — treat an already-signed
  // booking as success rather than an error.
  if (booking.status === 'signed') {
    return NextResponse.json({ ok: true, alreadySigned: true });
  }
  if (booking.status !== 'agreement_sent') {
    return bad('not_ready', 409);
  }

  let form: FormData;
  try {
    form = await request.formData();
  } catch {
    return bad('invalid_form');
  }

  const signerName = String(form.get('signerName') ?? '').trim();
  const signature = form.get('signature');
  const idDocument = form.get('idDocument');

  if (!signerName) return bad('missing_signer_name');
  if (!(signature instanceof File) || signature.size === 0) return bad('missing_signature');
  if (signature.size > MAX_SIGNATURE_BYTES) return bad('signature_too_large', 413);
  if (booking.needs_id_upload && !(idDocument instanceof File)) return bad('missing_id_document');

  // The signature is always stored as the PNG the canvas produced; the content
  // type is asserted here rather than taken from the upload.
  const sigPath = `${bookingId}/signature.png`;
  const sigBuffer = Buffer.from(await signature.arrayBuffer());
  const { error: sigUploadError } = await admin.storage
    .from('signed-documents')
    .upload(sigPath, sigBuffer, { contentType: 'image/png', upsert: true });
  if (sigUploadError) {
    console.error('[sign] signature upload failed', sigUploadError);
    return bad('upload_failed', 500);
  }

  let idPath: string | null = null;
  if (idDocument instanceof File && idDocument.size > 0) {
    if (idDocument.size > MAX_ID_BYTES) return bad('id_document_too_large', 413);

    const extension = ALLOWED_ID_TYPES[idDocument.type];
    if (!extension) return bad('unsupported_id_document_type', 415);

    // Path and stored content type both come from the whitelist above, so
    // neither the uploaded filename nor the claimed MIME type can influence
    // what ends up in the bucket or how it is later served.
    idPath = `${bookingId}/id.${extension}`;
    const idBuffer = Buffer.from(await idDocument.arrayBuffer());
    const { error: idUploadError } = await admin.storage
      .from('id-uploads')
      .upload(idPath, idBuffer, { contentType: idDocument.type, upsert: true });
    if (idUploadError) {
      console.error('[sign] ID upload failed', idUploadError);
      return bad('upload_failed', 500);
    }
  }

  // Best-effort — signer IP is metadata for the record (see TRANSITIONS'
  // documented 'sign' effect), never a gate on whether signing succeeds.
  const signerIp =
    request.headers.get('x-forwarded-for')?.split(',')[0]?.trim() ||
    request.headers.get('x-real-ip') ||
    null;

  const { data: existingDoc } = await admin
    .from('documents')
    .select('id')
    .eq('booking_id', bookingId)
    .eq('type', 'nutzungsvereinbarung')
    .maybeSingle();

  const docPatch = {
    status: 'signed' as const,
    storage_path: sigPath,
    signed_at: new Date().toISOString(),
    signer_name: signerName,
    signer_ip: signerIp,
    id_document_path: idPath,
  };

  const docWrite = existingDoc
    ? await admin.from('documents').update(docPatch).eq('id', existingDoc.id)
    : await admin.from('documents').insert({ booking_id: bookingId, type: 'nutzungsvereinbarung', ...docPatch });

  if (docWrite.error) {
    console.error('[sign] documents write failed', docWrite.error);
    return bad('server_error', 500);
  }

  const { data: updated, error: updateError } = await admin
    .from('bookings')
    .update({ status: 'signed' })
    .eq('id', bookingId)
    .eq('status', 'agreement_sent')
    .select('id');

  if (updateError) {
    console.error('[sign] booking transition failed', updateError);
    return bad('server_error', 500);
  }
  if (!updated || updated.length === 0) {
    // Someone else's request won the race (e.g. a double submit) — the
    // document is saved either way, so this is still a success from the
    // signer's point of view.
    return NextResponse.json({ ok: true, alreadySigned: true });
  }

  return NextResponse.json({ ok: true });
}
