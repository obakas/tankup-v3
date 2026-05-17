# TankUp V3 Statuses

## Delivery Request Status

- draft
- pending_payment
- paid
- risk_review
- awaiting_assignment
- offered
- assigned
- loading
- en_route
- arrived
- measuring
- awaiting_otp
- delivered
- failed
- disputed
- refunded
- cancelled

## Allowed Flow

draft
→ pending_payment
→ paid
→ risk_review
→ awaiting_assignment
→ offered
→ assigned
→ loading
→ en_route
→ arrived
→ measuring
→ awaiting_otp
→ delivered

## Failure / Exception Flow

Any operational stage may move to:
- failed
- disputed
- cancelled

Only admin/system may move to:
- refunded

---

## Payment Status

- unpaid
- pending
- paid
- failed
- refunded
- partially_refunded
- expired

---

## Driver Status

- pending_onboarding
- active
- available
- offered
- accepted
- loading
- delivering
- arrived
- offline
- suspended

---

## Tanker Status

- pending_verification
- available
- offered
- assigned
- loading
- delivering
- arrived
- maintenance
- offline
- suspended

---

## Fleet Status

- pending_approval
- active
- restricted
- suspended

---

## Customer Site Status

- unverified
- self_reported
- driver_observed
- verified
- high_risk
- blocked

## Important Note

For MVP, most sites begin as `self_reported`.

After first delivery, the site can become `driver_observed`.

Only future compliance/admin review can make a site `verified`.

---

## Delivery Offer Status

- pending
- accepted
- rejected
- expired
- cancelled

---

## Incident Status

- open
- under_review
- resolved
- escalated
- dismissed

---

## Dispute Status

- opened
- investigating
- awaiting_evidence
- resolved_customer_favor
- resolved_driver_favor
- refunded
- dismissed

---

## Payout Status

- pending
- approved
- paid
- failed
- held
- disputed

---

## Compliance Status Future

- not_required
- pending
- approved
- rejected
- expired