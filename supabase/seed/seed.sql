-- seed.sql
-- Locations, projects and the STANDARD tariff for each location, seeded with the
-- exact values from the live front-end (reference/legacy-kidbike-json/index.html).
-- The tariff `config` JSON matches packages/pricing/src/config.ts one-to-one — a
-- test in that package asserts they agree.
--
-- Reduced tariffs (kita_schule, nachweis) are intentionally NOT seeded yet: they
-- stay manual for now (open question 5) but can be added here later without code
-- changes. WE reduced pricing = Berechtigungsnachweis 70% of Normal, extras 7.50,
-- bikes 0 — see the Excel Preistabelle when digitising.

-- Locations ------------------------------------------------------------------
insert into locations (code, name, short_name, address, lat, lng, phone,
                       online_bookability, closing_hour, hold_business_days,
                       min_lead_days, cc_emails, sort_order)
values
  ('WE', 'Verkehrsschule Weinstraße',        'Weinstraße',     'Weinstraße 2, 10249 Berlin',      52.5255, 13.4411, null,
   'online',     22,   3, 7, '{}',                                          1),
  ('WA', 'Verkehrsschule am Wassertorplatz', 'Wassertorplatz', 'Wassertorplatz 1, 10999 Berlin',  52.4983, 13.4079, null,
   'online',     null, 2, 7, '{vs-wa@kidbike.de,e.bari@kidbike.de}',        2),
  ('WI', 'Verkehrsschule Wiener Straße',     'Wiener Straße',  'Wiener Str. 59c, 10999 Berlin',   52.4967, 13.4363, null,
   'phone_only', null, 3, 7, '{vs-wi@kidbike.de}',                          3)
on conflict (code) do nothing;

-- Projects -------------------------------------------------------------------
insert into projects (code, name, public_link)
values
  ('frauenprojekt',              'Frauenprojekt',                'https://kidbike.de/Frauen'),
  ('frauengefaengnis_barnimstrasse', 'Frauengefängnis Barnimstraße', null)
on conflict (code) do nothing;

-- WE standard tariff ---------------------------------------------------------
insert into tariffs (location_id, tariff_type, config)
select id, 'standard', '{
  "model": "multiplier",
  "durationTiers": [
    { "maxMin": 240,  "hoursLabel": 4,  "base": 100 },
    { "maxMin": 360,  "hoursLabel": 6,  "base": 130 },
    { "maxMin": 480,  "hoursLabel": 8,  "base": 160 },
    { "maxMin": 600,  "hoursLabel": 10, "base": 190 },
    { "maxMin": 720,  "hoursLabel": 12, "base": 220 },
    { "maxMin": 960,  "hoursLabel": 16, "base": 280 },
    { "maxMin": 1440, "hoursLabel": 24, "base": 360 }
  ],
  "personTiers": [
    { "max": 30,  "mult": 1.00 },
    { "max": 40,  "mult": 1.25 },
    { "max": 50,  "mult": 1.50 },
    { "max": 75,  "mult": 1.75 },
    { "max": 100, "mult": 2.00 }
  ],
  "surcharge": { "type": "window_or_weekend", "amount": 35, "windowStart": "09:00", "windowEnd": "17:30" },
  "extras": [
    { "id": "parcours", "price": 10, "labelDe": "Fahrradparcours",   "labelEn": "Bike course" },
    { "id": "grill",    "price": 10, "labelDe": "Grill",             "labelEn": "Grill" },
    { "id": "tisch",    "price": 10, "labelDe": "Tischtennisplatte", "labelEn": "Table tennis" }
  ],
  "bikePricePerUnit": 1,
  "caution": { "type": "we" }
}'::jsonb
from locations where code = 'WE'
on conflict (location_id, tariff_type, valid_from) do nothing;

-- WI standard tariff (same tiers as WE; no extras, no bikes, no caution) ------
insert into tariffs (location_id, tariff_type, config)
select id, 'standard', '{
  "model": "multiplier",
  "durationTiers": [
    { "maxMin": 240,  "hoursLabel": 4,  "base": 100 },
    { "maxMin": 360,  "hoursLabel": 6,  "base": 130 },
    { "maxMin": 480,  "hoursLabel": 8,  "base": 160 },
    { "maxMin": 600,  "hoursLabel": 10, "base": 190 },
    { "maxMin": 720,  "hoursLabel": 12, "base": 220 },
    { "maxMin": 960,  "hoursLabel": 16, "base": 280 },
    { "maxMin": 1440, "hoursLabel": 24, "base": 360 }
  ],
  "personTiers": [
    { "max": 30,  "mult": 1.00 },
    { "max": 40,  "mult": 1.25 },
    { "max": 50,  "mult": 1.50 },
    { "max": 75,  "mult": 1.75 },
    { "max": 100, "mult": 2.00 }
  ],
  "surcharge": { "type": "window_or_weekend", "amount": 35, "windowStart": "09:00", "windowEnd": "17:30" },
  "extras": [],
  "caution": { "type": "none" }
}'::jsonb
from locations where code = 'WI'
on conflict (location_id, tariff_type, valid_from) do nothing;

-- WA standard tariff (person-band model, no surcharge, no extras) -------------
insert into tariffs (location_id, tariff_type, config)
select id, 'standard', '{
  "model": "person_band",
  "durationTiers": [
    { "maxMin": 720, "hoursLabel": 12, "base": 140 },
    { "maxMin": 960, "hoursLabel": 16, "base": 200 }
  ],
  "personBands": [
    { "max": 45,   "addByTier": { "12": 0,  "16": 0   } },
    { "max": 9999, "addByTier": { "12": 80, "16": 110 } }
  ],
  "surcharge": { "type": "none" },
  "extras": [],
  "caution": { "type": "wa" }
}'::jsonb
from locations where code = 'WA'
on conflict (location_id, tariff_type, valid_from) do nothing;
