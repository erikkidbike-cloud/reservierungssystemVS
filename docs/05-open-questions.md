# Open questions & confirmed answers

## Confirmed by the owner (prior conversation)

1. **Logins:** ~5 people, at most 30. → design for a handful of users, not a
   crowd.
2. **Rejection message to requester:** yes, wanted (currently missing). The
   `rejected` transition must notify the customer.
3. **Signing:** a click/mouse/touch signature is **not** enough on its own — the
   current JotForm flow lets people sign *and*, when flagged for that specific
   event, upload an ID. **ID upload is optional per event.** The rebuild's
   `documents` table has `id_document_required` + `id_document_path` and
   `bookings.needs_id_upload` for exactly this. (Owner will provide the JotForm
   screenshot for the exact fields.)
4. **WA / WI Excel column layout:** owner does not have it to hand ("misschien
   valt dat nog te regelen"). → WA/WI import mapping is a follow-up once columns
   are supplied. WE columns are fully known.
5. **Pricing source of truth & reduced tariffs:** reduced tariffs (Kita/Schule,
   Berechtigungsnachweis) stay manual for now, **but the option to offer them
   online is wanted.** → engine + data model support all three `tariff_type`s;
   only `standard` is exposed on the public form initially.
6. **Bikes:** the front-end value (**1 € per bike**, 0 € reduced) is correct; the
   Apps Script "kostenlos" label is stale.
7. *(Frauenprojekt vs. Frauengefängnis)* — two different projects, more may come.
   Modelled as the `projects` table.

## Still to confirm (do not finalise these without the owner)

7. **WE Kaution rules (⚠️ Verify).** The engine reproduces the current code
   exactly, but the owner has not confirmed it is *correct*:
   - ≤50 persons fully inside 09:00–17:30 Mon–Sat → no deposit;
   - >50 inside window → 200 €; >50 outside → 500 €; everything else → 200 €.
   - The `500 €` "runs past 22:00" branch is **unreachable** since the 22:00
     closing block — should it be removed? Left in for now, flagged.
8. **Why does WA have no time surcharge while WE/WI do?** Confirm this is
   intended (it is currently `surcharge: () => 0` for WA).
9. **Why does WI have a full price table in code but is not online-bookable?**
   Confirm WI should stay phone-only, and whether its prices are ever used.
10. **How do `Datum NV versandt` (O) and `Datum NV unterschrieben` (P) reach
    Excel today?** Is there a JotForm→Excel integration/flow not seen in the
    export? Needed to reproduce the signing round-trip.
11. **Post-hold process:** is the emailed request re-typed into Excel by hand via
    the "Für Excel kopieren" TSV block, or is there another step? (Assumed
    manual; the rebuild removes this entirely.)
12. **Has the "Für Excel kopieren" TSV mapping been updated after a column change
    in `1-Termine`?** The analysis found it misaligned (writes into formula
    columns). Confirm before trusting any Excel export mapping.
13. **Rejection workflow:** confirmed the customer should be notified (answer 2).
    Design the message + who triggers it.
14. **SevDesk API access:** does the owner have an API token
    (Settings → API tokens)? Needed for Phase 4.
15. **Direction / scope:** the trigger for the analysis was a rebuild, confirmed.
16. **Bus factor:** owner currently runs flows + repo + Excel. If someone else
    must maintain later → keep the stack boring and documented (this repo does).
17. **Test environment:** is there one, or does every change go straight to prod?
    → the rebuild should have a staging Supabase project + preview deploys.

## Known bugs in the current system (candidates for Phase 0)

- **A. WE data-contract broken:** flow writes `fg`/`titelFg`/`beschrFg`/`linkFg`;
  `index.html normalizeEvents()` reads `frauenprojekt`. WE project events get no
  marking on the main calendar.
- **C. TSV mapping misaligned** with the current `1-Termine` columns.
- **E. Bike price** label mismatch (1 € vs "kostenlos").
- **F. No server-side overlap check** (fixed by the rebuild's exclusion
  constraint).
- **G. WA/WI flows** have no filename filter and run every minute → commit-storm
  risk.
- **J/K.** Admin deny-link nonce equals the id and never expires; one SECRET for
  API token + HMAC.
- **P.** `q_()` `URLSearchParams` branch throws in Apps Script.
- **Q.** Nominatim calls do nothing useful and lack an identifying User-Agent.
- **S. GDPR:** the shared "Musterdaten" workbook's `Erfahrungen` tab contains real
  personal data — re-anonymise before sharing further.
