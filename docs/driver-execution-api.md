# Driver Execution Dev API

## Purpose

These dev endpoints wrap the existing delivery transition and OTP services for driver-facing execution flows.

They do not implement auth yet. For now, each endpoint accepts `actorId` and optional `actorType` in the request body. If `actorType` is omitted, it defaults to `DRIVER`.

All endpoints return a normalized success shape:

```json
{
  "success": true,
  "message": "Driver measurement submitted.",
  "delivery": {},
  "event": {},
  "metadata": {}
}
```

Failed driver execution requests return:

```json
{
  "success": false,
  "error": "Invalid delivery transition: CREATED -> COMPLETED",
  "code": "INVALID_DELIVERY_TRANSITION",
  "details": {}
}
```

Validation errors, transition errors, OTP errors, and not-found errors use the same failure wrapper.

## Endpoints

| Method | Path | Existing service used | Expected status movement |
| --- | --- | --- | --- |
| `POST` | `/dev/deliveries/:id/driver/start-loading` | `transitionDeliveryStatus()` | `ASSIGNED -> LOADING` |
| `POST` | `/dev/deliveries/:id/driver/start-route` | `transitionDeliveryStatus()` | `LOADING -> EN_ROUTE` |
| `POST` | `/dev/deliveries/:id/driver/arrive` | `transitionDeliveryStatus()` | `EN_ROUTE -> ARRIVED` |
| `POST` | `/dev/deliveries/:id/driver/start-measuring` | `transitionDeliveryStatus()` | `ARRIVED -> MEASURING` |
| `POST` | `/dev/deliveries/:id/driver/submit-measurement` | `transitionDeliveryStatus()` | `MEASURING -> AWAITING_OTP` |
| `POST` | `/dev/deliveries/:id/driver/request-otp` | `generateDeliveryOtp()` | No status movement |
| `POST` | `/dev/deliveries/:id/driver/confirm-otp` | `verifyDeliveryOtp()` | No status movement |
| `POST` | `/dev/deliveries/:id/driver/complete` | `transitionDeliveryStatus()` | `AWAITING_OTP -> COMPLETED` if actor/OTP rules pass |
| `POST` | `/dev/deliveries/:id/driver/fail` | `transitionDeliveryStatus()` | Active operational status -> `FAILED` where supported |
| `POST` | `/dev/deliveries/:id/driver/skip` | `transitionDeliveryStatus()` | Supported operational status -> `SKIPPED` where supported |

The route layer does not duplicate transition logic. Invalid transitions, forbidden actors, missing actor IDs, missing reasons, and OTP completion guards are handled by the existing domain services.

## Response Contract

Successful driver execution responses always include:

| Field | Meaning |
| --- | --- |
| `success` | Always `true` on success. |
| `message` | Human-readable operation result. |
| `delivery` | Updated delivery row returned by the existing service. |
| `event` | Latest delivery event for the delivery after the operation. |
| `metadata` | Endpoint-specific metadata, or `null`. |

Example success:

```json
{
  "success": true,
  "message": "Driver route started.",
  "delivery": {
    "id": "uuid",
    "status": "EN_ROUTE"
  },
  "event": {
    "id": "uuid",
    "deliveryId": "uuid",
    "type": "DRIVER_EN_ROUTE",
    "actorType": "DRIVER",
    "actorId": "dev-driver",
    "metadata": {
      "from": "LOADING",
      "to": "EN_ROUTE",
      "reason": null,
      "metadata": null
    },
    "createdAt": "2026-05-21T00:00:00.000Z"
  },
  "metadata": {
    "targetStatus": "EN_ROUTE",
    "actorType": "DRIVER",
    "actorId": "dev-driver"
  }
}
```

Request OTP success includes the generated OTP code in `metadata` for dev verification:

```json
{
  "success": true,
  "message": "Delivery OTP requested.",
  "delivery": {
    "id": "uuid",
    "status": "MEASURING"
  },
  "event": {
    "type": "DELIVERY_OTP_GENERATED"
  },
  "metadata": {
    "otpCode": "123456"
  }
}
```

Measurement submission success echoes submitted measurement data in `metadata.measurement`.

Failure fields:

| Field | Meaning |
| --- | --- |
| `success` | Always `false` on failure. |
| `error` | Human-readable error message. |
| `code` | Stable error code such as `VALIDATION_ERROR`, `DELIVERY_NOT_FOUND`, `INVALID_DELIVERY_TRANSITION`, `DELIVERY_OTP_INVALID`, or `INTERNAL_SERVER_ERROR`. |
| `details` | Structured details for the error. Validation errors include `details.issues`. |

Example validation failure:

```json
{
  "success": false,
  "error": "Request validation failed",
  "code": "VALIDATION_ERROR",
  "details": {
    "issues": []
  }
}
```

Example transition failure:

```json
{
  "success": false,
  "error": "Actor DRIVER cannot transition delivery from AWAITING_OTP to COMPLETED",
  "code": "DELIVERY_TRANSITION_ACTOR_FORBIDDEN",
  "details": {
    "from": "AWAITING_OTP",
    "to": "COMPLETED",
    "actorType": "DRIVER",
    "allowedActorTypes": ["CUSTOMER"]
  }
}
```

Example OTP failure:

```json
{
  "success": false,
  "error": "Delivery OTP is invalid",
  "code": "DELIVERY_OTP_INVALID",
  "details": {
    "deliveryId": "uuid"
  }
}
```

Example not-found failure:

```json
{
  "success": false,
  "error": "Delivery not found",
  "code": "DELIVERY_NOT_FOUND",
  "details": {
    "deliveryId": "uuid"
  }
}
```

## Curl Setup

```bash
BASE_URL=http://localhost:5000
DELIVERY_ID=<delivery-id>
DRIVER_ID=dev-driver
```

## Curl Examples

Start loading:

```bash
curl -X POST "$BASE_URL/dev/deliveries/$DELIVERY_ID/driver/start-loading" \
  -H "Content-Type: application/json" \
  -d '{"actorId":"'"$DRIVER_ID"'"}'
```

Start route:

```bash
curl -X POST "$BASE_URL/dev/deliveries/$DELIVERY_ID/driver/start-route" \
  -H "Content-Type: application/json" \
  -d '{"actorId":"'"$DRIVER_ID"'"}'
```

Arrive:

```bash
curl -X POST "$BASE_URL/dev/deliveries/$DELIVERY_ID/driver/arrive" \
  -H "Content-Type: application/json" \
  -d '{"actorId":"'"$DRIVER_ID"'"}'
```

Start measuring:

```bash
curl -X POST "$BASE_URL/dev/deliveries/$DELIVERY_ID/driver/start-measuring" \
  -H "Content-Type: application/json" \
  -d '{"actorId":"'"$DRIVER_ID"'"}'
```

Submit measurement:

```bash
curl -X POST "$BASE_URL/dev/deliveries/$DELIVERY_ID/driver/submit-measurement" \
  -H "Content-Type: application/json" \
  -d '{
    "actorId": "'"$DRIVER_ID"'",
    "measurement": {
      "estimatedDeliveredLitres": 10000,
      "pumpingDurationMinutes": 35,
      "notes": "Customer tank filled to expected level"
    }
  }'
```

Measurement fields are currently stored in delivery event metadata because the schema does not have dedicated measurement columns yet.

Request OTP:

```bash
curl -X POST "$BASE_URL/dev/deliveries/$DELIVERY_ID/driver/request-otp" \
  -H "Content-Type: application/json" \
  -d '{"actorId":"'"$DRIVER_ID"'"}'
```

Confirm OTP:

```bash
curl -X POST "$BASE_URL/dev/deliveries/$DELIVERY_ID/driver/confirm-otp" \
  -H "Content-Type: application/json" \
  -d '{
    "actorId": "'"$DRIVER_ID"'",
    "otpCode": "123456"
  }'
```

Complete:

```bash
curl -X POST "$BASE_URL/dev/deliveries/$DELIVERY_ID/driver/complete" \
  -H "Content-Type: application/json" \
  -d '{
    "actorType": "CUSTOMER",
    "actorId": "dev-customer"
  }'
```

Completion still uses the existing transition rules. If `actorType` is omitted, it defaults to `DRIVER` and the current transition guard rejects completion because `AWAITING_OTP -> COMPLETED` is customer-triggered.

Fail:

```bash
curl -X POST "$BASE_URL/dev/deliveries/$DELIVERY_ID/driver/fail" \
  -H "Content-Type: application/json" \
  -d '{
    "actorId": "'"$DRIVER_ID"'",
    "reason": "Pump failure during delivery",
    "metadata": {
      "reportedBy": "driver"
    }
  }'
```

Skip:

```bash
curl -X POST "$BASE_URL/dev/deliveries/$DELIVERY_ID/driver/skip" \
  -H "Content-Type: application/json" \
  -d '{
    "actorType": "FLEET_HEAD",
    "actorId": "dev-fleet-head",
    "reason": "Customer asked fleet to skip this delivery"
  }'
```

Skip still uses the existing transition rules. If `actorType` is omitted, it defaults to `DRIVER` and the current transition guard rejects skip operations because driver-triggered skip is not allowed.
