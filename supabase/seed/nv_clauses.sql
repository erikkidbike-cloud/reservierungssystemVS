-- nv_clauses.sql
-- GENERATED FILE — do not edit by hand.
-- Produced by packages/documents/scripts/export-clauses-sql.mts from
-- src/nv-clauses.generated.ts (itself extracted from the Word templates by
-- import-nv-docx.py). Seeds each location's INITIAL, editable copy of its
-- Nutzungsvereinbarung into agreement_clauses. Apply AFTER seed.sql (needs
-- the locations to already exist). Every insert is ON CONFLICT DO NOTHING —
-- an edit made later in /admin/agreements is never overwritten by re-seeding.

-- WE: 16 clauses
insert into agreement_clauses (location_id, clause_key, sort_order, title_de, title_en, body_de, body_en)
select id, 'nutzungszeit', 1, 'Nutzungszeit und -art', 'Usage time and type', 'Der Nutzer/die Nutzerin wird die Anlage wie folgt nutzen:
Datum:
Uhrzeit:
Art der Veranstaltung:
Anzahl Personen:
Extra:
«Datum»
«Zeit_von» - «Zeit_bis»
«Art_der_Veranstaltung_»
«Anzahl__Kinder_Erwachsene»
«ExtraWünsche»', 'The user will use the facility as follows:
Date:
Time:
Event type:
Number of persons:
Extra:
«Datum»
«Zeit_von» - «Zeit_bis»
«Art_der_Veranstaltung_»
«Anzahl__Kinder_Erwachsene»
«ExtraWünsche»'
from locations where code = 'WE'
on conflict (location_id, clause_key) do nothing;

insert into agreement_clauses (location_id, clause_key, sort_order, title_de, title_en, body_de, body_en)
select id, 'entgelt_kaution', 2, 'Nutzungsentgelt und Kaution', 'Usage fee and security deposit', 'Für unseren Aufwand erheben wir ein Nutzungsentgelt in Höhe von«Nutzung_Üw». Zusätzlich erheben wir eine Kaution in Höhe von«Kaution», die zusammen mit dem Nutzungsentgelt «Zahlung_bis» zu überweisen ist. Die Kaution sichert alle unsere Ansprüche aus dieser Vereinbarung. Nach der Übergabe erstatten wir die Kaution (abzüglich berechtigter Ansprüche) innerhalb von 14 Tagen auf das Senderkonto.
Die Reservierung ist erst verbindlich, nachdem:
- Der vollständige Betrag bei uns eingegangen ist.
- Diese Nutzungsvereinbarung (online) unterzeichnet vorliegt.
«TxtAusweisDE»
Zahlungsdaten
Betrag
«Betrag_Summe_Nutzung_Üw__Kaution»
Verwendungszweck
«AutoVZweck»
Kontoinhaber
KidBike e.V.
Bank
Berliner Sparkasse
IBAN
DE09 1005 0000 0190 8304 17
BIC
BELADEBEXXX', 'For our efforts, we charge a usage fee of«Nutzung_Üw». Additionally, we require a security deposit of«Kaution», which must be transferred together with the usage fee «Zahlung_bis_Englisch». The deposit secures all our claims under this agreement. After handover, we will refund the deposit (minus any justified claims) to the sender''s account within 14 days.
The reservation only becomes binding once we have received:
- The full payment.
- This signed usage agreement.
«TxtAusweisEN»
Payment details
Amount
«Betrag_Summe_Nutzung_Üw__Kaution»
Payment reference
«AutoVZweck»
Account holder
KidBike e.V.
Bank
Berliner Sparkasse
IBAN
DE09 1005 0000 0190 8304 17
BIC
BELADEBEXXX'
from locations where code = 'WE'
on conflict (location_id, clause_key) do nothing;

insert into agreement_clauses (location_id, clause_key, sort_order, title_de, title_en, body_de, body_en)
select id, 'personenzahl', 3, 'Personenzahl – nachträgliche Änderung und Überschreitung', 'Number of persons – subsequent changes and exceeding the agreed number', 'Die in Ziffer 1 angegebene Personenzahl ist verbindlich und Grundlage für die Berechnung des Nutzungsentgelts.
(1) Nachträgliche Änderung: Sie können uns auch nach der Buchung eine abweichende Personenzahl mitteilen. Erhöht sich dadurch das Nutzungsentgelt, ist der Differenzbetrag vor Beginn der Veranstaltung nachzuzahlen; die Reservierung für die höhere Personenzahl wird erst mit Eingang des Differenzbetrags verbindlich. Verringert sich das Nutzungsentgelt, erstatten wir Ihnen den Differenzbetrag zusammen mit der Kaution innerhalb von 14 Tagen nach der Übergabe.
(2) Überschreitung ohne vorherige Mitteilung: Nehmen an Ihrer Veranstaltung mehr Personen teil als nach Ziffer 1 – oder nach einer Änderung gemäß Absatz 1 – vereinbart, ohne dass Sie uns dies vorab mitgeteilt und den Mehrbetrag ausgeglichen haben, wird als Vertragsstrafe das Doppelte des sich aus der tatsächlichen Personenzahl ergebenden Differenzbetrags des Nutzungsentgelts fällig. Maßgeblich ist die von unseren Mitarbeiter*innen vor Ort festgestellte Personenzahl. Die Vertragsstrafe wird auf etwaigen Schadensersatz angerechnet; Ihnen bleibt der Nachweis gestattet, dass kein oder ein geringerer Schaden entstanden ist.', 'The number of persons stated in Section 1 is binding and forms the basis for calculating the usage fee.
(1) Subsequent changes: You may notify us of a different number of persons even after booking. If this increases the usage fee, the difference must be paid before the start of the event; the reservation for the higher number of persons only becomes binding once we have received the difference. If the usage fee decreases, we will refund the difference together with the deposit within 14 days after handover.
(2) Exceeding without prior notice: If more persons attend your event than agreed under Section 1 – or under a change pursuant to paragraph 1 – without you having notified us in advance and settled the additional amount, a contractual penalty amounting to double the difference in the usage fee resulting from the actual number of persons becomes due. The number of persons determined by our staff on site is decisive. The penalty is offset against any damage claims; you may provide evidence that no damage, or less damage, occurred.'
from locations where code = 'WE'
on conflict (location_id, clause_key) do nothing;

insert into agreement_clauses (location_id, clause_key, sort_order, title_de, title_en, body_de, body_en)
select id, 'stornierung', 4, 'Stornierung', 'Cancellation', 'Einen vereinbarten Nutzungstermin können Sie bis spätestens 14 Tage vorher stornieren. Sie erhalten dann das Nutzungsentgelt und die Kaution von uns vollständig zurück. Nach dieser Frist behalten wir das Nutzungsentgelt als Entschädigung für entgangene Reservierungen ein. Ihnen bleibt der Nachweis gestattet, dass uns kein oder ein geringerer Schaden entstanden ist.', 'You may cancel the agreed usage date up to 14 days in advance. In that case, you will receive a full refund of the usage fee and the deposit. After this deadline, we will retain the fee as compensation for missed reservations. You may provide evidence that we incurred no damage, or less damage.'
from locations where code = 'WE'
on conflict (location_id, clause_key) do nothing;

insert into agreement_clauses (location_id, clause_key, sort_order, title_de, title_en, body_de, body_en)
select id, 'reinigung', 5, 'Reinigung', 'Cleaning', 'Nach der Nutzung der Verkehrsschule müssen uns die Räume und Anlagen im sauberen und ordentlichen Zustand übergeben werden. Dies gilt auch für die Toiletten. Nehmen Sie Ihren Müll bitte mit nach Hause. Entsorgen Sie ihn nicht in der Verkehrsschule! Erledigen Sie bitte alle Reinigungsarbeiten noch am Nutzungstag, bevor Sie die Einrichtung verlassen. Eine Reinigung zu einem späteren Zeitpunkt muss gesondert vereinbart werden. Sollte keine oder eine nur unzureichende Reinigung stattgefunden haben, behalten wir uns eine angemessene Nachforderung für den uns dadurch entstehenden Mehraufwand vor.', 'After using the traffic school, the rooms and facilities must be returned to us in a clean and orderly condition. This also applies to the toilets. Please take your trash home and do not dispose of it at the traffic school! Please complete all cleaning tasks on the day of use before leaving the facility. Cleaning at a later time must be agreed upon separately. If no or only insufficient cleaning has taken place, we reserve the right to request reasonable compensation for the additional effort incurred.'
from locations where code = 'WE'
on conflict (location_id, clause_key) do nothing;

insert into agreement_clauses (location_id, clause_key, sort_order, title_de, title_en, body_de, body_en)
select id, 'laerm', 6, 'Lärmvermeidung', 'Noise prevention', 'Nehmen Sie bitte Rücksicht auf die Nachbarn der Verkehrsschule und geben Sie ihnen keinen Anlass zur Beschwerde wegen Lärmbelästigung. Bitte reduzieren Sie die Lautstärke samstags ab 22:00 Uhr, werktags und sonntags schon ab 20:00 Uhr auf eine angemessene Zimmer-Lautstärke. Setzen Sie Lärmverstöße trotz Abmahnung durch unsere Mitarbeiter*innen fort, wird eine Vertragsstrafe von 100 € fällig. Muss wegen der von Ihrer Veranstaltung ausgehenden Lärmbelästigung die Polizei oder das Ordnungsamt tätig werden, oder dauert die Belästigung nach deren Einschreiten weiter an, wird eine weitere Vertragsstrafe von 200 € fällig, insgesamt höchstens 300 €. Die Vertragsstrafe wird auf etwaigen Schadensersatz angerechnet; Ihnen bleibt der Nachweis gestattet, dass kein oder ein geringerer Schaden entstanden ist.', 'Please be considerate of the neighbors of the traffic school and avoid giving them any reason to complain about noise. Reduce the volume to room level from 10:00 p.m. on Saturdays, and from 8:00 p.m. on weekdays and Sundays. If noise violations continue despite a warning from our staff, a contractual penalty of €100 becomes due. If the police or the public order office (Ordnungsamt) have to intervene because of noise coming from your event, or if the disturbance continues after their intervention, a further contractual penalty of €200 becomes due, up to a maximum of €300. The penalty is offset against any damage claims; you may provide evidence that no damage, or less damage, occurred.'
from locations where code = 'WE'
on conflict (location_id, clause_key) do nothing;

insert into agreement_clauses (location_id, clause_key, sort_order, title_de, title_en, body_de, body_en)
select id, 'rauchverbot', 7, 'Rauchverbot', 'Smoking ban', 'Bitte haben Sie Verständnis für das Rauchverbot in der gesamten Einrichtung. Rauchen Sie bitte vor dem Zugang zum Gelände und entsorgen Sie Zigaretten in einem Aschenbecher.', 'Please respect the smoking ban throughout the entire facility. If you must smoke, do so outside of the premises and dispose of cigarettes in an ashtray.'
from locations where code = 'WE'
on conflict (location_id, clause_key) do nothing;

insert into agreement_clauses (location_id, clause_key, sort_order, title_de, title_en, body_de, body_en)
select id, 'haftung', 8, 'Haftung', 'Liability', 'KidBike e.V. haftet unbeschränkt bei Vorsatz, grober Fahrlässigkeit sowie bei Schäden an Leben, Körper oder Gesundheit. Bei einfacher Fahrlässigkeit haften wir nur bei Verletzung wesentlicher Vertragspflichten – also solcher, ohne die dieser Vertrag nicht durchführbar wäre – und nur für den vorhersehbaren, vertragstypischen Schaden; im Übrigen ist die Haftung ausgeschlossen. Für mitgebrachtes Eigentum haften wir nicht. Sie sind Veranstalter*in und sollten eine Veranstaltungshaftpflichtversicherung abschließen, um sich gegen Ansprüche Dritter abzusichern.', 'KidBike e.V. is fully liable in cases of intent, gross negligence, and injury to life, body, or health. For simple negligence, we are liable only for breaching essential contractual duties – those without which this agreement could not be performed – and only for foreseeable, agreement-typical damage; otherwise liability is excluded. We are not liable for property you bring along. You are the event organizer and should take out event liability insurance to cover third-party claims.'
from locations where code = 'WE'
on conflict (location_id, clause_key) do nothing;

insert into agreement_clauses (location_id, clause_key, sort_order, title_de, title_en, body_de, body_en)
select id, 'schaeden', 9, 'Schäden und Verluste', 'Damages and Loss', 'Sollten uns durch Ihre Nutzung Schäden an Einrichtung und Gegenständen (dies schließt den Flur mit ein) entstehen oder diese abhandenkommen, so haften Sie für die Reparatur- bzw. Wiederbeschaffungskosten. Dies gilt auch für Schäden und Verluste, die durch Ihre Gäste oder sonstige Teilnehmer*innen Ihrer Veranstaltung verursacht werden; deren Verhalten wird Ihnen zugerechnet. Für den administrativen Mehraufwand bei der Schadensabwicklung stellen wir zusätzlich eine Bearbeitungsgebühr in Höhe von 50,00 € in Rechnung. Dem Nutzer bleibt der Nachweis gestattet, dass kein oder ein geringerer Aufwand entstanden ist. Die Geltendmachung eines weitergehenden Schadens bleibt unberührt. Außerdem können Sie von einer künftigen Nutzung unserer Einrichtung ausgeschlossen werden.', 'If your use results in damage to the facility and its contents (including the hallway), or if items go missing, you are liable for the repair or replacement costs. This also applies to damage and losses caused by your guests or other participants of your event; their conduct is attributed to you. For the additional administrative effort involved in processing damages, we will charge an additional administrative fee of € 50.00. The user is permitted to provide evidence that no administrative effort, or a lesser effort, was incurred. The right to claim further damages remains unaffected. Furthermore, you may be excluded from future use of our facility.'
from locations where code = 'WE'
on conflict (location_id, clause_key) do nothing;

insert into agreement_clauses (location_id, clause_key, sort_order, title_de, title_en, body_de, body_en)
select id, 'auf_abbau', 10, 'Auf- und Abbau von bereitgestellten Ausstattungen', 'Setup and Takedown of Provided Equipment', 'Bierzeltgarnituren und Pavillons, die von KidBike e.V. zur Verfügung gestellt werden, sind von den Nutzerinnen und Nutzern selbstständig auf- und abzubauen. Bitte planen Sie hierfür ausreichend Zeit ein und behandeln Sie das Material sorgfältig.', 'Beer tent sets and pavilions provided by KidBike e. V. must be assembled and disassembled by users themselves. Please plan enough time for this and treat the materials with care.'
from locations where code = 'WE'
on conflict (location_id, clause_key) do nothing;

insert into agreement_clauses (location_id, clause_key, sort_order, title_de, title_en, body_de, body_en)
select id, 'parallelveranstaltungen', 11, 'Parallelveranstaltungen und gemeinsame Nutzung', 'Parallel Events and Shared Use', 'Ein exklusives Nutzungsrecht für das gesamte Gelände der Verkehrsschule besteht nicht. Es kann vorkommen, dass parallel zu Ihrer Veranstaltung eine weitere Veranstaltung auf einem anderen Teil des Geländes stattfindet, worüber wir Sie im Voraus informieren werden. KidBike e. V. stellt in diesem Fall sicher, dass die Gesamtzahl der anwesenden Personen angemessen bleibt, ausreichend Platz für Ihre Veranstaltung zur Verfügung steht und die gleichzeitigen Nutzungen kein Konfliktpotential darstellen.
Derjenige der zuerst gebucht hat, hat das Recht auf die Nutzung des Innenraums. Sie sind die Partei, die als «ErstbucherZweite_Bucher» gebucht hat.', 'Exclusive use of the entire traffic school grounds is not guaranteed. It is possible that another event may take place on a different part of the grounds during your reservation. We will inform you of this in advance. KidBike e.V. will ensure that the total number of attendees remains reasonable, sufficient space is available for your event, and that simultaneous uses do not result in conflicts.
The party who booked first has priority for use of the indoor space. You are the party that booked «ErstbucherZweite_Bucher» (“erste” = first, “zweite” = second)'
from locations where code = 'WE'
on conflict (location_id, clause_key) do nothing;

insert into agreement_clauses (location_id, clause_key, sort_order, title_de, title_en, body_de, body_en)
select id, 'kinderfreizeitprojekt', 12, 'Nutzung während des Kinderfreizeitprojekts', 'Usage during the „Kinderfreizeitprojekt“', 'Montags bis samstags findet auf dem Gelände der Verkehrsschule von 14:00 bis 18:00 Uhr unser Kinderfreizeitprojekt statt. Während dieser Zeit wird das Außengelände gemeinsam genutzt. Der Innenraum steht Ihnen in diesem Zeitraum jedoch vollständig und ausschließlich zur Verfügung.', 'From Monday to Saturday, our children''s recreation project takes place on the traffic school grounds from 2:00 p.m. to 6:00 p.m. The outdoor area is used jointly during this period, meaning you share the outdoor space with the children''s project, but you have full and exclusive access to the indoor area.'
from locations where code = 'WE'
on conflict (location_id, clause_key) do nothing;

insert into agreement_clauses (location_id, clause_key, sort_order, title_de, title_en, body_de, body_en)
select id, 'autolieferungen', 13, 'Lieferungen per Auto', 'Deliveries by Car', 'Das Befahren des Geländes mit Autos ist nur zum Be- und Entladen am Anfang oder Ende der Nutzungszeit und nach Absprache mit den Mitarbeiter*innen vor Ort erlaubt. Dabei dürfen keine Aktivitäten gestört und die Sicherheit muss gewährleistet sein. Während des Kinderfreizeitprojekts (Mo–Sa, 14–18 Uhr) ist das Befahren nicht möglich.', 'Driving onto the premises by car is only permitted for loading and unloading at the beginning or end of the rental period and must be agreed in advance with the staff on site. Activities must not be disrupted and safety must be ensured. During the “Kinderfreizeitprojekt” (Mon–Sat, 2–6 pm), driving onto the premises is not permitted.'
from locations where code = 'WE'
on conflict (location_id, clause_key) do nothing;

insert into agreement_clauses (location_id, clause_key, sort_order, title_de, title_en, body_de, body_en)
select id, 'verspaetungen', 14, 'Verspätungen und Überziehungsgebühren', 'Delayed Start or Overrunning the Rental Period', 'Wird der vereinbarte Beginn der Nutzung durch verspätetes Eintreffen des Nutzers/der Nutzerin verzögert oder endet die Veranstaltung nicht rechtzeitig zur vereinbarten Uhrzeit, behalten wir uns vor, den dadurch entstehenden Mehraufwand mit 50 € pro angefangene Stunde in Rechnung zu stellen. Ihnen bleibt der Nachweis gestattet, dass kein oder ein geringerer Aufwand entstanden ist.', 'If the agreed start time is delayed due to the late arrival of the renter, or if the event does not end at the agreed time, we reserve the right to charge for the resulting additional effort at a rate of €50 per commenced hour. You may provide evidence that no additional effort, or less effort, was incurred.'
from locations where code = 'WE'
on conflict (location_id, clause_key) do nothing;

insert into agreement_clauses (location_id, clause_key, sort_order, title_de, title_en, body_de, body_en)
select id, 'flurnutzung', 15, 'Nutzung des Flurs', 'Use of the Hallway', 'Der Flur darf während der Veranstaltung weder als Aufenthaltsbereich noch zur Durchführung der Feier genutzt werden. Er dient ausschließlich als Durchgangsbereich.', 'The hallway may not be used as a lounge area or for hosting the celebration during the event. It serves exclusively as a passageway.'
from locations where code = 'WE'
on conflict (location_id, clause_key) do nothing;

insert into agreement_clauses (location_id, clause_key, sort_order, title_de, title_en, body_de, body_en)
select id, 'hausrecht', 16, 'Hausrecht und Weisungsrecht', 'Domiciliary Rights and Right to Issue Instructions', 'Das Hausrecht liegt bei KidBike e.V. Anweisungen unserer Mitarbeiter*innen sind zu befolgen. Bei schweren oder trotz Abmahnung wiederholten Verstößen gegen diese Vereinbarung können wir die Veranstaltung vorzeitig beenden; das Nutzungsentgelt wird dann nicht erstattet.
Hiermit bestätige ich, dass ich die vorstehenden Bestimmungen gelesen habe und damit einverstanden bin.
Berlin,
Datum Unterschrift Nutzer*in Datum Unterschrift Mitarbeiter*in
Die drei Verkehrsschulen des Bezirks werden
von KidBike e.V. in Kooperation mit dem
Bezirksamt Friedrichshain-Kreuzberg organisiert.
KidBike e.V. § Bergholzstraße 8 § 12099 Berlin
Leitung: Boris Kolipost § Tel. 0176 246 111 40
E-Mail: events@kidbike.de § Web: www.kidbike.de
Verkehrsschule WeinstraßeWeinstraße 210249 BerlinTel.: 030 – 241 91 68Verkehrsschule WeinstraßeWeinstraße 210249 BerlinTel.: 030 – 241 91 68Usage Agreement
Verkehrsschule Weinstraße
Weinstraße 2
10249 Berlin
Tel.: 030 – 241 91 68
Verkehrsschule Weinstraße
Weinstraße 2
10249 Berlin
Tel.: 030 – 241 91 68
between:
Bergholzstr. 8
12099 Berlin
and:
Last name, first name: «Nachname», «Vorname»
Institution: «Einrichtung»
Address: «Anschrift»
Phone number: «Telefon_nummer»
E-Mail address: «EmailAdresse»
Welcome!
The traffic schools of Friedrichshain-Kreuzberg promote traffic safety, health, and environmental awareness among children and adults through traffic education with environmentally friendly vehicles, the joy of movement, and meaningful leisure activities. They are also places where neighbors come together and celebrate.', 'KidBike e.V. holds domiciliary rights (Hausrecht) on the premises. Instructions from our staff must be followed. In the event of serious violations of this agreement, or repeated violations despite a warning, we may end the event early; in that case, the usage fee will not be refunded.
I hereby confirm that I have read the above terms and agree to them.
Berlin,
Datum Unterschrift Nutzer*in Datum Unterschrift Mitarbeiter*in
Die drei Verkehrsschulen des Bezirks werden
von KidBike e.V. in Kooperation mit dem
Bezirksamt Friedrichshain-Kreuzberg organisiert.
KidBike e.V. § Bergholzstraße 8 § 12099 Berlin
Leitung: Boris Kolipost § Tel. 0176 246 111 40
E-Mail: events@kidbike.de § Web: www.kidbike.de'
from locations where code = 'WE'
on conflict (location_id, clause_key) do nothing;

-- WA: 11 clauses
insert into agreement_clauses (location_id, clause_key, sort_order, title_de, title_en, body_de, body_en)
select id, 'nutzungszeit', 1, 'Nutzungszeit und -art', 'Usage time and type', 'Der Nutzer/die Nutzerin wird die Anlage wie folgt nutzen:
Datum:
Uhrzeit:
Art der Veranstaltung:
Anzahl Personen:
«Datum»
«Zeit_von» - «Zeit_bis»
«Art_der_Veranstaltung_»
«Anzahl_Personen»', 'The user will use the facility as follows:
Date:
Time:
Event type:
Number of persons:
«Datum»
«Zeit_von» - «Zeit_bis»
«Art_der_Veranstaltung_»
«Anzahl_Personen»'
from locations where code = 'WA'
on conflict (location_id, clause_key) do nothing;

insert into agreement_clauses (location_id, clause_key, sort_order, title_de, title_en, body_de, body_en)
select id, 'entgelt', 2, 'Nutzungsentgelt', 'Usage fee', 'Für unseren Aufwand erheben wir ein Nutzungsentgelt in Höhe von«Nutzung_Üw», das Sie bitte «Zahlung_bis» unter Angabe des unten genannten Verwendungszwecks auf unser Konto überweisen. Die Reservierung ist erst verbindlich, nachdem wir den Betrag erhalten haben.
Kontoinhaber: KidBike e.V.
Bank: Berliner Sparkasse
IBAN: DE09 1005 0000 0190 8304 17
BIC: BELADEBEXXX
Verwendungszweck: «AutoVZweck»', 'We charge a usage fee of«Nutzung_Üw» for our efforts, which you are kindly requested to transfer to our account «Zahlung_bis_Englisch» with the payment reference stated below. The reservation becomes binding only after we have received the payment.
Account holder: KidBike e.V.
Bank: Berliner Sparkasse
IBAN: DE09 1005 0000 0190 8304 17
BIC: BELADEBEXXX
Payment Reference: «AutoVZweck»'
from locations where code = 'WA'
on conflict (location_id, clause_key) do nothing;

insert into agreement_clauses (location_id, clause_key, sort_order, title_de, title_en, body_de, body_en)
select id, 'stornierung', 3, 'Stornierung', 'Cancellation', 'Einen vereinbarten Nutzungstermin können Sie bis spätestens 14 Tage vorher widerrufen. Sie erhalten dann das Nutzungsentgelt von uns vollständig zurück. Nach dieser Frist behalten wir das Nutzungsentgelt als Entschädigung für entgangene Reservierungen ein.', 'You may cancel the agreed usage date up to 14 days in advance. In that case, you will receive a full refund of the usage fee. After this deadline, we will retain the fee as compensation for missed reservations.'
from locations where code = 'WA'
on conflict (location_id, clause_key) do nothing;

insert into agreement_clauses (location_id, clause_key, sort_order, title_de, title_en, body_de, body_en)
select id, 'reinigung', 4, 'Reinigung', 'Cleaning', 'Nach der Nutzung der Verkehrsschule müssen uns die Räume und Anlagen im sauberen und ordentlichen Zustand übergeben werden. Dies gilt auch für die Toiletten. Nehmen Sie Ihren Müll bitte mit nach Hause. Entsorgen Sie ihn nicht in der Verkehrsschule! Erledigen Sie bitte alle Reinigungsarbeiten noch am Nutzungstag, bevor Sie die Einrichtung verlassen. Eine Reinigung zu einem späteren Zeitpunkt muss gesondert vereinbart werden. Sollte keine oder eine nur unzureichende Reinigung stattgefunden haben, behalten wir uns eine angemessene Nachforderung für den uns dadurch entstehenden Mehraufwand vor.', 'After using the traffic school, the rooms and facilities must be returned to us in a clean and orderly condition. This also applies to the toilets. Please take your trash home and do not dispose of it at the traffic school! Please complete all cleaning tasks on the day of use before leaving the facility. Cleaning at a later time must be agreed upon separately. If no or only insufficient cleaning has taken place, we reserve the right to request reasonable compensation for the additional effort incurred.'
from locations where code = 'WA'
on conflict (location_id, clause_key) do nothing;

insert into agreement_clauses (location_id, clause_key, sort_order, title_de, title_en, body_de, body_en)
select id, 'laerm', 5, 'Lärmvermeidung', 'Noise prevention', 'Nehmen Sie bitte Rücksicht auf die Nachbarn der Verkehrsschule und geben Sie ihnen keinen Anlass zur Beschwerde wegen Lärmbelästigung. Bitte reduzieren Sie die Lautstärke samstags ab 22:00 Uhr, werktags und sonntags schon ab 20:00 Uhr auf eine angemessene Zimmer-Lautstärke.', 'Please be considerate of the neighbors of the traffic school and avoid giving them any reason to complain about noise. Reduce the volume to room level from 10:00 p.m. on Saturdays, and from 8:00 p.m. on weekdays and Sundays.'
from locations where code = 'WA'
on conflict (location_id, clause_key) do nothing;

insert into agreement_clauses (location_id, clause_key, sort_order, title_de, title_en, body_de, body_en)
select id, 'rauchverbot', 6, 'Rauchverbot', 'Smoking ban', 'Bitte haben Sie Verständnis für das Rauchverbot in der gesamten Einrichtung. Rauchen Sie bitte vor dem Zugang zum Gelände und entsorgen Sie Zigaretten in einem Aschenbecher.', 'Please respect the smoking ban throughout the entire facility. If you must smoke, do so outside of the premises and dispose of cigarettes in an ashtray.'
from locations where code = 'WA'
on conflict (location_id, clause_key) do nothing;

insert into agreement_clauses (location_id, clause_key, sort_order, title_de, title_en, body_de, body_en)
select id, 'haftung', 7, 'Haftung bei Personen- und Sachschäden', 'Liability for Personal Injury and Property Damage', 'Sofern keine grobe Fahrlässigkeit seitens der Mitarbeiter/innen von KidBike e.V. vorliegt, nutzen Sie die Einrichtung auf eigene Gefahr und stimmen diesem Umstand vor der Nutzung ausdrücklich zu!
Für eventuell während der Nutzung entstandene Personenschäden oder Sachschäden an mitgebrachtem Eigentum übernehmen wir keine Haftung! Sie sind selbst Veranstalter und sollten eine Veranstaltungshaftpflichtversicherung abschließen, um sich gegenüber Schadensersatzansprüchen Dritter abzusichern.', 'Unless gross negligence on the part of KidBike e. V. staff is proven, you use the facility at your own risk and expressly agree to this before use! We do not assume liability for any personal injury or damage to personal property during your use. You are considered the event organizer and should take out event liability insurance to protect yourself against third-party claims.'
from locations where code = 'WA'
on conflict (location_id, clause_key) do nothing;

insert into agreement_clauses (location_id, clause_key, sort_order, title_de, title_en, body_de, body_en)
select id, 'schaeden', 8, 'Schäden und Verluste', 'Damages and Loss', 'Sollten uns durch Ihre Nutzung Schäden an Einrichtung und Gegenständen entstehen oder diese abhandenkommen, so haften Sie für die Reparatur- bzw. Wiederbeschaffungskosten! Außerdem können Sie von einer künftigen Nutzung unserer Einrichtung ausgeschlossen werden.', 'If any damage to furnishings or objects occurs as a result of your usage, or if items go missing, you are liable for repair or replacement costs. You may also be excluded from future use of our facility.'
from locations where code = 'WA'
on conflict (location_id, clause_key) do nothing;

insert into agreement_clauses (location_id, clause_key, sort_order, title_de, title_en, body_de, body_en)
select id, 'auf_abbau', 9, 'Auf- und Abbau von bereitgestellten Ausstattungen', 'Setup and Takedown of Provided Equipment', 'Bierzeltgarnituren und Pavillons, die von KidBike e.V. zur Verfügung gestellt werden, sind von den Nutzerinnen und Nutzern selbstständig auf- und abzubauen. Bitte planen Sie hierfür ausreichend Zeit ein und behandeln Sie das Material sorgfältig.', 'Beer tent sets and pavilions provided by KidBike e. V. must be assembled and disassembled by users themselves. Please plan enough time for this and treat the materials with care.'
from locations where code = 'WA'
on conflict (location_id, clause_key) do nothing;

insert into agreement_clauses (location_id, clause_key, sort_order, title_de, title_en, body_de, body_en)
select id, 'parallelveranstaltungen', 10, 'Parallelveranstaltungen', 'Parallel Events', 'Ein exklusives Nutzungsrecht für das gesamte Gelände der Verkehrsschule besteht nicht. Es kann vorkommen, dass parallel zu Ihrer Veranstaltung eine weitere Veranstaltung auf einem anderen Teil des Geländes stattfindet, worüber wir Sie im Voraus informieren werden. KidBike e. V. stellt in diesem Fall sicher, dass ausreichend Platz für Ihre Veranstaltung zur Verfügung steht.
Soweit bei der Buchung nichts Abweichendes vereinbart wurde, steht Ihnen der Innenraum zur Verfügung.', 'There is no exclusive right of use for the entire premises of the traffic school. It may occur that another event takes place on a different part of the site at the same time as yours; in such cases, we will inform you in advance. KidBike e. V. will ensure that sufficient space is available for your event.
Unless otherwise agreed upon at the time of booking, the indoor area is available for your use.'
from locations where code = 'WA'
on conflict (location_id, clause_key) do nothing;

insert into agreement_clauses (location_id, clause_key, sort_order, title_de, title_en, body_de, body_en)
select id, 'kinderfreizeitprojekt', 11, 'Nutzung während des Kinderfreizeitprojekts', 'Usage during the „Kinderfreizeitprojekt“', 'Montags bis freitags findet auf dem Gelände der Verkehrsschule von 14:00 bis 18:00 Uhr unser Kinderfreizeitprojekt statt. Während dieser Zeit steht Ihnen als Mieter der Innenraum vollständig für die alleinige Nutzung zur Verfügung.
Hiermit bestätige ich, dass ich die vorstehenden Bestimmungen gelesen habe und damit einverstanden bin.
Berlin,
Datum Unterschrift Nutzer*in
Berlin,
Datum Unterschrift Mitarbeiter*in
Die drei Verkehrsschulen des Bezirks werden
von KidBike e.V. in Kooperation mit dem
Bezirksamt Friedrichshain-Kreuzberg organisiert.
KidBike e.V. Bergholzstraße 8 12099 Berlin
Leitung: Boris Kolipost Tel. 0176 246 111 40
E-Mail: events@kidbike.de Web: www.kidbike.de
Verkehrsschule WassertorplatzWassertorplatz 110999 BerlinTel.: 030 – 505 89 111Verkehrsschule WassertorplatzWassertorplatz 110999 BerlinTel.: 030 – 505 89 111Usage Agreement
Verkehrsschule Wassertorplatz
Wassertorplatz 1
10999 Berlin
Tel.: 030 – 505 89 111
Verkehrsschule Wassertorplatz
Wassertorplatz 1
10999 Berlin
Tel.: 030 – 505 89 111
between:
Bergholzstr. 8
12099 Berlin
and:
Last name, first name: «Nachname», «Vorname»
Institution: «Einrichtung»
Address: «Anschrift»
Phone number: «Telefon_nummer»
E-Mail address: «EmailAdresse»
Herzlich willkommen!
The traffic schools of Friedrichshain-Kreuzberg promote traffic safety, health, and environmental awareness among children and adults through traffic education with environmentally friendly vehicles, the joy of movement, and meaningful leisure activities. They are also places where neighbors come together and celebrate.', 'From Monday to Friday, our children''s recreation project takes place on the traffic school grounds from 2:00 p.m. to 6:00 p.m. The outdoor area is used jointly during this period, meaning you share the outdoor space with the children''s project, but you have full and exclusive access to the indoor area.
I hereby confirm that I have read the above terms and agree to them.
Berlin,
Date Signature of user
Berlin,
Date Signature of staff member
Die drei Verkehrsschulen des Bezirks werden
von KidBike e.V. in Kooperation mit dem
Bezirksamt Friedrichshain-Kreuzberg organisiert.
KidBike e.V. Bergholzstraße 8 12099 Berlin
Leitung: Boris Kolipost Tel. 0176 246 111 40
E-Mail: events@kidbike.de Web: www.kidbike.de'
from locations where code = 'WA'
on conflict (location_id, clause_key) do nothing;

