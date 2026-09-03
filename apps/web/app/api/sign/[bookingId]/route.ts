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

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

function bad(error: string, status = 400) {
  return NextResponse.json({ ok: false, error }, { status });
}

function extensionFor(file: File): string {
  const fromName = file.name.split('.').pop();
  if (fromName && fromName.length <= 5) return fromName.toLowerCase();
  if (file.type === 'application/pdf') return 'pdf';
  if (file.type.startsWith('image/')) return file.type.split('/')[1] || 'jpg';
  return 'bin';
}

export async function POST(
  request: Request,
  { params }: { params: Promise<{ bookingId: string }> },
): Promise<Response> {
  const { bookingId } = await params;
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
  if (booking.needs_id_upload && !(idDocument instanceof File)) return bad('missing_id_document');

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
    idPath = `${bookingId}/id.${extensionFor(idDocument)}`;
    const idBuffer = Buffer.from(await idDocument.arrayBuffer());
    const { error: idUploadError } = await admin.storage
      .from('id-uploads')
      .upload(idPath, idBuffer, { contentType: idDocument.type || 'application/octet-stream', upsert: true });
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
