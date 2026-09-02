// GENERATED FILE — do not edit by hand.
// Source: packages/documents/scripts/import-nv-docx.py, run against the
// owner's Word templates. The Nutzungsvereinbarung is a binding contract:
// its wording is extracted mechanically so it is never retyped or
// paraphrased. To update, re-run the importer and review the diff.
import type { NvClause } from './nv-contract.ts';

export const NV_CLAUSE_SETS: Record<string, NvClause[]> = {
  WE: [
    {
      id: "nutzungszeit",
      titleDe: "Nutzungszeit und -art",
      titleEn: "Usage time and type",
      bodyDe: "Der Nutzer/die Nutzerin wird die Anlage wie folgt nutzen:\nDatum:\nUhrzeit:\nArt der Veranstaltung:\nAnzahl Personen:\nExtra:\n«Datum»\n«Zeit_von» - «Zeit_bis»\n«Art_der_Veranstaltung_»\n«Anzahl__Kinder_Erwachsene»\n«ExtraWünsche»",
      bodyEn: "The user will use the facility as follows:\nDate:\nTime:\nEvent type:\nNumber of persons:\nExtra:\n«Datum»\n«Zeit_von» - «Zeit_bis»\n«Art_der_Veranstaltung_»\n«Anzahl__Kinder_Erwachsene»\n«ExtraWünsche»",
    },
    {
      id: "entgelt_kaution",
      titleDe: "Nutzungsentgelt und Kaution",
      titleEn: "Usage fee and security deposit",
      bodyDe: "Für unseren Aufwand erheben wir ein Nutzungsentgelt in Höhe von«Nutzung_Üw». Zusätzlich erheben wir eine Kaution in Höhe von«Kaution», die zusammen mit dem Nutzungsentgelt «Zahlung_bis» zu überweisen ist. Die Kaution sichert alle unsere Ansprüche aus dieser Vereinbarung. Nach der Übergabe erstatten wir die Kaution (abzüglich berechtigter Ansprüche) innerhalb von 14 Tagen auf das Senderkonto.\nDie Reservierung ist erst verbindlich, nachdem:\n- Der vollständige Betrag bei uns eingegangen ist.\n- Diese Nutzungsvereinbarung (online) unterzeichnet vorliegt.\n«TxtAusweisDE»\nZahlungsdaten\nBetrag\n«Betrag_Summe_Nutzung_Üw__Kaution»\nVerwendungszweck\n«AutoVZweck»\nKontoinhaber\nKidBike e.V.\nBank\nBerliner Sparkasse\nIBAN\nDE09 1005 0000 0190 8304 17\nBIC\nBELADEBEXXX",
      bodyEn: "For our efforts, we charge a usage fee of«Nutzung_Üw». Additionally, we require a security deposit of«Kaution», which must be transferred together with the usage fee «Zahlung_bis_Englisch». The deposit secures all our claims under this agreement. After handover, we will refund the deposit (minus any justified claims) to the sender's account within 14 days.\nThe reservation only becomes binding once we have received:\n- The full payment.\n- This signed usage agreement.\n«TxtAusweisEN»\nPayment details\nAmount\n«Betrag_Summe_Nutzung_Üw__Kaution»\nPayment reference\n«AutoVZweck»\nAccount holder\nKidBike e.V.\nBank\nBerliner Sparkasse\nIBAN\nDE09 1005 0000 0190 8304 17\nBIC\nBELADEBEXXX",
    },
    {
      id: "personenzahl",
      titleDe: "Personenzahl – nachträgliche Änderung und Überschreitung",
      titleEn: "Number of persons – subsequent changes and exceeding the agreed number",
      bodyDe: "Die in Ziffer 1 angegebene Personenzahl ist verbindlich und Grundlage für die Berechnung des Nutzungsentgelts.\n(1) Nachträgliche Änderung: Sie können uns auch nach der Buchung eine abweichende Personenzahl mitteilen. Erhöht sich dadurch das Nutzungsentgelt, ist der Differenzbetrag vor Beginn der Veranstaltung nachzuzahlen; die Reservierung für die höhere Personenzahl wird erst mit Eingang des Differenzbetrags verbindlich. Verringert sich das Nutzungsentgelt, erstatten wir Ihnen den Differenzbetrag zusammen mit der Kaution innerhalb von 14 Tagen nach der Übergabe.\n(2) Überschreitung ohne vorherige Mitteilung: Nehmen an Ihrer Veranstaltung mehr Personen teil als nach Ziffer 1 – oder nach einer Änderung gemäß Absatz 1 – vereinbart, ohne dass Sie uns dies vorab mitgeteilt und den Mehrbetrag ausgeglichen haben, wird als Vertragsstrafe das Doppelte des sich aus der tatsächlichen Personenzahl ergebenden Differenzbetrags des Nutzungsentgelts fällig. Maßgeblich ist die von unseren Mitarbeiter*innen vor Ort festgestellte Personenzahl. Die Vertragsstrafe wird auf etwaigen Schadensersatz angerechnet; Ihnen bleibt der Nachweis gestattet, dass kein oder ein geringerer Schaden entstanden ist.",
      bodyEn: "The number of persons stated in Section 1 is binding and forms the basis for calculating the usage fee.\n(1) Subsequent changes: You may notify us of a different number of persons even after booking. If this increases the usage fee, the difference must be paid before the start of the event; the reservation for the higher number of persons only becomes binding once we have received the difference. If the usage fee decreases, we will refund the difference together with the deposit within 14 days after handover.\n(2) Exceeding without prior notice: If more persons attend your event than agreed under Section 1 – or under a change pursuant to paragraph 1 – without you having notified us in advance and settled the additional amount, a contractual penalty amounting to double the difference in the usage fee resulting from the actual number of persons becomes due. The number of persons determined by our staff on site is decisive. The penalty is offset against any damage claims; you may provide evidence that no damage, or less damage, occurred.",
    },
    {
      id: "stornierung",
      titleDe: "Stornierung",
      titleEn: "Cancellation",
      bodyDe: "Einen vereinbarten Nutzungstermin können Sie bis spätestens 14 Tage vorher stornieren. Sie erhalten dann das Nutzungsentgelt und die Kaution von uns vollständig zurück. Nach dieser Frist behalten wir das Nutzungsentgelt als Entschädigung für entgangene Reservierungen ein. Ihnen bleibt der Nachweis gestattet, dass uns kein oder ein geringerer Schaden entstanden ist.",
      bodyEn: "You may cancel the agreed usage date up to 14 days in advance. In that case, you will receive a full refund of the usage fee and the deposit. After this deadline, we will retain the fee as compensation for missed reservations. You may provide evidence that we incurred no damage, or less damage.",
    },
    {
      id: "reinigung",
      titleDe: "Reinigung",
      titleEn: "Cleaning",
      bodyDe: "Nach der Nutzung der Verkehrsschule müssen uns die Räume und Anlagen im sauberen und ordentlichen Zustand übergeben werden. Dies gilt auch für die Toiletten. Nehmen Sie Ihren Müll bitte mit nach Hause. Entsorgen Sie ihn nicht in der Verkehrsschule! Erledigen Sie bitte alle Reinigungsarbeiten noch am Nutzungstag, bevor Sie die Einrichtung verlassen. Eine Reinigung zu einem späteren Zeitpunkt muss gesondert vereinbart werden. Sollte keine oder eine nur unzureichende Reinigung stattgefunden haben, behalten wir uns eine angemessene Nachforderung für den uns dadurch entstehenden Mehraufwand vor.",
      bodyEn: "After using the traffic school, the rooms and facilities must be returned to us in a clean and orderly condition. This also applies to the toilets. Please take your trash home and do not dispose of it at the traffic school! Please complete all cleaning tasks on the day of use before leaving the facility. Cleaning at a later time must be agreed upon separately. If no or only insufficient cleaning has taken place, we reserve the right to request reasonable compensation for the additional effort incurred.",
    },
    {
      id: "laerm",
      titleDe: "Lärmvermeidung",
      titleEn: "Noise prevention",
      bodyDe: "Nehmen Sie bitte Rücksicht auf die Nachbarn der Verkehrsschule und geben Sie ihnen keinen Anlass zur Beschwerde wegen Lärmbelästigung. Bitte reduzieren Sie die Lautstärke samstags ab 22:00 Uhr, werktags und sonntags schon ab 20:00 Uhr auf eine angemessene Zimmer-Lautstärke. Setzen Sie Lärmverstöße trotz Abmahnung durch unsere Mitarbeiter*innen fort, wird eine Vertragsstrafe von 100 € fällig. Muss wegen der von Ihrer Veranstaltung ausgehenden Lärmbelästigung die Polizei oder das Ordnungsamt tätig werden, oder dauert die Belästigung nach deren Einschreiten weiter an, wird eine weitere Vertragsstrafe von 200 € fällig, insgesamt höchstens 300 €. Die Vertragsstrafe wird auf etwaigen Schadensersatz angerechnet; Ihnen bleibt der Nachweis gestattet, dass kein oder ein geringerer Schaden entstanden ist.",
      bodyEn: "Please be considerate of the neighbors of the traffic school and avoid giving them any reason to complain about noise. Reduce the volume to room level from 10:00 p.m. on Saturdays, and from 8:00 p.m. on weekdays and Sundays. If noise violations continue despite a warning from our staff, a contractual penalty of €100 becomes due. If the police or the public order office (Ordnungsamt) have to intervene because of noise coming from your event, or if the disturbance continues after their intervention, a further contractual penalty of €200 becomes due, up to a maximum of €300. The penalty is offset against any damage claims; you may provide evidence that no damage, or less damage, occurred.",
    },
    {
      id: "rauchverbot",
      titleDe: "Rauchverbot",
      titleEn: "Smoking ban",
      bodyDe: "Bitte haben Sie Verständnis für das Rauchverbot in der gesamten Einrichtung. Rauchen Sie bitte vor dem Zugang zum Gelände und entsorgen Sie Zigaretten in einem Aschenbecher.",
      bodyEn: "Please respect the smoking ban throughout the entire facility. If you must smoke, do so outside of the premises and dispose of cigarettes in an ashtray.",
    },
    {
      id: "haftung",
      titleDe: "Haftung",
      titleEn: "Liability",
      bodyDe: "KidBike e.V. haftet unbeschränkt bei Vorsatz, grober Fahrlässigkeit sowie bei Schäden an Leben, Körper oder Gesundheit. Bei einfacher Fahrlässigkeit haften wir nur bei Verletzung wesentlicher Vertragspflichten – also solcher, ohne die dieser Vertrag nicht durchführbar wäre – und nur für den vorhersehbaren, vertragstypischen Schaden; im Übrigen ist die Haftung ausgeschlossen. Für mitgebrachtes Eigentum haften wir nicht. Sie sind Veranstalter*in und sollten eine Veranstaltungshaftpflichtversicherung abschließen, um sich gegen Ansprüche Dritter abzusichern.",
      bodyEn: "KidBike e.V. is fully liable in cases of intent, gross negligence, and injury to life, body, or health. For simple negligence, we are liable only for breaching essential contractual duties – those without which this agreement could not be performed – and only for foreseeable, agreement-typical damage; otherwise liability is excluded. We are not liable for property you bring along. You are the event organizer and should take out event liability insurance to cover third-party claims.",
    },
    {
      id: "schaeden",
      titleDe: "Schäden und Verluste",
      titleEn: "Damages and Loss",
      bodyDe: "Sollten uns durch Ihre Nutzung Schäden an Einrichtung und Gegenständen (dies schließt den Flur mit ein) entstehen oder diese abhandenkommen, so haften Sie für die Reparatur- bzw. Wiederbeschaffungskosten. Dies gilt auch für Schäden und Verluste, die durch Ihre Gäste oder sonstige Teilnehmer*innen Ihrer Veranstaltung verursacht werden; deren Verhalten wird Ihnen zugerechnet. Für den administrativen Mehraufwand bei der Schadensabwicklung stellen wir zusätzlich eine Bearbeitungsgebühr in Höhe von 50,00 € in Rechnung. Dem Nutzer bleibt der Nachweis gestattet, dass kein oder ein geringerer Aufwand entstanden ist. Die Geltendmachung eines weitergehenden Schadens bleibt unberührt. Außerdem können Sie von einer künftigen Nutzung unserer Einrichtung ausgeschlossen werden.",
      bodyEn: "If your use results in damage to the facility and its contents (including the hallway), or if items go missing, you are liable for the repair or replacement costs. This also applies to damage and losses caused by your guests or other participants of your event; their conduct is attributed to you. For the additional administrative effort involved in processing damages, we will charge an additional administrative fee of € 50.00. The user is permitted to provide evidence that no administrative effort, or a lesser effort, was incurred. The right to claim further damages remains unaffected. Furthermore, you may be excluded from future use of our facility.",
    },
    {
      id: "auf_abbau",
      titleDe: "Auf- und Abbau von bereitgestellten Ausstattungen",
      titleEn: "Setup and Takedown of Provided Equipment",
      bodyDe: "Bierzeltgarnituren und Pavillons, die von KidBike e.V. zur Verfügung gestellt werden, sind von den Nutzerinnen und Nutzern selbstständig auf- und abzubauen. Bitte planen Sie hierfür ausreichend Zeit ein und behandeln Sie das Material sorgfältig.",
      bodyEn: "Beer tent sets and pavilions provided by KidBike e. V. must be assembled and disassembled by users themselves. Please plan enough time for this and treat the materials with care.",
    },
    {
      id: "parallelveranstaltungen",
      titleDe: "Parallelveranstaltungen und gemeinsame Nutzung",
      titleEn: "Parallel Events and Shared Use",
      bodyDe: "Ein exklusives Nutzungsrecht für das gesamte Gelände der Verkehrsschule besteht nicht. Es kann vorkommen, dass parallel zu Ihrer Veranstaltung eine weitere Veranstaltung auf einem anderen Teil des Geländes stattfindet, worüber wir Sie im Voraus informieren werden. KidBike e. V. stellt in diesem Fall sicher, dass die Gesamtzahl der anwesenden Personen angemessen bleibt, ausreichend Platz für Ihre Veranstaltung zur Verfügung steht und die gleichzeitigen Nutzungen kein Konfliktpotential darstellen.\nDerjenige der zuerst gebucht hat, hat das Recht auf die Nutzung des Innenraums. Sie sind die Partei, die als «ErstbucherZweite_Bucher» gebucht hat.",
      bodyEn: "Exclusive use of the entire traffic school grounds is not guaranteed. It is possible that another event may take place on a different part of the grounds during your reservation. We will inform you of this in advance. KidBike e.V. will ensure that the total number of attendees remains reasonable, sufficient space is available for your event, and that simultaneous uses do not result in conflicts.\nThe party who booked first has priority for use of the indoor space. You are the party that booked «ErstbucherZweite_Bucher» (“erste” = first, “zweite” = second)",
    },
    {
      id: "kinderfreizeitprojekt",
      titleDe: "Nutzung während des Kinderfreizeitprojekts",
      titleEn: "Usage during the „Kinderfreizeitprojekt“",
      bodyDe: "Montags bis samstags findet auf dem Gelände der Verkehrsschule von 14:00 bis 18:00 Uhr unser Kinderfreizeitprojekt statt. Während dieser Zeit wird das Außengelände gemeinsam genutzt. Der Innenraum steht Ihnen in diesem Zeitraum jedoch vollständig und ausschließlich zur Verfügung.",
      bodyEn: "From Monday to Saturday, our children's recreation project takes place on the traffic school grounds from 2:00 p.m. to 6:00 p.m. The outdoor area is used jointly during this period, meaning you share the outdoor space with the children's project, but you have full and exclusive access to the indoor area.",
    },
    {
      id: "autolieferungen",
      titleDe: "Lieferungen per Auto",
      titleEn: "Deliveries by Car",
      bodyDe: "Das Befahren des Geländes mit Autos ist nur zum Be- und Entladen am Anfang oder Ende der Nutzungszeit und nach Absprache mit den Mitarbeiter*innen vor Ort erlaubt. Dabei dürfen keine Aktivitäten gestört und die Sicherheit muss gewährleistet sein. Während des Kinderfreizeitprojekts (Mo–Sa, 14–18 Uhr) ist das Befahren nicht möglich.",
      bodyEn: "Driving onto the premises by car is only permitted for loading and unloading at the beginning or end of the rental period and must be agreed in advance with the staff on site. Activities must not be disrupted and safety must be ensured. During the “Kinderfreizeitprojekt” (Mon–Sat, 2–6 pm), driving onto the premises is not permitted.",
    },
    {
      id: "verspaetungen",
      titleDe: "Verspätungen und Überziehungsgebühren",
      titleEn: "Delayed Start or Overrunning the Rental Period",
      bodyDe: "Wird der vereinbarte Beginn der Nutzung durch verspätetes Eintreffen des Nutzers/der Nutzerin verzögert oder endet die Veranstaltung nicht rechtzeitig zur vereinbarten Uhrzeit, behalten wir uns vor, den dadurch entstehenden Mehraufwand mit 50 € pro angefangene Stunde in Rechnung zu stellen. Ihnen bleibt der Nachweis gestattet, dass kein oder ein geringerer Aufwand entstanden ist.",
      bodyEn: "If the agreed start time is delayed due to the late arrival of the renter, or if the event does not end at the agreed time, we reserve the right to charge for the resulting additional effort at a rate of €50 per commenced hour. You may provide evidence that no additional effort, or less effort, was incurred.",
    },
    {
      id: "flurnutzung",
      titleDe: "Nutzung des Flurs",
      titleEn: "Use of the Hallway",
      bodyDe: "Der Flur darf während der Veranstaltung weder als Aufenthaltsbereich noch zur Durchführung der Feier genutzt werden. Er dient ausschließlich als Durchgangsbereich.",
      bodyEn: "The hallway may not be used as a lounge area or for hosting the celebration during the event. It serves exclusively as a passageway.",
    },
    {
      id: "hausrecht",
      titleDe: "Hausrecht und Weisungsrecht",
      titleEn: "Domiciliary Rights and Right to Issue Instructions",
      bodyDe: "Das Hausrecht liegt bei KidBike e.V. Anweisungen unserer Mitarbeiter*innen sind zu befolgen. Bei schweren oder trotz Abmahnung wiederholten Verstößen gegen diese Vereinbarung können wir die Veranstaltung vorzeitig beenden; das Nutzungsentgelt wird dann nicht erstattet.\nHiermit bestätige ich, dass ich die vorstehenden Bestimmungen gelesen habe und damit einverstanden bin.\nBerlin,\nDatum Unterschrift Nutzer*in Datum Unterschrift Mitarbeiter*in\nDie drei Verkehrsschulen des Bezirks werden\nvon KidBike e.V. in Kooperation mit dem\nBezirksamt Friedrichshain-Kreuzberg organisiert.\nKidBike e.V. § Bergholzstraße 8 § 12099 Berlin\nLeitung: Boris Kolipost § Tel. 0176 246 111 40\nE-Mail: events@kidbike.de § Web: www.kidbike.de\nVerkehrsschule WeinstraßeWeinstraße 210249 BerlinTel.: 030 – 241 91 68Verkehrsschule WeinstraßeWeinstraße 210249 BerlinTel.: 030 – 241 91 68Usage Agreement\nVerkehrsschule Weinstraße\nWeinstraße 2\n10249 Berlin\nTel.: 030 – 241 91 68\nVerkehrsschule Weinstraße\nWeinstraße 2\n10249 Berlin\nTel.: 030 – 241 91 68\nbetween:\nBergholzstr. 8\n12099 Berlin\nand:\nLast name, first name: «Nachname», «Vorname»\nInstitution: «Einrichtung»\nAddress: «Anschrift»\nPhone number: «Telefon_nummer»\nE-Mail address: «EmailAdresse»\nWelcome!\nThe traffic schools of Friedrichshain-Kreuzberg promote traffic safety, health, and environmental awareness among children and adults through traffic education with environmentally friendly vehicles, the joy of movement, and meaningful leisure activities. They are also places where neighbors come together and celebrate.",
      bodyEn: "KidBike e.V. holds domiciliary rights (Hausrecht) on the premises. Instructions from our staff must be followed. In the event of serious violations of this agreement, or repeated violations despite a warning, we may end the event early; in that case, the usage fee will not be refunded.\nI hereby confirm that I have read the above terms and agree to them.\nBerlin,\nDatum Unterschrift Nutzer*in Datum Unterschrift Mitarbeiter*in\nDie drei Verkehrsschulen des Bezirks werden\nvon KidBike e.V. in Kooperation mit dem\nBezirksamt Friedrichshain-Kreuzberg organisiert.\nKidBike e.V. § Bergholzstraße 8 § 12099 Berlin\nLeitung: Boris Kolipost § Tel. 0176 246 111 40\nE-Mail: events@kidbike.de § Web: www.kidbike.de",
    },
  ],
  WA: [
    {
      id: "nutzungszeit",
      titleDe: "Nutzungszeit und -art",
      titleEn: "Usage time and type",
      bodyDe: "Der Nutzer/die Nutzerin wird die Anlage wie folgt nutzen:\nDatum:\nUhrzeit:\nArt der Veranstaltung:\nAnzahl Personen:\n«Datum»\n«Zeit_von» - «Zeit_bis»\n«Art_der_Veranstaltung_»\n«Anzahl_Personen»",
      bodyEn: "The user will use the facility as follows:\nDate:\nTime:\nEvent type:\nNumber of persons:\n«Datum»\n«Zeit_von» - «Zeit_bis»\n«Art_der_Veranstaltung_»\n«Anzahl_Personen»",
    },
    {
      id: "entgelt",
      titleDe: "Nutzungsentgelt",
      titleEn: "Usage fee",
      bodyDe: "Für unseren Aufwand erheben wir ein Nutzungsentgelt in Höhe von«Nutzung_Üw», das Sie bitte «Zahlung_bis» unter Angabe des unten genannten Verwendungszwecks auf unser Konto überweisen. Die Reservierung ist erst verbindlich, nachdem wir den Betrag erhalten haben.\nKontoinhaber: KidBike e.V.\nBank: Berliner Sparkasse\nIBAN: DE09 1005 0000 0190 8304 17\nBIC: BELADEBEXXX\nVerwendungszweck: «AutoVZweck»",
      bodyEn: "We charge a usage fee of«Nutzung_Üw» for our efforts, which you are kindly requested to transfer to our account «Zahlung_bis_Englisch» with the payment reference stated below. The reservation becomes binding only after we have received the payment.\nAccount holder: KidBike e.V.\nBank: Berliner Sparkasse\nIBAN: DE09 1005 0000 0190 8304 17\nBIC: BELADEBEXXX\nPayment Reference: «AutoVZweck»",
    },
    {
      id: "stornierung",
      titleDe: "Stornierung",
      titleEn: "Cancellation",
      bodyDe: "Einen vereinbarten Nutzungstermin können Sie bis spätestens 14 Tage vorher widerrufen. Sie erhalten dann das Nutzungsentgelt von uns vollständig zurück. Nach dieser Frist behalten wir das Nutzungsentgelt als Entschädigung für entgangene Reservierungen ein.",
      bodyEn: "You may cancel the agreed usage date up to 14 days in advance. In that case, you will receive a full refund of the usage fee. After this deadline, we will retain the fee as compensation for missed reservations.",
    },
    {
      id: "reinigung",
      titleDe: "Reinigung",
      titleEn: "Cleaning",
      bodyDe: "Nach der Nutzung der Verkehrsschule müssen uns die Räume und Anlagen im sauberen und ordentlichen Zustand übergeben werden. Dies gilt auch für die Toiletten. Nehmen Sie Ihren Müll bitte mit nach Hause. Entsorgen Sie ihn nicht in der Verkehrsschule! Erledigen Sie bitte alle Reinigungsarbeiten noch am Nutzungstag, bevor Sie die Einrichtung verlassen. Eine Reinigung zu einem späteren Zeitpunkt muss gesondert vereinbart werden. Sollte keine oder eine nur unzureichende Reinigung stattgefunden haben, behalten wir uns eine angemessene Nachforderung für den uns dadurch entstehenden Mehraufwand vor.",
      bodyEn: "After using the traffic school, the rooms and facilities must be returned to us in a clean and orderly condition. This also applies to the toilets. Please take your trash home and do not dispose of it at the traffic school! Please complete all cleaning tasks on the day of use before leaving the facility. Cleaning at a later time must be agreed upon separately. If no or only insufficient cleaning has taken place, we reserve the right to request reasonable compensation for the additional effort incurred.",
    },
    {
      id: "laerm",
      titleDe: "Lärmvermeidung",
      titleEn: "Noise prevention",
      bodyDe: "Nehmen Sie bitte Rücksicht auf die Nachbarn der Verkehrsschule und geben Sie ihnen keinen Anlass zur Beschwerde wegen Lärmbelästigung. Bitte reduzieren Sie die Lautstärke samstags ab 22:00 Uhr, werktags und sonntags schon ab 20:00 Uhr auf eine angemessene Zimmer-Lautstärke.",
      bodyEn: "Please be considerate of the neighbors of the traffic school and avoid giving them any reason to complain about noise. Reduce the volume to room level from 10:00 p.m. on Saturdays, and from 8:00 p.m. on weekdays and Sundays.",
    },
    {
      id: "rauchverbot",
      titleDe: "Rauchverbot",
      titleEn: "Smoking ban",
      bodyDe: "Bitte haben Sie Verständnis für das Rauchverbot in der gesamten Einrichtung. Rauchen Sie bitte vor dem Zugang zum Gelände und entsorgen Sie Zigaretten in einem Aschenbecher.",
      bodyEn: "Please respect the smoking ban throughout the entire facility. If you must smoke, do so outside of the premises and dispose of cigarettes in an ashtray.",
    },
    {
      id: "haftung",
      titleDe: "Haftung bei Personen- und Sachschäden",
      titleEn: "Liability for Personal Injury and Property Damage",
      bodyDe: "Sofern keine grobe Fahrlässigkeit seitens der Mitarbeiter/innen von KidBike e.V. vorliegt, nutzen Sie die Einrichtung auf eigene Gefahr und stimmen diesem Umstand vor der Nutzung ausdrücklich zu!\nFür eventuell während der Nutzung entstandene Personenschäden oder Sachschäden an mitgebrachtem Eigentum übernehmen wir keine Haftung! Sie sind selbst Veranstalter und sollten eine Veranstaltungshaftpflichtversicherung abschließen, um sich gegenüber Schadensersatzansprüchen Dritter abzusichern.",
      bodyEn: "Unless gross negligence on the part of KidBike e. V. staff is proven, you use the facility at your own risk and expressly agree to this before use! We do not assume liability for any personal injury or damage to personal property during your use. You are considered the event organizer and should take out event liability insurance to protect yourself against third-party claims.",
    },
    {
      id: "schaeden",
      titleDe: "Schäden und Verluste",
      titleEn: "Damages and Loss",
      bodyDe: "Sollten uns durch Ihre Nutzung Schäden an Einrichtung und Gegenständen entstehen oder diese abhandenkommen, so haften Sie für die Reparatur- bzw. Wiederbeschaffungskosten! Außerdem können Sie von einer künftigen Nutzung unserer Einrichtung ausgeschlossen werden.",
      bodyEn: "If any damage to furnishings or objects occurs as a result of your usage, or if items go missing, you are liable for repair or replacement costs. You may also be excluded from future use of our facility.",
    },
    {
      id: "auf_abbau",
      titleDe: "Auf- und Abbau von bereitgestellten Ausstattungen",
      titleEn: "Setup and Takedown of Provided Equipment",
      bodyDe: "Bierzeltgarnituren und Pavillons, die von KidBike e.V. zur Verfügung gestellt werden, sind von den Nutzerinnen und Nutzern selbstständig auf- und abzubauen. Bitte planen Sie hierfür ausreichend Zeit ein und behandeln Sie das Material sorgfältig.",
      bodyEn: "Beer tent sets and pavilions provided by KidBike e. V. must be assembled and disassembled by users themselves. Please plan enough time for this and treat the materials with care.",
    },
    {
      id: "parallelveranstaltungen",
      titleDe: "Parallelveranstaltungen",
      titleEn: "Parallel Events",
      bodyDe: "Ein exklusives Nutzungsrecht für das gesamte Gelände der Verkehrsschule besteht nicht. Es kann vorkommen, dass parallel zu Ihrer Veranstaltung eine weitere Veranstaltung auf einem anderen Teil des Geländes stattfindet, worüber wir Sie im Voraus informieren werden. KidBike e. V. stellt in diesem Fall sicher, dass ausreichend Platz für Ihre Veranstaltung zur Verfügung steht.\nSoweit bei der Buchung nichts Abweichendes vereinbart wurde, steht Ihnen der Innenraum zur Verfügung.",
      bodyEn: "There is no exclusive right of use for the entire premises of the traffic school. It may occur that another event takes place on a different part of the site at the same time as yours; in such cases, we will inform you in advance. KidBike e. V. will ensure that sufficient space is available for your event.\nUnless otherwise agreed upon at the time of booking, the indoor area is available for your use.",
    },
    {
      id: "kinderfreizeitprojekt",
      titleDe: "Nutzung während des Kinderfreizeitprojekts",
      titleEn: "Usage during the „Kinderfreizeitprojekt“",
      bodyDe: "Montags bis freitags findet auf dem Gelände der Verkehrsschule von 14:00 bis 18:00 Uhr unser Kinderfreizeitprojekt statt. Während dieser Zeit steht Ihnen als Mieter der Innenraum vollständig für die alleinige Nutzung zur Verfügung.\nHiermit bestätige ich, dass ich die vorstehenden Bestimmungen gelesen habe und damit einverstanden bin.\nBerlin,\nDatum Unterschrift Nutzer*in\nBerlin,\nDatum Unterschrift Mitarbeiter*in\nDie drei Verkehrsschulen des Bezirks werden\nvon KidBike e.V. in Kooperation mit dem\nBezirksamt Friedrichshain-Kreuzberg organisiert.\nKidBike e.V. Bergholzstraße 8 12099 Berlin\nLeitung: Boris Kolipost Tel. 0176 246 111 40\nE-Mail: events@kidbike.de Web: www.kidbike.de\nVerkehrsschule WassertorplatzWassertorplatz 110999 BerlinTel.: 030 – 505 89 111Verkehrsschule WassertorplatzWassertorplatz 110999 BerlinTel.: 030 – 505 89 111Usage Agreement\nVerkehrsschule Wassertorplatz\nWassertorplatz 1\n10999 Berlin\nTel.: 030 – 505 89 111\nVerkehrsschule Wassertorplatz\nWassertorplatz 1\n10999 Berlin\nTel.: 030 – 505 89 111\nbetween:\nBergholzstr. 8\n12099 Berlin\nand:\nLast name, first name: «Nachname», «Vorname»\nInstitution: «Einrichtung»\nAddress: «Anschrift»\nPhone number: «Telefon_nummer»\nE-Mail address: «EmailAdresse»\nHerzlich willkommen!\nThe traffic schools of Friedrichshain-Kreuzberg promote traffic safety, health, and environmental awareness among children and adults through traffic education with environmentally friendly vehicles, the joy of movement, and meaningful leisure activities. They are also places where neighbors come together and celebrate.",
      bodyEn: "From Monday to Friday, our children's recreation project takes place on the traffic school grounds from 2:00 p.m. to 6:00 p.m. The outdoor area is used jointly during this period, meaning you share the outdoor space with the children's project, but you have full and exclusive access to the indoor area.\nI hereby confirm that I have read the above terms and agree to them.\nBerlin,\nDate Signature of user\nBerlin,\nDate Signature of staff member\nDie drei Verkehrsschulen des Bezirks werden\nvon KidBike e.V. in Kooperation mit dem\nBezirksamt Friedrichshain-Kreuzberg organisiert.\nKidBike e.V. Bergholzstraße 8 12099 Berlin\nLeitung: Boris Kolipost Tel. 0176 246 111 40\nE-Mail: events@kidbike.de Web: www.kidbike.de",
    },
  ],
};

export const NV_EMAIL_TEMPLATES: Record<string, { de: string; en: string }> = {
  WE: {
    de: "Sehr «GeehrteGeehrterGeehrte» «Anrede» «Nachname», \n\nanbei finden Sie die Nutzungsvereinbarung für Ihre Feier am «Datum» in der Verkehrsschule Weinstraße. Bitte lesen Sie diese sorgfältig durch und unterzeichnen Sie sie bei Einverständnis online über folgenden Link:\n«LinkUnterschreiben»\n\nBitte überweisen Sie den Gesamtbetrag in Höhe von«Betrag_Summe_Nutzung_Üw__Kaution» (Nutzungsentgelt: «Nutzung_Üw» zzgl. Kaution: «Kaution») «Zahlung_bis» unter Angabe des unten genannten Verwendungszwecks auf das folgende Bankkonto:\nKontoinhaber\nKidBike e.V.\nBank\nBerliner Sparkasse\nIBAN\nDE09 1005 0000 0190 8304 17\nBIC\nBELADEBEXXX\nVerwendungszweck\n«AutoVZweck»\nBitte beachten Sie Folgendes:\nDie Reservierung wird erst endgültig verbindlich, nachdem wir den Betrag erhalten haben und die (Online-)Unterschrift der Nutzungsvereinbarung vorliegt.\nEs kann vorkommen, dass parallel auf dem Gelände eine zweite Veranstaltung stattfindet. Zudem ist unser Kinderfreizeitprojekt montags bis samstags von 14:00 bis 18:00 Uhr geöffnet.\nBitte nehmen Sie Ihren Müll nach der Veranstaltung wieder mit und entsorgen Sie ihn nicht auf dem Gelände der Verkehrsschule.\nIn dringenden Fällen während Ihrer Nutzungszeit erreichen Sie uns unter 0162 374 28 55. Außerhalb der Nutzungszeiten erreichen Sie uns wie gewohnt per E-Mail oder telefonisch.\nWeitere Details finden Sie in der beigefügten Nutzungsvereinbarung. Wir bitten Sie, das Dokument sorgfältig zu lesen und sich bei Rückfragen gern bei uns zu melden.\n\nIhr Ansprechpartner vor Ort ist unser Platzwart, Herr Ziethen (0162 374 28 55). Bitte kontaktieren Sie ihn nur während oder kurz vor Ihrer Veranstaltung (z. B. Schlüssel, früheres Gehen). Alle anderen Fragen richten Sie bitte an uns.\nWir wünschen Ihnen eine gelungene Veranstaltung!\n\nMit freundlichen Grüßen\nErik Fikkert\nKidBike e.V.\nTräger des Engagementpreises „Fahrrad Berlin“ 2021\nBergholzstr. 8 | 12099 Berlin | 030 98389226\nwww.kidbike.de\n\nVereinsregister: Amtsgericht Charlottenburg: VR33528 B | Steuernr.: 27/670/63026\nVertretungsberechtigte: Boris Kolipost (Vorstand) | Diana Greim (Vorstand) | Annerose Dobrindt (Vorstand)",
    en: "Dear «Vorname» «Nachname», \n\nPlease find attached the usage agreement for your event on «Datum» at the Verkehrsschule Weinstraße. Please read it carefully and, if you agree, sign it online via the following link:\n«LinkUnterschreiben»\nPlease transfer the total amount of«Betrag_Summe_Nutzung_Üw__Kaution» (usage fee:«Nutzung_Üw» plus security deposit:«Kaution») «Zahlung_bis_Englisch» with the payment reference below:\nAccount holder\nKidBike e.V.\nBank\nBerliner Sparkasse\nIBAN\nDE09 1005 0000 0190 8304 17\nBIC\nBELADEBEXXX\nPayment reference\n«AutoVZweck»\nPlease note the following:\nThe reservation only becomes binding once we have received the payment and the (online) signature of the usage agreement.\nThere may be another event taking place on the premises at the same time. In addition, our children's recreation project is open from Monday to Saturday between 2:00 p.m. and 6:00 p.m.\nPlease take your trash home with you after the event and do not dispose of it on the premises.\nFor urgent matters during your booking, you can reach us on 0162 374 28 55. Outside your booking time, you can reach us as usual by email or phone.\nYou will find further details in the attached usage agreement. Please read the document carefully and contact us if you have any questions.\n\nYour on-site contact is our caretaker, Mr. Ziethen (0162 374 28 55). Please contact him only if necessary, during or shortly before your event (e.g. keys, leaving early). For other questions, please contact us.\n\nWe wish you a great event!\n\nKind Regards,\nErik Fikkert\nKidBike e.V.\nTräger des Engagementpreises „Fahrrad Berlin“ 2021\nBergholzstr. 8 | 12099 Berlin | 030 98389226\nwww.kidbike.de\n\nVereinsregister: Amtsgericht Charlottenburg: VR33528 B | Steuernr.: 27/670/63026\nVertretungsberechtigte: Boris Kolipost (Vorstand) | Diana Greim (Vorstand) | Annerose Dobrindt (Vorstand)",
  },
  WA: {
    de: "Sehr «GeehrteGeehrterGeehrte» «Anrede» «Nachname», \n\nanbei finden Sie die Nutzungsvereinbarung für Ihre Feier am «Datum» in der Verkehrsschule Wassertorplatz. Bitte lesen Sie diese sorgfältig durch. Sie erhalten sie zur Unterschrift, wenn Sie zu uns in die Verkehrsschule kommen.\n\nBitte überweisen Sie das Nutzungsentgelt in Höhe von«Nutzung_Üw» «Zahlung_bis»unter Angabe des unten genannten Verwendungszwecks auf das folgende Bankkonto:\nKontoinhaber\nKidBike e.V.\nBank\nBerliner Sparkasse\nIBAN\nDE09 1005 0000 0190 8304 17\nBIC\nBELADEBEXXX\nVerwendungszweck\n«AutoVZweck»\nBitte beachten Sie Folgendes:\nDie Reservierung wird erst endgültig verbindlich, nachdem wir den Betrag erhalten haben.\nEs kann vorkommen, dass parallel auf dem Gelände eine zweite Veranstaltung stattfindet. Zudem ist unser Kinderfreizeitprojekt montags bis samstags von 14:00 bis 18:00 Uhr geöffnet.\nBitte nehmen Sie Ihren Müll nach der Veranstaltung wieder mit und entsorgen Sie ihn nicht auf dem Gelände der Verkehrsschule.\nWeitere Details finden Sie in der beigefügten Nutzungsvereinbarung. Wir bitten Sie, das Dokument sorgfältig zu lesen und sich bei Rückfragen gern bei uns zu melden.\nWir wünschen Ihnen eine gelungene Veranstaltung!\n\nMit freundlichen Grüßen\nKidBike e.V.\nTräger des Engagementpreises „Fahrrad Berlin“ 2021\nBergholzstr. 8 | 12099 Berlin | 030 98389226\nwww.kidbike.de\n\nVereinsregister: Amtsgericht Charlottenburg: VR33528 B | Steuernr.: 27/670/63026\nVertretungsberechtigte: Boris Kolipost (Vorstand) | Diana Greim (Vorstand) | Annerose Dobrindt (Vorstand)",
    en: "Dear «Vorname» «Nachname», \n\nPlease find attached the usage agreement for your event on «Datum» at the Verkehrsschule Wassertorplatz. Please read it carefully. You will be given the document to sign when you come to the traffic school.\nPlease transfer the usage fee of«Nutzung_Üw» by «Zahlung_bis» to the following bank account with the payment reference stated below:\nAccount holder\nKidBike e.V.\nBank\nBerliner Sparkasse\nIBAN\nDE09 1005 0000 0190 8304 17\nBIC\nBELADEBEXXX\nPayment reference\n«AutoVZweck»\nPlease note the following:\nThe reservation only becomes binding once we have received the payment and the (online) signature of the usage agreement.\nThere may be another event taking place on the premises at the same time. In addition, our children's recreation project is open from Monday to Saturday between 2:00 p.m. and 6:00 p.m.\nPlease take your trash home with you after the event and do not dispose of it on the premises.\nYou will find further details in the attached usage agreement. Please read the document carefully and contact us if you have any questions.\n\nWe wish you a great event!\n\nKind Regards,\nKidBike e.V.\nTräger des Engagementpreises „Fahrrad Berlin“ 2021\nBergholzstr. 8 | 12099 Berlin | 030 98389226\nwww.kidbike.de\n\nVereinsregister: Amtsgericht Charlottenburg: VR33528 B | Steuernr.: 27/670/63026\nVertretungsberechtigte: Boris Kolipost (Vorstand) | Diana Greim (Vorstand) | Annerose Dobrindt (Vorstand)",
  },
};
