# Booking state machine

A hold and a booking are the same row; the `status` field drives the lifecycle.
The machine is encoded in `packages/domain/src/booking-state.ts` (transition
table + guard) so both the app and any automation validate transitions the same
way.

## States

| Status | Meaning |
|---|---|
| `requested` | Public/internal request created; a hold with `hold_expires_at`. |
| `approved` | A location manager accepted it. |
| `agreement_sent` | Nutzungsvereinbarung PDF sent for signing. |
| `signed` | Customer signed (mouse/touch, + optional ID upload). |
| `paid` | Payment matched from SevDesk. |
| `confirmed` | Fully booked; caretaker tasks created. |
| `completed` | Event has taken place. |
| `rejected` | Declined by an admin. |
| `expired` | Hold lapsed past `hold_expires_at` (auto). |
| `cancelled` | Cancelled after approval. |
| `postponed` | Moved; original slot freed. |

## Transitions and side-effects

```
requested ─approve──▶ approved ─send_agreement──▶ agreement_sent ─sign──▶ signed
   │                     │                                                  │
   ├─reject──▶ rejected  ├─reject──▶ rejected                     mark_paid │
   └─expire──▶ expired   └─cancel──▶ cancelled                              ▼
                                                                          paid ─confirm──▶ confirmed
                                                                                             │
                                                          cancel/postpone ◀──────────────────┤
                                                                                    complete │
                                                                                             ▼
                                                                                        completed ─return_deposit──▶ (task)
```

| Transition | Guard | Side effect |
|---|---|---|
| → `requested` | valid times, no overlap, lead ≥ 7d | notify location (CC rules), confirm to customer, set `hold_expires_at` |
| `requested`→`approved` | manager of location | generate Nutzungsvereinbarung draft |
| `approved`→`agreement_sent` | document exists | email signing link to customer |
| `agreement_sent`→`signed` | signature captured | store signed PDF + signer name/IP; if ID required, require upload |
| `signed`→`paid` | payment matched | mark payment matched |
| `paid`→`confirmed` | — | create caretaker `open_venue`/`close_venue` tasks; confirmation email |
| `confirmed`→`completed` | end time passed | create `return_deposit` task (14-day deadline) if deposit held |
| any active→`rejected` | admin | notify customer (⚠️ not done today — see OQ 13) |
| `requested`→`expired` | cron, past `hold_expires_at` | free the slot |
| `approved`/later→`cancelled` | manager/admin | free the slot, notify |
| `approved`/later→`postponed` | manager/admin | free the slot; usually a new booking is created |

The current 7-day, business-day-hold, and 22:00 rules all live in the guards and
apply to internal edits too, not just the public browser — a key correctness
gain over today.

## Cron jobs

- **expire holds** — hourly: `requested` with `hold_expires_at < now()` → `expired`
  (+ `booking_events` row). Replaces `cronExpireHolds` in Apps Script.
- **payment poll** — periodic SevDesk fetch → `payments` rows → auto-match on
  Verwendungszweck + amount → advance `signed`→`paid`. (Phase 4.)
