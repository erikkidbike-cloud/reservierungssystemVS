# Cutover: pointing kidbike.de at the new booking form

This is the step from backlog **2.5** that lives outside this repository — on
the kidbike.de website itself, not in the Next.js app. Everything this repo
can prepare is done (see `docs/06-handoff-backlog.md` Phase 2); this page is
what's left to actually do it.

## Before you start

Per `docs/08-improvement-plan.md`'s "Decisions from the owner" §3: keep the
**old system authoritative and untouched** until this cutover, and do this
once, cleanly, rather than gradually per location. Concretely:

- [ ] Every location you're about to cut over has a working online tariff
      (`/admin/tariffs`) and, if it needs one, an agreement (`/admin/agreements`).
- [ ] `RESEND_API_KEY` / `MAIL_FROM` are set (Netlify environment) — a booking
      with no working notification mail is a booking nobody hears about.
- [ ] `NEXT_PUBLIC_SITE_URL` is set to the real deployed URL — the signing link
      in `agreementSentToCustomer()` and the admin link in the new-request mail
      both depend on it, or they'll point at whatever origin happened to serve
      that particular request.
- [ ] You've made at least one real booking through `/book` yourself, end to
      end, including receiving the confirmation mail.

## The embed

The old `index.html` posted `{ type: 'embed-size', height }` to its parent
window so the surrounding page could resize the iframe to fit — no scrollbar
inside a fixed-size box. `/book` does the same thing
(`apps/web/app/book/BookingWizard.tsx`'s `useEffect`), so **no change is needed
on the receiving end** if the current WordPress page already listens for that
message. If it doesn't, or you're setting up the embed fresh, the listener is
a few lines:

```html
<iframe id="booking-frame" src="https://<your-deployed-url>/book" style="width:100%;border:0;"></iframe>
<script>
  window.addEventListener('message', (e) => {
    if (e.data && e.data.type === 'embed-size') {
      document.getElementById('booking-frame').style.height = e.data.height + 'px';
    }
  });
</script>
```

Point the `src` at `/book` (the location chooser) or `/book?school=WE` etc. if
each location has its own page on the website, the way `events-we.json` etc.
were split per location before.

## Steps

1. **Stage it first.** Embed the new iframe on a page nobody links to yet (or
   a Netlify deploy preview URL), and click through a real request on every
   location you're cutting over — WE, WA, and note that WI shows the "call us"
   panel rather than a form (`online_bookability = 'phone_only'`), matching
   what the old form did.
2. **Swap the iframe** on the live page(s) to the new `src`. This is the actual
   cutover moment — from here, every new request goes into this system.
3. **Stop the old intake, in this order** (each one only after confirming
   nothing upstream still depends on it):
   - Disable the Apps Script triggers that watched the Google Form / Sheet.
   - Disable the four Power Automate flows.
   - Remove or archive the GitHub Actions dispatch that regenerated
     `events-*.json`.
   - Leave the Sheet itself alone for now — it's your record of every booking
     made before cutover, and backlog **1.7** (historical import) reads from
     it. Archive it once that import is done, not before.
4. **Watch the first week.** Check `/admin/bookings` daily; confirm the
   notification mail is reaching the location's `cc_emails`, and that nothing
   is landing in spam (see `docs/07-supabase-setup.md`'s Resend/DNS section if
   it is).

## What NOT to do

- Don't run the old form and the new one side by side "just in case" for more
  than the staging step above — double entry is how two systems quietly
  disagree about what's booked, and that's the exact failure mode this rebuild
  exists to remove.
- Don't skip straight from "it built successfully" to swapping the live
  iframe. Stage it, click through it, read the confirmation mail yourself.
