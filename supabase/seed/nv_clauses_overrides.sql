-- nv_clauses_overrides.sql
-- Deliberate, hand-authored changes to the Nutzungsvereinbarung text that are
-- NOT (yet) in the owner's Word templates.
--
-- Apply order: seed.sql → nv_clauses.sql → THIS FILE. It uses
-- ON CONFLICT DO UPDATE, so it wins over the Word-imported text and survives a
-- re-import (re-running scripts/import-nv-docx.py regenerates nv_clauses.sql,
-- but this file is applied afterwards and is never regenerated).
--
-- Everything here should eventually be folded back into the Word templates so
-- the two stop diverging — each entry says what still needs doing.

-- ---------------------------------------------------------------------------
-- WA: add the missing deposit (Kaution) clause.
--
-- Resolves docs/05-open-questions.md §18: the booking form charges a
-- Wassertorplatz deposit of 50 € (≤45 people) / 70 € (≥46) — see
-- PRICING.WA.cautionFn — but the Wassertorplatz agreement never mentioned a
-- deposit at all ("Kaution" appeared zero times in it, against nine times in
-- the Weinstraße agreement). Owner decision: charge it AND put it in the
-- contract.
--
-- The wording is NOT invented: the deposit sentences are lifted from the
-- owner's own Weinstraße clause (`entgelt_kaution`), which is existing, in-use
-- contract text, and merged into Wassertorplatz's own fee sentence so the rest
-- of its voice is unchanged. The amounts are merge fields, so the figures come
-- from the pricing engine rather than being written into the prose.
--
-- ⚠️ STILL TO DO (owner): add the same clause to the Wassertorplatz Word
-- template, so a future `import-nv-docx.py` run doesn't reintroduce a
-- deposit-free version of the contract into nv_clauses.sql. Until then, this
-- override is the only thing keeping the contract and the invoice consistent.
-- ⚠️ The drafted wording below is an adaptation, not reviewed legal advice —
-- worth a read-through before the first real WA agreement goes out. It is
-- editable at /admin/agreements without a deploy.
insert into agreement_clauses (location_id, clause_key, sort_order, title_de, title_en, body_de, body_en)
select
  id,
  'entgelt',
  2,
  'Nutzungsentgelt und Kaution',
  'Usage fee and security deposit',
  'Für unseren Aufwand erheben wir ein Nutzungsentgelt in Höhe von«Nutzung_Üw». Zusätzlich erheben wir eine Kaution in Höhe von«Kaution», die zusammen mit dem Nutzungsentgelt «Zahlung_bis» unter Angabe des unten genannten Verwendungszwecks auf unser Konto zu überweisen ist. Die Kaution sichert alle unsere Ansprüche aus dieser Vereinbarung. Nach der Übergabe erstatten wir die Kaution (abzüglich berechtigter Ansprüche) innerhalb von 14 Tagen auf das Senderkonto. Die Reservierung ist erst verbindlich, nachdem wir den Betrag erhalten haben.
Kontoinhaber: KidBike e.V.
Bank: Berliner Sparkasse
IBAN: DE09 1005 0000 0190 8304 17
BIC: BELADEBEXXX
Betrag: «Betrag_Summe_Nutzung_Üw__Kaution»
Verwendungszweck: «AutoVZweck»',
  'We charge a usage fee of«Nutzung_Üw» for our efforts. Additionally, we require a security deposit of«Kaution», which must be transferred together with the usage fee «Zahlung_bis_Englisch» to our account with the payment reference stated below. The deposit secures all our claims under this agreement. After handover, we will refund the deposit (minus any justified claims) to the sender''s account within 14 days. The reservation becomes binding only after we have received the payment.
Account holder: KidBike e.V.
Bank: Berliner Sparkasse
IBAN: DE09 1005 0000 0190 8304 17
BIC: BELADEBEXXX
Amount: «Betrag_Summe_Nutzung_Üw__Kaution»
Payment Reference: «AutoVZweck»'
from locations where code = 'WA'
on conflict (location_id, clause_key) do update set
  title_de = excluded.title_de,
  title_en = excluded.title_en,
  body_de  = excluded.body_de,
  body_en  = excluded.body_en;
