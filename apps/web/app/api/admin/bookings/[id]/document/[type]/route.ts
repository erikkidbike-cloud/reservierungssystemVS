import { NextResponse } from 'next/server';
import { adminClient } from '@/lib/supabase';
import { getSessionUser, canSeeContactData, actionableLocationIds, mayActOnLocation } from '@/lib/auth';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string; type: string }> },
): Promise<Response> {
  const { id: bookingId, type } = await params;

  if (type !== 'signature' && type !== 'id') {
    return NextResponse.json({ error: 'invalid_type' }, { status: 400 });
  }

  const me = await getSessionUser();
  if (!me?.profile || !canSeeContactData(me.profile.role)) {
    return NextResponse.json({ error: 'forbidden' }, { status: 403 });
  }

  const admin = adminClient();
  const { data: booking, error: bookingErr } = await admin
    .from('bookings')
    .select('id, location_id')
    .eq('id', bookingId)
    .maybeSingle();

  if (bookingErr || !booking) {
    return NextResponse.json({ error: 'booking_not_found' }, { status: 404 });
  }

  const allowedLocations = await actionableLocationIds();
  if (!mayActOnLocation(allowedLocations, booking.location_id)) {
    return NextResponse.json({ error: 'forbidden' }, { status: 403 });
  }

  const { data: doc } = await admin
    .from('documents')
    .select('storage_path, id_document_path')
    .eq('booking_id', bookingId)
    .eq('type', 'nutzungsvereinbarung')
    .maybeSingle();

  if (!doc) {
    return NextResponse.json({ error: 'document_not_found' }, { status: 404 });
  }

  const bucket = type === 'signature' ? 'signed-documents' : 'id-uploads';
  const filePath = type === 'signature' ? doc.storage_path : doc.id_document_path;

  if (!filePath) {
    return NextResponse.json({ error: 'file_not_found' }, { status: 404 });
  }

  const { data: fileBlob, error: downloadError } = await admin.storage
    .from(bucket)
    .download(filePath);

  if (downloadError || !fileBlob) {
    console.error('[document download] download failed', downloadError);
    return NextResponse.json({ error: 'download_failed' }, { status: 500 });
  }

  const arrayBuffer = await fileBlob.arrayBuffer();
  const contentType =
    fileBlob.type ||
    (filePath.endsWith('.pdf')
      ? 'application/pdf'
      : filePath.endsWith('.png')
        ? 'image/png'
        : 'image/jpeg');

  return new Response(arrayBuffer, {
    status: 200,
    headers: {
      'Content-Type': contentType,
      'Content-Disposition': `inline; filename="${filePath.split('/').pop() || 'document'}"`,
      'Cache-Control': 'private, max-age=3600',
    },
  });
}
