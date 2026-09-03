// Transactional email via Resend.
//
// Uses plain fetch rather than the Resend SDK: it's one HTTP call, and this
// avoids another dependency (and another version to keep current) for no gain.
//
// Design rule that matters more than the transport: **sending mail must never
// fail a booking.** A customer who successfully reserved a slot has reserved
// it, whether or not the notification went out. So every send here is
// best-effort — failures are logged and swallowed, never thrown at the caller.
// The booking is the record; the email is a courtesy on top of it.

const RESEND_ENDPOINT = 'https://api.resend.com/emails';

export interface MailMessage {
  to: string[];
  subject: string;
  /** Plain text. Kept plain deliberately — these are short operational mails. */
  text: string;
  replyTo?: string;
  cc?: string[];
}

export interface MailResult {
  sent: boolean;
  /** Why it didn't send, for logging. Never surfaced to a customer. */
  reason?: string;
}

/**
 * Send one email. Returns rather than throws: callers are expected to carry on
 * regardless. Missing configuration is treated as "not sent", not as an error,
 * so the app runs fine in an environment with no mail set up (e.g. a preview
 * deploy) instead of erroring on every booking.
 */
export async function sendMail(msg: MailMessage): Promise<MailResult> {
  const apiKey = process.env.RESEND_API_KEY;
  const from = process.env.MAIL_FROM;

  if (!apiKey || !from) {
    const reason = 'RESEND_API_KEY or MAIL_FROM not configured';
    console.warn(`[mail] skipped: ${reason} — "${msg.subject}"`);
    return { sent: false, reason };
  }

  const recipients = msg.to.filter(Boolean);
  if (recipients.length === 0) {
    return { sent: false, reason: 'no recipients' };
  }

  try {
    const res = await fetch(RESEND_ENDPOINT, {
      method: 'POST',
      headers: {
        authorization: `Bearer ${apiKey}`,
        'content-type': 'application/json',
      },
      body: JSON.stringify({
        from,
        to: recipients,
        cc: msg.cc?.filter(Boolean),
        reply_to: msg.replyTo,
        subject: msg.subject,
        text: msg.text,
      }),
    });

    if (!res.ok) {
      const body = await res.text().catch(() => '');
      const reason = `Resend responded ${res.status}: ${body.slice(0, 300)}`;
      console.error(`[mail] failed: ${reason}`);
      return { sent: false, reason };
    }

    return { sent: true };
  } catch (err) {
    const reason = (err as Error).message;
    console.error(`[mail] failed: ${reason}`);
    return { sent: false, reason };
  }
}

/** Berlin-local formatting, shared by every template below. */
export function fmtDateTime(iso: string | Date, lang: 'de' | 'en' = 'de'): string {
  const d = typeof iso === 'string' ? new Date(iso) : iso;
  return new Intl.DateTimeFormat(lang === 'en' ? 'en-GB' : 'de-DE', {
    dateStyle: 'full',
    timeStyle: 'short',
    timeZone: 'Europe/Berlin',
  }).format(d);
}

export function fmtEuro(n: number | null | undefined, lang: 'de' | 'en' = 'de'): string {
  if (n === null || n === undefined) return '—';
  return new Intl.NumberFormat(lang === 'en' ? 'en-GB' : 'de-DE', {
    style: 'currency',
    currency: 'EUR',
  }).format(n);
}
