# Canonical business rules

This is the **single source of truth** for the booking system's rules. Every
constant here was extracted verbatim from the current live front-end
(`reference/legacy-kidbike-json/index.html`) and the Apps Script backend, with
the source line noted. When code and this document disagree, this document is
wrong — fix it. When behaviour must change, change it here first, then in code.

Legend for confidence:
- ✅ **Confirmed** — matches live production code (line reference given).
- ⚠️ **Verify** — present in code but flagged as possibly stale / unconfirmed by
  the owner. Do not treat as final; see `docs/05-open-questions.md`.

---

## 1. Locations

Source: `index.html:947-951`, `955`, and Apps Script hold config.

| Code | Name | Address | Coords | Online? | Closing hour | Hold (business days) |
|---|---|---|---|---|---|---|
| `WE` | Verkehrsschule Weinstraße | Weinstraße 2, 10249 Berlin | 52.5255, 13.4411 | online | **22:00** | 3 |
| `WA` | Verkehrsschule am Wassertorplatz | Wassertorplatz 1, 10999 Berlin | 52.4983, 13.4079 | online | none | 2 |
| `WI` | Verkehrsschule Wiener Straße | Wiener Str. 59c, 10999 Berlin | 52.4967, 13.4363 | **phone only** | none | 3 |

- Only **WE** has a closing hour (`CLOSING_SCHOOLS = { WE: 22 }`, `index.html:955`). ✅
- **WI** has a full price table in code but is not online-bookable — the UI shows
  "Telefonisch buchbar" and opens an info modal. ⚠️ (see open question 9)
- `FORCE_OFFLINE = {}` (`index.html:952`) is a manual per-location kill switch. ✅

---

## 2. Time & scheduling rules

Source: `index.html:1558-1584`, `1659-1738`.

| Rule | Value | Source | Conf |
|---|---|---|---|
| Minimum lead time | booking start must be **≥ today + 7 days** | `minStartDate()` `1558` | ✅ |
| Minimum duration | **30 minutes** | `validateTimes` `1667` | ✅ |
| Default "tap" duration (mobile +) | **120 minutes** | `DEFAULT_TAP_MINUTES` `1290` | ✅ |
| Fallback end when missing | +120 minutes | `FALLBACK_MINUTES` / `normalizeEvents` | ✅ |
| Grid start (all locations) | 12:00 | `slotMinTime` `2106` | ✅ (UI only) |
| Grid max end hour | 28 (04:00 next day) | `GRID_MAX_END_HOUR` `959` | ✅ (UI only) |

### 2.1 Closing rule (WE only) — `violatesClosing` `index.html:1562`

A time range **violates** the closing rule (hard block) when the location has a
closing hour (WE = 22:00) and **any** of:
1. start and end are on different calendar days (crosses midnight), **or**
2. start time ≥ 22:00, **or**
3. end time > 22:00, **or**
4. start time < 06:00 (the pre-06:00 night hours count as closed).

✅ Confirmed. For locations without a closing hour (WA, WI) this rule never fires.

### 2.2 Overlap — `getOverlapState` `index.html:1645`

A requested range conflicts if it overlaps (`aStart < bEnd && aEnd > bStart`)
with any **busy** event (excluding `isFrei` markers) **or** any active **hold**.
⚠️ **In the current system this check runs only in the browser** — two people can
request the same slot simultaneously and both get a hold. The rebuild moves this
to a database exclusion constraint (see `docs/02-data-model.md` §bookings and
`supabase/migrations/0004_constraints.sql`). `has_overlap` in the payload is
always hard-coded to `false` today.

---

## 3. Pricing

Source: `index.html:1000-1097` (`PRICING`), `984-998` (surcharge),
`2191-2435` (`updatePricePreview`). The rebuilt engine
(`packages/pricing`) reproduces this exactly and is pinned by tests.

### 3.1 General formula (WE, WI — tier × multiplier model)

```
tier      = first duration tier where totalMinutes <= tier.maxMin
multiplier = first person tier where persons <= personTier.max
base      = tier.base
total     = base * multiplier  +  timeSurcharge  +  extrasCost
```

If no tier matches (duration too long) **or** no person tier matches
(persons > 100) → **"Preis nach Vereinbarung"** (price on request); only a
Kaution figure is shown.

**Duration tiers (WE and WI, identical)** — `index.html:1002-1009`, `1060-1067`:

| Up to (min) | Hours label | Base € |
|---|---|---|
| 240 | 4 | 100 |
| 360 | 6 | 130 |
| 480 | 8 | 160 |
| 600 | 10 | 190 |
| 720 | 12 | 220 |
| 960 | 16 | 280 |
| 1440 | 24 | 360 |

**Person tiers (WE and WI, identical)** — `index.html:1011-1017`, `1069-1074`:

| Up to persons | Multiplier |
|---|---|
| 30 | 1.00 |
| 40 | 1.25 |
| 50 | 1.50 |
| 75 | 1.75 |
| 100 | 2.00 |
| > 100 | *price on request* |

> ⚠️ The Excel `Preistabelle` goes further than the online form: it has person
> factors up to **500** persons and **three tariff columns** (Normal, Ermäßigung
> Kita/Schule, Ermäßigung Berechtigungsnachweis = 70% of Normal). The online form
> currently offers **only the Normal tariff and stops at 100 persons**. The
> reduced tariffs remain manual for now but the data model and engine support
> them so they *can* be switched on online later (owner: "mooi om de optie te
> hebben"). See open question 5.

### 3.2 Time surcharge — `defaultSurcharge30` `index.html:984`

Online (WE, WI): a **single** flat **35 €** surcharge applies when **either**:
- start time or end time falls outside **09:00–17:30**, **or**
- the period touches a **weekend** day (Saturday or Sunday).

Otherwise 0 €. WA has **no** surcharge (`surcharge: () => 0`, `index.html:1089`). ✅

> ⚠️ The Excel `Preistabelle` instead has **three separate 35 €** surcharges that
> can stack to 105 € (weekend; open/close before 09:00; open/close Mon–Fri from
> 18:00). The online form and Excel therefore disagree. This is a known drift —
> see open question 5. The engine implements the **online** behaviour as the
> default and exposes surcharge rules as config so the Excel behaviour can be
> selected per tariff if desired.

### 3.3 Extras — `index.html:1019-1023`

| Location | Extra | Price € | Reduced € |
|---|---|---|---|
| WE | Fahrradparcours (`parcours`) | 10 | 7.50 |
| WE | Grill (`grill`) | 10 | 7.50 |
| WE | Tischtennisplatte (`tisch`) | 10 | 7.50 |
| WE | Kinderfahrrad (per bike) | **1** | 0 |
| WA, WI | — (none) | | |

Bikes (WE only): counted across six size buckets — `Lauf`, `12"`, `16"`, `20"`,
`24"`, `26"` — at **1 € per bike** (`extrasCost += totalBikes * 1`,
`index.html:2379`). ⚠️ The Apps Script email template still labels bikes
"(kostenlos)"; the front-end charges 1 €. The front-end (1 €) is authoritative —
see open question 6. The reduced-tariff bike price is 0 € (Excel).

### 3.4 WA — person-band model — `index.html:1079-1096`, `2232-2345`

WA does **not** use the multiplier model. Instead:

**Duration tiers (WA)**:

| Up to (min) | Hours label | Base € |
|---|---|---|
| 720 | 12 | 140 |
| 960 | 16 | 200 |

**Person bands (add a flat amount depending on the matched duration tier)**:

| Up to persons | + at 12h tier | + at 16h tier |
|---|---|---|
| 45 | 0 | 0 |
| ≥ 46 (max) | 80 | 110 |

```
total = tier.base + band.addByTier[tier.hoursLabel]
```

No time surcharge, no extras. If duration > 16h (960 min) → price on request. ✅

### 3.5 Kaution (deposit)

**WE** — `cautionFn(persons, start, end)` `index.html:1030-1057`. Returns, in
order:
1. `500 €` if the period runs past 22:00 (crosses midnight, or start/end after
   22:00). ⚠️ Since the 22:00 closing block, this branch is unreachable for new
   bookings — see open question 7.
2. `500 €` if persons > 50 **and** not fully inside the 09:00–17:30 Mon–Sat window.
3. `200 €` if persons > 50 (inside the window).
4. `null` (no deposit) if persons ≤ 50 **and** fully inside 09:00–17:30 Mon–Sat.
5. `200 €` otherwise.

"Inside the window" = same day, start and end both within 09:00–17:30, and does
not touch a Sunday.

**WA** — `cautionFn(persons)` `index.html:1091-1095`: `50 €` if persons ≤ 45,
else `70 €`. ✅

**WI**: no `cautionFn` defined. ✅

> ⚠️ All WE caution logic is flagged **Verify** by the owner (open question 7),
> including whether the now-unreachable 500 € "runs past 22:00" branch should be
> removed.

### 3.6 Currency / formatting

All amounts EUR, formatted `de-DE` (`euro()`, `index.html:2039`).

---

## 4. Holds & the request lifecycle

Source: Apps Script (`Code.gs`) as summarised in the prior analysis.

- A public request creates a **hold** with `expiresAt = start-of-request +
  N business days`, where N = 3 (WE), 3 (WI), 2 (WA).
- An hourly cron expires open holds past their `expiresAt` → status `expired`.
- An admin "deny" link (HMAC-signed) sets a hold to `rejected`. **No message is
  sent to the requester** on rejection today. ⚠️ (open question 13)
- The public holds API returns only `start`, `end`, `expires` — **no personal
  data**. ✅ (good; preserve this.)
- Notification email goes to `events@kidbike.de`, `replyTo` = requester, with CC
  routing:

| Location | CC recipients |
|---|---|
| WA | `vs-wa@kidbike.de`, `e.bari@kidbike.de` |
| WI | `vs-wi@kidbike.de` |
| WE | (none) |

- **Fields not persisted today**: `appendHold_` ignores the full payload JSON,
  phone, and language — the complete request exists only in the email, not in
  the sheet. The rebuild persists the whole request. ⚠️

The rebuilt lifecycle (holds become bookings with `status='requested'`) is
specified in `docs/04-state-machine.md`.

---

## 5. Contact / validation rules (public form)

Source: `validateTimes` `index.html:1659-1738`.

Required to submit: location, persons, valid start & end, phone national part
with **≥ 6 digits**, complete address (street, house, zip, city), valid email,
bike choice made (WE only, and if "yes" at least one bike), and the terms
checkbox accepted on step 2. ✅

Address is assembled as `Straße Nr, PLZ Ort` (`formatAddress` `1619`). ✅

---

## 6. Projects (Frauenprojekt / Frauengefängnis)

These are **two different things** (owner-confirmed), and more may follow:

- **Frauenprojekt** — women learn to repair bikes and to cycle. Linked to
  `kidbike.de/Frauen`. In the WA JSON contract as `frauenprojekt`.
- **Frauengefängnis Barnimstraße** — a separate project. In the WE JSON contract
  as `fg` (+ `titelFg`, `beschrFg`, `linkFg`), rendered by
  `kalender-barnimstrasse.html`.

⚠️ Naming is currently inconsistent across five spellings (`Frauengefängnis`,
`Frauenprojekt`, `fg`, `frauenprojekt`, `kalender-barnimstrasse.html`). The
rebuild models these as a first-class `projects` table so each is named once and
new ones can be added without code changes. A **data-contract bug** exists today:
the WE Power Automate flow writes `fg`/`titelFg`/… but `normalizeEvents` in
`index.html` reads `frauenprojekt`, so WE project events get no marking on the
main calendar — see open question / handoff Phase 0.

---

## 7. Payment reference (Verwendungszweck)

Source: Excel column `AY AutoVZweck`. Format: `FWE` + last 3 digits of the date
series number + 2 letters of surname + 2 letters of first name
(e.g. `FWE211DOLU`). The rebuild generates this deterministically per booking so
SevDesk matching can be automated. ⚠️ Exact algorithm to be reproduced from the
Excel formula (handoff task). The `F` prefix + location code pattern should be
generalised per location.
