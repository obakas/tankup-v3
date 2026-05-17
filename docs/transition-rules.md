# TankUp V3 — Transition Rules

## Purpose

This document defines the allowed and forbidden state transitions across TankUp V3.

Statuses are not decorations. They are operational law.

A transition rule answers:

- What state can an entity move from?
- What state can it move to?
- Who or what is allowed to trigger it?
- What evidence is required?
- What audit log must be created?
- What financial consequence follows?
- What happens if the transition fails?

The goal is to prevent operational spaghetti.

---

## Core Principle

No important operational entity should change state silently.

Every transition must be:

- intentional,
- traceable,
- permission-controlled,
- timestamped,
- auditable,
- recoverable.

---

# 1. Delivery Request Transitions

## DeliveryRequestStatus

```txt
draft
pending_payment
paid
awaiting_dispatch
offer_sent
assigned
loading
en_route
arrived
measuring
otp_pending
completed
failed
cancelled
disputed
refunded
```

---

## Normal Flow

```txt
draft
→ pending_payment
→ paid
→ awaiting_dispatch
→ offer_sent
→ assigned
→ loading
→ en_route
→ arrived
→ measuring
→ otp_pending
→ completed
```

---

## Rules

### draft → pending_payment

Triggered by:

- customer submitting delivery request.

Requirements:

- customer profile exists,
- delivery site exists,
- requested volume is valid,
- pricing estimate generated.

Audit:

- `DELIVERY_REQUEST_CREATED`

---

### pending_payment → paid

Triggered by:

- payment provider confirmation.

Requirements:

- valid payment reference,
- payment amount matches expected amount,
- payment not previously used.

Audit:

- `PAYMENT_CONFIRMED`

---

### paid → awaiting_dispatch

Triggered by:

- system.

Requirements:

- payment confirmed,
- request not cancelled,
- site risk evaluated.

Audit:

- `REQUEST_READY_FOR_DISPATCH`

---

### awaiting_dispatch → offer_sent

Triggered by:

- dispatch engine or admin.

Requirements:

- eligible tanker found,
- driver/fleet available,
- no active offer already exists for request.

Audit:

- `DELIVERY_OFFER_SENT`

---

### offer_sent → assigned

Triggered by:

- driver accepts offer.

Requirements:

- offer not expired,
- driver eligible,
- tanker available,
- fleet active.

Audit:

- `DELIVERY_OFFER_ACCEPTED`

---

### assigned → loading

Triggered by:

- driver or fleet head.

Requirements:

- tanker assigned,
- driver confirmed readiness,
- loading source identified.

Audit:

- `LOADING_STARTED`

---

### loading → en_route

Triggered by:

- driver.

Requirements:

- driver confirms loading completed,
- tanker volume recorded where applicable.

Audit:

- `TANKER_EN_ROUTE`

---

### en_route → arrived

Triggered by:

- driver.

Requirements:

- driver near customer site or manually confirms arrival,
- GPS recommended but not mandatory for MVP.

Audit:

- `DRIVER_ARRIVED`

---

### arrived → measuring

Triggered by:

- driver.

Requirements:

- customer site accessible,
- delivery can begin,
- no blocking incident.

Audit:

- `MEASUREMENT_STARTED`

---

### measuring → otp_pending

Triggered by:

- driver.

Requirements:

- delivery measurement completed,
- delivered quantity recorded,
- photo/evidence optional for MVP, recommended later.

Audit:

- `MEASUREMENT_COMPLETED`

---

### otp_pending → completed

Triggered by:

- customer OTP confirmation.

Requirements:

- valid OTP,
- OTP not expired,
- delivery record exists,
- measurement completed.

Audit:

- `DELIVERY_COMPLETED`

Financial effect:

- payment becomes payout-eligible.

---

# 2. Exceptional Delivery Transitions

## offer_sent → awaiting_dispatch

Reason:

- offer expired,
- driver rejected,
- driver unavailable.

Triggered by:

- system.

Audit:

- `OFFER_EXPIRED_OR_REJECTED`

Effect:

- retry dispatch.

---

## loading → failed

Possible reasons:

- tanker breakdown,
- no water available,
- driver unavailable,
- fleet cancels.

Triggered by:

- driver,
- fleet head,
- admin,
- system timeout.

Audit:

- `DELIVERY_FAILED_DURING_LOADING`

Effect:

- reassign or refund decision required.

---

## en_route → failed

Possible reasons:

- tanker breakdown,
- accident,
- security issue,
- route inaccessible.

Audit:

- `DELIVERY_FAILED_IN_TRANSIT`

Effect:

- admin review required.

---

## arrived → disputed

Possible reasons:

- customer denies request,
- site inaccessible,
- tank height different from declared,
- customer aggressive,
- payment conflict,
- driver reports unsafe condition.

Audit:

- `DELIVERY_DISPUTED_AT_SITE`

Effect:

- payment may be held.

---

## measuring → disputed

Possible reasons:

- customer disputes quantity,
- pump issue,
- partial delivery,
- tanker volume disagreement.

Audit:

- `DELIVERY_DISPUTED_DURING_MEASUREMENT`

Effect:

- payout held until review.

---

## otp_pending → disputed

Possible reasons:

- customer refuses OTP,
- customer claims incomplete delivery,
- driver claims delivery completed,
- OTP unavailable due to network issue.

Audit:

- `OTP_CONFIRMATION_DISPUTED`

Effect:

- admin review required.

---

# 3. Forbidden Transitions

The system must reject these:

```txt
draft → completed
pending_payment → assigned
paid → completed
awaiting_dispatch → completed
offer_sent → loading
assigned → completed
loading → completed
en_route → completed
arrived → completed
measuring → completed
```

Reason:

TankUp must not skip operational proof.

---

# 4. Payment Transitions

## PaymentStatus

```txt
pending
paid
held
failed
refunded
forfeited
```

---

## Normal Flow

```txt
pending → paid → held → payout_eligible
```

For MVP, `held` may be logical rather than a separate wallet balance.

---

## Rules

### pending → paid

Triggered by:

- payment provider confirmation.

Audit:

- `PAYMENT_CONFIRMED`

---

### paid → held

Triggered by:

- system after delivery assignment starts.

Reason:

- funds should not be treated as fully earned before delivery.

Audit:

- `PAYMENT_HELD_FOR_DELIVERY`

---

### held → payout_eligible

Triggered by:

- delivery completed successfully.

Audit:

- `PAYMENT_MARKED_PAYOUT_ELIGIBLE`

---

### held → refunded

Triggered by:

- admin,
- automated refund rule.

Reasons:

- no tanker found,
- delivery failed,
- valid customer dispute.

Audit:

- `PAYMENT_REFUNDED`

---

# 5. Delivery Offer Transitions

## DeliveryOfferStatus

```txt
pending
accepted
rejected
expired
cancelled
```

---

## Normal Flow

```txt
pending → accepted
```

Alternative flows:

```txt
pending → rejected
pending → expired
pending → cancelled
```

---

## Rules

A driver can only accept an offer if:

- offer is still pending,
- offer has not expired,
- driver is available,
- tanker is not already assigned,
- fleet is active.

A driver cannot accept multiple active offers at once.

---

# 6. Driver Transitions

## DriverStatus

```txt
offline
available
offered
assigned
loading
delivering
arrived
blocked
suspended
```

---

## Normal Flow

```txt
offline
→ available
→ offered
→ assigned
→ loading
→ delivering
→ arrived
→ available
```

---

## Important Rules

A driver cannot be:

- available and assigned at the same time,
- assigned to two active deliveries,
- offered multiple jobs simultaneously unless explicitly supported later.

Repeated rejected or expired offers should reduce reliability score.

---

# 7. Tanker Transitions

## TankerStatus

```txt
inactive
available
offered
assigned
loading
delivering
arrived
maintenance
suspended
```

---

## Rules

A tanker cannot move to:

```txt
available → completed
loading → available
delivering → available
```

without a delivery closure event.

---

# 8. Dispute Transitions

## DisputeStatus

```txt
open
under_review
awaiting_evidence
resolved
rejected
escalated
closed
```

---

## Normal Flow

```txt
open
→ under_review
→ awaiting_evidence
→ resolved
→ closed
```

---

## Rules

Disputes must link to:

- delivery request,
- delivery record,
- payment,
- customer,
- driver,
- tanker/fleet where applicable.

No dispute should be deleted.

Only closed with audit trail.

---

# 9. Admin Override Rules

Admins may override state only when:

- operational evidence exists,
- reason is required,
- audit log is created,
- affected actors are notified.

Admin override must never be silent.

Required fields:

```txt
entity_type
entity_id
old_status
new_status
reason
admin_id
timestamp
evidence_reference
```

---

# 10. MVP Enforcement Priority

For MVP, strictly enforce:

1. Payment before dispatch.
2. Offer acceptance before loading.
3. Arrival before measurement.
4. Measurement before OTP.
5. OTP before completion.
6. No payout before completion.
7. All admin overrides must be audited.

Everything else can mature gradually.
