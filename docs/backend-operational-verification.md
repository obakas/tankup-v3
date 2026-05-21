# Backend Operational Verification

## Purpose

This document describes the current backend verification surface for TankUp V3 delivery operations.

It is focused on dev/manual verification only. These endpoints are not production API contracts.

## Setup

Start the backend:

```bash
cd backend
npm run dev
```

Seed operational scenarios:

```bash
cd backend
npm run seed:delivery-scenarios
```

The seeder clears previous seeded rows where `siteId` starts with `seed-delivery-scenario:` and creates fresh delivery IDs each run. Use the delivery IDs printed by the seeder output for ID-specific endpoint checks.

## Available Dev Endpoints

All routes are mounted under `/dev`.

| Method | Path | Purpose |
| --- | --- | --- |
| `POST` | `/dev/deliveries/:id/transition` | Apply a guarded delivery status transition. |
| `GET` | `/dev/deliveries/:id/timeline` | View delivery events, audit logs, and notifications in chronological order. |
| `GET` | `/dev/deliveries/:id/operations` | View operator-focused delivery state, OTP state, alerts, risk flags, and suggested action. |
| `POST` | `/dev/deliveries/check-alerts` | Persist alert events/audit logs for current alert candidates. |
| `GET` | `/dev/operations/alerts` | List current operational alert candidates without creating new alert events. |
| `POST` | `/dev/deliveries/:id/otp/generate` | Generate a delivery OTP in an allowed status. |
| `POST` | `/dev/deliveries/:id/otp/verify` | Verify a delivery OTP while delivery is `AWAITING_OTP`. |
| `GET` | `/dev/notifications` | List notifications. |
| `PATCH` | `/dev/notifications/:id/read` | Mark a notification as read. |

## Seeded Delivery Scenarios

The scenario seeder creates these deliveries:

| Scenario key | Label | Status | Purpose |
| --- | --- | --- | --- |
| `healthy-delivery` | healthy delivery | `EN_ROUTE` | Normal in-progress delivery that should not be delayed yet. |
| `stuck-loading` | stuck LOADING | `LOADING` | Delivery has been in loading past the threshold. |
| `stuck-en-route` | stuck EN_ROUTE | `EN_ROUTE` | Delivery has been en route past the threshold. |
| `arrived-not-measuring` | ARRIVED but not MEASURING | `ARRIVED` | Driver arrived but measurement has not started. |
| `measuring-too-long` | MEASURING too long | `MEASURING` | Measurement phase has exceeded the expected window. |
| `awaiting-otp-too-long` | AWAITING_OTP too long | `AWAITING_OTP` | OTP is expired and delivery has waited too long for confirmation. |
| `repeated-otp-failures` | repeated OTP failures | `AWAITING_OTP` | Delivery has three failed OTP attempts. |
| `suspicious-skipped` | suspicious SKIPPED | `SKIPPED` | Skipped delivery has incomplete/invalid operational evidence. |
| `completed-delivery` | completed delivery | `COMPLETED` | Completed delivery with OTP verification evidence. |
| `failed-delivery` | failed delivery | `FAILED` | Failed delivery with failure event/audit evidence. |

## Expected Alerts By Scenario

Alert thresholds currently used by the backend:

| Alert | Threshold |
| --- | --- |
| `LOADING_TOO_LONG` | `LOADING` for 60 minutes or more. |
| `EN_ROUTE_TOO_LONG` | `EN_ROUTE` for 120 minutes or more. |
| `ARRIVED_NOT_MEASURING` | `ARRIVED` for 30 minutes or more. |
| `MEASURING_TOO_LONG` | `MEASURING` for 45 minutes or more. |
| `AWAITING_OTP_TOO_LONG` | `AWAITING_OTP` for 30 minutes or more without OTP verification. |
| `REPEATED_OTP_FAILURES` | `otpAttemptCount >= 3`. |
| `SKIPPED_SUSPICIOUS` | `SKIPPED` with missing skip evidence, missing reason, or unexpected actor. |

| Scenario key | Expected alert candidates |
| --- | --- |
| `healthy-delivery` | None. |
| `stuck-loading` | `LOADING_TOO_LONG`. |
| `stuck-en-route` | `EN_ROUTE_TOO_LONG`. |
| `arrived-not-measuring` | `ARRIVED_NOT_MEASURING`. |
| `measuring-too-long` | `MEASURING_TOO_LONG`. |
| `awaiting-otp-too-long` | `AWAITING_OTP_TOO_LONG`. |
| `repeated-otp-failures` | `REPEATED_OTP_FAILURES`. |
| `suspicious-skipped` | `SKIPPED_SUSPICIOUS`. |
| `completed-delivery` | None. |
| `failed-delivery` | None. |

`POST /dev/deliveries/check-alerts` only scans active operational statuses: `LOADING`, `EN_ROUTE`, `ARRIVED`, `MEASURING`, and `AWAITING_OTP`. It does not persist `SKIPPED_SUSPICIOUS`; that alert appears in `GET /dev/operations/alerts` and in a delivery operations view.

## Response Shapes

### `GET /dev/operations/alerts`

Returns current alert candidates, sorted by severity and age:

```json
{
  "generatedAt": "2026-05-21T00:00:00.000Z",
  "alerts": [
    {
      "deliveryId": "uuid",
      "status": "AWAITING_OTP",
      "type": "REPEATED_OTP_FAILURES",
      "severity": "CRITICAL",
      "ageMinutes": 12,
      "message": "Delivery has repeated failed OTP attempts.",
      "metadata": {
        "status": "AWAITING_OTP",
        "otpAttemptCount": 3,
        "failedOtpEventCount": 3,
        "thresholdAttempts": 3,
        "customerId": "seed-delivery-scenario:customer:repeated-otp-failures",
        "driverId": "seed-delivery-scenario:driver:repeated-otp-failures",
        "tankerId": "seed-delivery-scenario:tanker:repeated-otp-failures",
        "siteId": "seed-delivery-scenario:site:repeated-otp-failures",
        "existingDeliveryAlerts": []
      }
    }
  ]
}
```

### `GET /dev/deliveries/:id/timeline`

Returns delivery identity/state plus a chronological timeline from delivery events, audit logs, and notifications. OTP codes are sanitized out of timeline metadata.

```json
{
  "delivery": {
    "id": "uuid",
    "status": "AWAITING_OTP",
    "customerId": "seed-delivery-scenario:customer:repeated-otp-failures",
    "driverId": "seed-delivery-scenario:driver:repeated-otp-failures",
    "tankerId": "seed-delivery-scenario:tanker:repeated-otp-failures",
    "siteId": "seed-delivery-scenario:site:repeated-otp-failures",
    "otpVerifiedAt": null,
    "otpAttemptCount": 3,
    "createdAt": "2026-05-21T00:00:00.000Z",
    "updatedAt": "2026-05-21T00:00:00.000Z"
  },
  "timeline": [
    {
      "timestamp": "2026-05-21T00:00:00.000Z",
      "source": "EVENT",
      "type": "DELIVERY_OTP_FAILED",
      "actorType": "CUSTOMER",
      "actorId": "seed-customer-repeated-otp-failures",
      "message": "Delivery Otp Failed",
      "metadata": {
        "id": "uuid",
        "deliveryId": "uuid",
        "failureReason": "invalid",
        "attemptCount": 3
      }
    }
  ]
}
```

`source` can be `EVENT`, `AUDIT`, or `NOTIFICATION`.

### `GET /dev/deliveries/:id/operations`

Returns an operator-focused snapshot for one delivery:

```json
{
  "delivery": {
    "id": "uuid",
    "status": "AWAITING_OTP",
    "customerId": "seed-delivery-scenario:customer:repeated-otp-failures",
    "driverId": "seed-delivery-scenario:driver:repeated-otp-failures",
    "tankerId": "seed-delivery-scenario:tanker:repeated-otp-failures",
    "siteId": "seed-delivery-scenario:site:repeated-otp-failures"
  },
  "currentStatusAge": {
    "startedAt": "2026-05-21T00:00:00.000Z",
    "ageMinutes": 20
  },
  "latestEvent": {
    "id": "uuid",
    "type": "DELIVERY_OTP_FAILED",
    "actorType": "CUSTOMER",
    "actorId": "seed-customer-repeated-otp-failures",
    "metadata": {
      "failureReason": "invalid",
      "attemptCount": 3
    },
    "createdAt": "2026-05-21T00:00:00.000Z"
  },
  "latestAuditLog": {
    "id": "uuid",
    "action": "DELIVERY_OTP_FAILED",
    "actorType": "CUSTOMER",
    "actorId": "seed-customer-repeated-otp-failures",
    "reason": null,
    "metadata": {
      "failureReason": "invalid",
      "attemptCount": 3
    },
    "createdAt": "2026-05-21T00:00:00.000Z"
  },
  "otp": {
    "state": "PENDING",
    "expiresAt": "2026-05-21T00:00:00.000Z",
    "verifiedAt": null,
    "verifiedByActorType": null,
    "verifiedByActorId": null,
    "attemptCount": 3
  },
  "alerts": {
    "unresolved": [
      {
        "id": "uuid",
        "type": "REPEATED_OTP_FAILURES",
        "severity": "CRITICAL",
        "metadata": {
          "seeded": true,
          "otpAttemptCount": 3
        },
        "createdAt": "2026-05-21T00:00:00.000Z"
      }
    ],
    "candidates": [
      {
        "deliveryId": "uuid",
        "status": "AWAITING_OTP",
        "type": "REPEATED_OTP_FAILURES",
        "severity": "CRITICAL",
        "ageMinutes": 20,
        "message": "Delivery has repeated failed OTP attempts.",
        "metadata": {}
      }
    ]
  },
  "riskFlags": [
    {
      "type": "REPEATED_OTP_FAILURES",
      "severity": "CRITICAL",
      "message": "Delivery has repeated failed OTP attempts."
    }
  ],
  "suggestedOperatorAction": "Escalate to admin review immediately.",
  "generatedAt": "2026-05-21T00:00:00.000Z"
}
```

`otp.state` can be `NOT_GENERATED`, `PENDING`, `EXPIRED`, or `VERIFIED`.

## Curl Examples

Set a base URL and a seeded delivery ID:

```bash
BASE_URL=http://localhost:5000
DELIVERY_ID=<seeded-delivery-id>
```

List operational alert candidates:

```bash
curl "$BASE_URL/dev/operations/alerts"
```

View a delivery timeline:

```bash
curl "$BASE_URL/dev/deliveries/$DELIVERY_ID/timeline"
```

View a delivery operations snapshot:

```bash
curl "$BASE_URL/dev/deliveries/$DELIVERY_ID/operations"
```

Persist current alert candidates as delivery events/audit logs:

```bash
curl -X POST "$BASE_URL/dev/deliveries/check-alerts"
```

Generate OTP:

```bash
curl -X POST "$BASE_URL/dev/deliveries/$DELIVERY_ID/otp/generate" \
  -H "Content-Type: application/json" \
  -d '{"actorType":"DRIVER","actorId":"dev-driver"}'
```

Verify OTP:

```bash
curl -X POST "$BASE_URL/dev/deliveries/$DELIVERY_ID/otp/verify" \
  -H "Content-Type: application/json" \
  -d '{"actorType":"CUSTOMER","actorId":"dev-customer","otpCode":"123456"}'
```

Transition delivery status:

```bash
curl -X POST "$BASE_URL/dev/deliveries/$DELIVERY_ID/transition" \
  -H "Content-Type: application/json" \
  -d '{"to":"ASSIGNED","actorType":"ADMIN","actorId":"dev-admin"}'
```

List notifications:

```bash
curl "$BASE_URL/dev/notifications"
```

Mark a notification as read:

```bash
curl -X PATCH "$BASE_URL/dev/notifications/<notification-id>/read"
```

## Known Limitations

- Dev endpoint paths are not authenticated or permission-scoped.
- Scenario IDs are regenerated on every `npm run seed:delivery-scenarios` run.
- Alert thresholds are fixed constants in code, not operational configuration.
- `GET /dev/operations/alerts` computes candidates but does not persist alert events.
- `POST /dev/deliveries/check-alerts` persists alert events and audit logs, but duplicate prevention is event-metadata based.
- `POST /dev/deliveries/check-alerts` scans active operational statuses only and does not persist `SKIPPED_SUSPICIOUS`.
- Operational views are read models over current delivery/event/audit/notification data; they are not separate durable projections.
- OTP values are returned by the dev generation endpoint for verification convenience.
- Timeline and operations views sanitize `otpCode` from metadata, but they still expose dev actor IDs and seeded identifiers.
- No pagination exists yet for notifications, timelines, or alert candidate lists.

## Next Recommended Backend Milestone

The next backend milestone should be an operator-ready delivery operations API boundary:

- Move dev-only operations endpoints toward authenticated admin/fleet operations routes.
- Add explicit alert resolution workflow with actor, reason, audit log, and event record.
- Add pagination and filters for operations alerts, timelines, and notifications.
- Add focused automated tests for operations views and alert persistence idempotency.
- Keep status transitions, OTP verification, audit logs, events, and notifications inside explicit domain operations.
