// Sends the configurable reminder emails (/admin/reminders). One pass over
// every active rule; for each, the database returns the bookings whose anchor
// time plus the rule's offset has just passed and that haven't had this
// reminder yet (due_reminders, 0015).
//
// The duplicate guard is the reminder_sends primary key, not a check-then-act:
// the row is inserted FIRST and the mail only goes out if that insert won.
// Two overlapping cron runs therefore cannot both send — the loser's insert
// fails on the unique constraint and it skips.
//
// Best-effort per booking: one customer's mail failing must not stop the rest
// of the run.

import { NextResponse } from 'next/server';
import { adminClient } from '@/lib/supabase';
import { isCronAuthorized } from '@/lib/cron-auth';
import { sendMail } from '@/lib/mail';
import { loadMailTemplate } from '@/lib/mail-send';
import { buildMailVars, renderMailTemplate } from '@/lib/mail-vars';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

interface RuleRow {
  id: string;
  name: string;
  template_key: string;
  recipient: 'customer' | 'location';
}

interface DueBooking {
  id: string;
  location_id: string;
  starts_at: string;
  ends_at: string;
  persons: number | null;
  event_type: string | null;
  price_total: number | null;
  caution: number | null;
  lang: string;
  customer_id: string | null;
}

export async function GET(request: Request) {
  if (!isCronAuthorized(request)) {
    return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  }

  const admin = adminClient();
  const { data: ruleRows, error: ruleError } = await admin
    .from('reminder_rules')
    .select('id, name, template_key, recipient')
    .eq('is_active', true);

  if (ruleError) {
    console.error('[cron/send-reminders] loading rules failed', ruleError);
    return NextResponse.json({ ok: false, error: ruleError.message }, { status: 500 });
  }

  const rules = (ruleRows ?? []) as RuleRow[];
  let sent = 0;
  let skipped = 0;
  const failures: string[] = [];

  for (const rule of rules) {
    const { data: dueRows, error: dueError } = await admin.rpc('due_reminders', {
      p_rule_id: rule.id,
    });
    if (dueError) {
      console.error(`[cron/send-reminders] due_reminders failed for ${rule.name}`, dueError);
      failures.push(rule.name);
      continue;
    }

    const due = (dueRows ?? []) as DueBooking[];
    if (due.length === 0) continue;

    const template = await loadMailTemplate(admin, rule.template_key);
    if (!template) {
      console.error(`[cron/send-reminders] template "${rule.template_key}" missing for rule ${rule.name}`);
      failures.push(rule.name);
      continue;
    }

    for (const b of due) {
      // Claim first. A duplicate key here means another run already has it.
      const { error: claimError } = await admin
        .from('reminder_sends')
        .insert({ booking_id: b.id, rule_id: rule.id });
      if (claimError) {
        skipped += 1;
        continue;
      }

      const [{ data: location }, { data: customer }] = await Promise.all([
        admin.from('locations').select('name, code, cc_emails').eq('id', b.location_id).maybeSingle(),
        b.customer_id
          ? admin
              .from('customers')
              .select('first_name, last_name, email, phone')
              .eq('id', b.customer_id)
              .maybeSingle()
          : Promise.resolve({ data: null }),
      ]);

      const email = (customer as { email?: string } | null)?.email ?? null;
      const to =
        rule.recipient === 'location'
          ? ((location as { cc_emails?: string[] } | null)?.cc_emails ?? [])
          : email
            ? [email]
            : [];

      if (to.length === 0) {
        // Nothing to send to — the claim row stays, so this booking isn't
        // retried forever for a rule it can never satisfy.
        continue;
      }

      const name =
        [(customer as { first_name?: string } | null)?.first_name,
         (customer as { last_name?: string } | null)?.last_name]
          .filter(Boolean)
          .join(' ') || (email ?? '');

      const lang = b.lang === 'en' ? 'en' : 'de';
      const vars = buildMailVars(
        {
          locationName: (location as { name?: string } | null)?.name ?? '',
          locationCode: (location as { code?: string } | null)?.code ?? '',
          startsAt: b.starts_at,
          endsAt: b.ends_at,
          persons: b.persons,
          eventType: b.event_type,
          priceTotal: b.price_total,
          caution: b.caution,
          customerName: name,
          customerEmail: email ?? '',
          customerPhone: (customer as { phone?: string } | null)?.phone ?? null,
          lang,
        },
        lang,
      );

      const { subject, body } = renderMailTemplate(template, lang, vars);
      const result = await sendMail({ to, subject, text: body });
      if (result.sent) sent += 1;
    }
  }

  return NextResponse.json({ ok: failures.length === 0, rules: rules.length, sent, skipped, failures });
}

export async function POST(request: Request) {
  return GET(request);
}
