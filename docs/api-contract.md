# API Contract

## Purpose

The API Contract defines:

# how TankUp systems communicate.

This document creates consistency between:

- frontend,
- backend,
- mobile,
- admin systems,
- future integrations.

The API is NOT merely technical infrastructure.

It is:

# operational communication infrastructure.

---

# Core Philosophy

The API should reflect:

- operational truth,
- workflow discipline,
- status integrity,
- auditability.

Endpoints should represent:

# business operations,
not database tables.

---

# Architectural Principles

---

# Principle 1 — Operational Clarity

Endpoints should describe:

# operational intent.

---

# Good Example

```txt
POST /delivery-requests/{id}/accept-offer
```

---

# Current Dev Delivery Endpoints

These endpoints exist under the dev delivery router and reflect the current backend implementation. They are not the final public API shape.

## Transition Delivery

```txt
POST /dev/deliveries/:id/transition
```

Body:

```json
{
  "to": "LOADING",
  "actorType": "DRIVER",
  "actorId": "driver-id",
  "reason": "required for FAILED or SKIPPED transitions",
  "metadata": {}
}
```

Returns:

```json
{
  "success": true,
  "delivery": {}
}
```

The endpoint validates allowed transitions, actor type, required reason, required actor id for non-system actors, and OTP completion guard.

## Delivery Timeline

```txt
GET /dev/deliveries/:id/timeline
```

Returns:

```txt
deliveryId
currentStatus
otpVerifiedAt
deliveryEvents
auditLogs
timeline
```

The `timeline` array merges delivery events and audit logs in creation order. OTP codes are stripped from nested JSON metadata.

## Generate OTP

```txt
POST /dev/deliveries/:id/otp/generate
```

Body:

```json
{
  "actorType": "DRIVER",
  "actorId": "driver-id"
}
```

Generation is currently allowed only in `ARRIVED` or `MEASURING`.

## Verify OTP

```txt
POST /dev/deliveries/:id/otp/verify
```

Body:

```json
{
  "actorType": "CUSTOMER",
  "actorId": "customer-id",
  "otpCode": "123456"
}
```

Verification is currently allowed only in `AWAITING_OTP`.

## Alert Check

```txt
POST /dev/deliveries/check-alerts
```

Runs the current alert detector against active deliveries in:

```txt
LOADING
EN_ROUTE
ARRIVED
MEASURING
AWAITING_OTP
```

Returns:

```txt
alertsCreated
alerts
```

The detector creates `DELIVERY_ALERT_CREATED` delivery events and matching audit logs for new alert types. It deduplicates by existing delivery event metadata `alertType`.

## Notifications

```txt
GET /dev/notifications
PATCH /dev/notifications/:id/read
```

Notifications are currently in-app records with `UNREAD` and `READ` statuses.
