// Builds a MailMessage from an editable mail_templates row (0013_mail_
// templates.sql) plus a booking's data. Replaces the hardcoded per-status
// functions this file used to contain (mail-templates.ts, now deleted) — the
// wording now lives in the database, editable at /admin/mail-templates, and
// can be tweaked once more for a specific send at the compose step
// (app/admin/bookings/[id]/send/[action]).
//
// A missing template row (the seed, supabase/seed/mail_templates.sql, was
// never run) degrades the same way an unconfigured Resend key does in
// lib/mail.ts: logged and skipped, never a thrown error — a booking must
// never fail because a notification couldn't be composed.

import type { SupabaseClient } from '@supabase/supabase-js';
import type { MailMessage } from './mail';
import { buildMailVars, renderMailTemplate, reasonLine, type BookingMailContext, type MailTemplateRow } from './mail-vars';

export async function loadMailTemplate(
  supabase: SupabaseClient,
  key: string,
): Promise<MailTemplateRow | null> {
  const { data, error } = await supabase.from('mail_templates').select('*').eq('key', key).maybeSingle();
  if (error) {
    console.error(`[mail] failed to load template "${key}": ${error.message}`);
    return null;
  }
  return (data as MailTemplateRow) ?? null;
}

interface BuildOptions {
  to: string[];
  replyTo?: string;
  cc?: string[];
  extraVars?: Record<string, string>;
}

async function buildFromTemplate(
  supabase: SupabaseClient,
  key: string,
  ctx: BookingMailContext,
  opts: BuildOptions,
): Promise<MailMessage | null> {
  const tpl = await loadMailTemplate(supabase, key);
  if (!tpl) {
    console.error(`[mail] template "${key}" not found — run supabase/seed/mail_templates.sql`);
    return null;
  }
  const lang = ctx.lang === 'en' ? 'en' : 'de';
  const vars = buildMailVars(ctx, lang, opts.extraVars);
  const { subject, body } = renderMailTemplate(tpl, lang, vars);
  return { to: opts.to, subject, text: body, replyTo: opts.replyTo, cc: opts.cc };
}

export function requestReceivedToCustomer(supabase: SupabaseClient, c: BookingMailContext) {
  return buildFromTemplate(supabase, 'request_received', c, { to: [c.customerEmail] });
}

export function approvedToCustomer(supabase: SupabaseClient, c: BookingMailContext) {
  return buildFromTemplate(supabase, 'approved', c, { to: [c.customerEmail] });
}

export function rejectedToCustomer(supabase: SupabaseClient, c: BookingMailContext, reason?: string | null) {
  return buildFromTemplate(supabase, 'rejected', c, {
    to: [c.customerEmail],
    extraVars: { reasonLine: reasonLine(reason, c.lang) },
  });
}

export function cancelledToCustomer(supabase: SupabaseClient, c: BookingMailContext, reason?: string | null) {
  return buildFromTemplate(supabase, 'cancelled', c, {
    to: [c.customerEmail],
    extraVars: { reasonLine: reasonLine(reason, c.lang) },
  });
}

export function confirmedToCustomer(supabase: SupabaseClient, c: BookingMailContext) {
  return buildFromTemplate(supabase, 'confirmed', c, { to: [c.customerEmail] });
}

export function agreementSentToCustomer(supabase: SupabaseClient, c: BookingMailContext, signingLink: string) {
  return buildFromTemplate(supabase, 'agreement_sent', c, {
    to: [c.customerEmail],
    extraVars: { signingLink },
  });
}

/** To the location's team: a new request has come in and needs a decision. */
export function newRequestToLocation(supabase: SupabaseClient, c: BookingMailContext, to: string[]) {
  return buildFromTemplate(supabase, 'new_request_to_location', c, { to, replyTo: c.customerEmail });
}

/** Every template key a booking transition can send — for the compose screen's action→key mapping. */
export const MAIL_KEY_FOR_ACTION: Record<string, string> = {
  approve: 'approved',
  reject: 'rejected',
  cancel: 'cancelled',
  confirm: 'confirmed',
  send_agreement: 'agreement_sent',
};
