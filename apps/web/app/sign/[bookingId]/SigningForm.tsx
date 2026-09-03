'use client';

// The actual signing UI: a canvas signature pad (mouse or touch), optional ID
// upload, and submit — replacing the with-ID and without-ID JotForm forms
// (backlog 3.3). Posted as multipart form data straight to the route handler,
// which is the only place that touches Storage or writes `documents` — this
// component never talks to Supabase directly.

import { useRef, useState } from 'react';

interface Props {
  bookingId: string;
  lang: 'de' | 'en';
  needsIdUpload: boolean;
  customerName: string;
}

const L = {
  de: {
    signHere: 'Bitte hier unterschreiben',
    clear: 'Löschen',
    name: 'Name (in Druckbuchstaben)',
    idUpload: 'Ausweisdokument hochladen (Foto oder PDF) *',
    confirm: 'Hiermit bestätige ich, dass ich die vorstehenden Bestimmungen gelesen habe und damit einverstanden bin.',
    submit: 'Verbindlich unterschreiben',
    sending: 'Wird gesendet …',
    needSignature: 'Bitte unterschreiben Sie im Feld oben, bevor Sie fortfahren.',
    needName: 'Bitte Namen eingeben.',
    needId: 'Bitte ein Ausweisdokument hochladen.',
    needConfirm: 'Bitte bestätigen Sie die Bedingungen.',
    success: 'Vielen Dank! Ihre Unterschrift wurde gespeichert.',
  },
  en: {
    signHere: 'Please sign here',
    clear: 'Clear',
    name: 'Name (block letters)',
    idUpload: 'Upload ID document (photo or PDF) *',
    confirm: 'I hereby confirm that I have read the above terms and agree to them.',
    submit: 'Sign and confirm',
    sending: 'Sending …',
    needSignature: 'Please sign in the box above before continuing.',
    needName: 'Please enter your name.',
    needId: 'Please upload an ID document.',
    needConfirm: 'Please confirm the terms.',
    success: 'Thank you! Your signature has been saved.',
  },
};

export default function SigningForm({ bookingId, lang, needsIdUpload, customerName }: Props) {
  const t = L[lang];
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const drawing = useRef(false);
  const hasSignature = useRef(false);
  const [name, setName] = useState(customerName);
  const [accept, setAccept] = useState(false);
  const [idFile, setIdFile] = useState<File | null>(null);
  const [status, setStatus] = useState<'idle' | 'sending' | 'done' | 'error'>('idle');
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  function pos(e: React.PointerEvent<HTMLCanvasElement>) {
    const rect = e.currentTarget.getBoundingClientRect();
    return { x: e.clientX - rect.left, y: e.clientY - rect.top };
  }

  function startDraw(e: React.PointerEvent<HTMLCanvasElement>) {
    const ctx = canvasRef.current?.getContext('2d');
    if (!ctx) return;
    drawing.current = true;
    const { x, y } = pos(e);
    ctx.beginPath();
    ctx.moveTo(x, y);
  }
  function draw(e: React.PointerEvent<HTMLCanvasElement>) {
    if (!drawing.current) return;
    const ctx = canvasRef.current?.getContext('2d');
    if (!ctx) return;
    const { x, y } = pos(e);
    ctx.lineWidth = 2;
    ctx.lineCap = 'round';
    ctx.strokeStyle = '#16181a';
    ctx.lineTo(x, y);
    ctx.stroke();
    hasSignature.current = true;
  }
  function endDraw() {
    drawing.current = false;
  }
  function clearSignature() {
    const canvas = canvasRef.current;
    const ctx = canvas?.getContext('2d');
    if (!canvas || !ctx) return;
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    hasSignature.current = false;
  }

  async function submit() {
    setErrorMsg(null);
    if (!hasSignature.current) return setErrorMsg(t.needSignature);
    if (!name.trim()) return setErrorMsg(t.needName);
    if (needsIdUpload && !idFile) return setErrorMsg(t.needId);
    if (!accept) return setErrorMsg(t.needConfirm);

    const canvas = canvasRef.current;
    if (!canvas) return;

    setStatus('sending');
    canvas.toBlob(async (blob) => {
      if (!blob) {
        setStatus('error');
        setErrorMsg('Signature capture failed.');
        return;
      }
      const form = new FormData();
      form.append('signerName', name.trim());
      form.append('signature', blob, 'signature.png');
      if (idFile) form.append('idDocument', idFile);

      try {
        const res = await fetch(`/api/sign/${bookingId}`, { method: 'POST', body: form });
        const json = await res.json();
        if (!res.ok || !json.ok) {
          setErrorMsg(json.error || 'Something went wrong.');
          setStatus('error');
          return;
        }
        setStatus('done');
      } catch {
        setErrorMsg('Something went wrong.');
        setStatus('error');
      }
    }, 'image/png');
  }

  if (status === 'done') {
    return (
      <div className="panel" style={{ marginTop: 24 }}>
        <strong>{t.success}</strong>
      </div>
    );
  }

  return (
    <div className="panel" style={{ marginTop: 24 }}>
      <label>{t.name}</label>
      <input type="text" value={name} onChange={(e) => setName(e.target.value)} required />

      <label style={{ marginTop: 12 }}>{t.signHere}</label>
      <canvas
        ref={canvasRef}
        width={600}
        height={180}
        style={{
          width: '100%',
          maxWidth: 600,
          height: 180,
          border: '1px solid var(--line-strong)',
          borderRadius: 'var(--radius-sm)',
          touchAction: 'none',
          background: '#fff',
        }}
        onPointerDown={startDraw}
        onPointerMove={draw}
        onPointerUp={endDraw}
        onPointerLeave={endDraw}
      />
      <div className="row" style={{ marginTop: 8 }}>
        <button type="button" className="secondary" onClick={clearSignature}>
          {t.clear}
        </button>
      </div>

      {needsIdUpload && (
        <label style={{ marginTop: 12 }}>
          {t.idUpload}
          <input
            type="file"
            accept="image/*,application/pdf"
            onChange={(e) => setIdFile(e.target.files?.[0] ?? null)}
          />
        </label>
      )}

      <label style={{ fontWeight: 400, color: 'var(--fg)', marginTop: 12 }}>
        <input
          type="checkbox"
          checked={accept}
          onChange={(e) => setAccept(e.target.checked)}
          style={{ width: 'auto', display: 'inline', marginRight: 8 }}
        />
        {t.confirm}
      </label>

      {errorMsg && <div className="notice">{errorMsg}</div>}

      <button type="button" onClick={submit} disabled={status === 'sending'} style={{ marginTop: 12 }}>
        {status === 'sending' ? t.sending : t.submit}
      </button>
    </div>
  );
}
