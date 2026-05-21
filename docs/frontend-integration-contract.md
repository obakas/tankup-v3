# Frontend Integration Contract

## Purpose

This document prepares the frontend/mobile integration contract for TankUp V3 driver execution flows.

It documents the current dev API shape only. It does not define production auth, dispatch assignment, payments, or customer-facing screens.

## Driver Execution Endpoints

All endpoints are mounted under `/dev`.

| Method | Path | Purpose | Expected status effect |
| --- | --- | --- | --- |
| `POST` | `/dev/deliveries/:id/driver/start-loading` | Driver starts loading. | `ASSIGNED -> LOADING` |
| `POST` | `/dev/deliveries/:id/driver/start-route` | Driver leaves loading point. | `LOADING -> EN_ROUTE` |
| `POST` | `/dev/deliveries/:id/driver/arrive` | Driver records arrival. | `EN_ROUTE -> ARRIVED` |
| `POST` | `/dev/deliveries/:id/driver/start-measuring` | Driver starts measurement/delivery process. | `ARRIVED -> MEASURING` |
| `POST` | `/dev/deliveries/:id/driver/submit-measurement` | Driver submits measurement evidence. | `MEASURING -> AWAITING_OTP` |
| `POST` | `/dev/deliveries/:id/driver/request-otp` | Driver requests/generates OTP. | No status movement |
| `POST` | `/dev/deliveries/:id/driver/confirm-otp` | Driver submits OTP for verification. | No status movement |
| `POST` | `/dev/deliveries/:id/driver/complete` | Completes delivery if existing guards pass. | `AWAITING_OTP -> COMPLETED` |
| `POST` | `/dev/deliveries/:id/driver/fail` | Marks delivery failed where supported. | Active operational status -> `FAILED` |
| `POST` | `/dev/deliveries/:id/driver/skip` | Marks delivery skipped where supported. | Supported status -> `SKIPPED` |

The backend route layer wraps existing domain services. Frontend code should treat failed transitions as valid API responses, not client bugs.

## Request Body Examples

Default body shape:

```json
{
  "actorId": "dev-driver"
}
```

`actorType` is optional and defaults to `DRIVER`:

```json
{
  "actorType": "DRIVER",
  "actorId": "dev-driver"
}
```

Start loading:

```json
{
  "actorId": "dev-driver"
}
```

Start route:

```json
{
  "actorId": "dev-driver"
}
```

Arrive:

```json
{
  "actorId": "dev-driver"
}
```

Start measuring:

```json
{
  "actorId": "dev-driver"
}
```

Submit measurement:

```json
{
  "actorId": "dev-driver",
  "measurement": {
    "estimatedDeliveredLitres": 10000,
    "pumpingDurationMinutes": 35,
    "tankFillObservation": "Reached expected level",
    "notes": "Customer tank filled to expected level"
  }
}
```

Request OTP:

```json
{
  "actorId": "dev-driver"
}
```

Confirm OTP:

```json
{
  "actorId": "dev-driver",
  "otpCode": "123456"
}
```

Complete delivery:

```json
{
  "actorType": "CUSTOMER",
  "actorId": "dev-customer"
}
```

`complete` still uses backend transition rules. If the frontend omits `actorType`, it defaults to `DRIVER`, and the current backend rejects `AWAITING_OTP -> COMPLETED` because that transition is customer-triggered.

Fail delivery:

```json
{
  "actorId": "dev-driver",
  "reason": "Pump failure during delivery",
  "metadata": {
    "reportedBy": "driver"
  }
}
```

Skip delivery:

```json
{
  "actorType": "FLEET_HEAD",
  "actorId": "dev-fleet-head",
  "reason": "Customer asked fleet to skip this delivery"
}
```

`skip` also uses backend transition rules. Driver-triggered skip is not currently allowed.

## Success Response Shape

All driver execution endpoints return:

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

Endpoint-specific metadata:

| Endpoint | `metadata` contents |
| --- | --- |
| Transition endpoints | `targetStatus`, `actorType`, `actorId`, optional `reason`, optional submitted `metadata`. |
| `submit-measurement` | `measurement`, or `null` if none was provided. |
| `request-otp` | `otpCode` for dev verification. |
| `confirm-otp` | Submitted `otpCode`. |

## Failure Response Shape

All driver execution failures return:

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

Frontend code should branch on `success` first, then use `code` for UX copy and retry behavior.

Common codes:

| Code | Meaning |
| --- | --- |
| `VALIDATION_ERROR` | Request body or route params failed validation. |
| `DELIVERY_NOT_FOUND` | Delivery ID does not exist. |
| `INVALID_DELIVERY_TRANSITION` | Status movement is not allowed from current state. |
| `DELIVERY_TRANSITION_ACTOR_FORBIDDEN` | Actor type is not allowed for that transition. |
| `DELIVERY_TRANSITION_ACTOR_ID_REQUIRED` | Actor ID is required for non-system operations. |
| `DELIVERY_TRANSITION_REASON_REQUIRED` | Failure/skip operation needs a reason. |
| `DELIVERY_COMPLETION_REQUIRES_VERIFIED_OTP` | Completion attempted before OTP verification. |
| `DELIVERY_OTP_INVALID_STATUS` | OTP operation is not allowed in current status. |
| `DELIVERY_OTP_EXPIRED` | OTP exists but expired. |
| `DELIVERY_OTP_INVALID` | Submitted OTP is wrong. |
| `INTERNAL_SERVER_ERROR` | Unexpected backend error. |

## Delivery Statuses

Frontend must handle all backend delivery statuses:

```ts
export type DeliveryStatus =
  | "CREATED"
  | "ASSIGNED"
  | "LOADING"
  | "EN_ROUTE"
  | "ARRIVED"
  | "MEASURING"
  | "AWAITING_OTP"
  | "COMPLETED"
  | "FAILED"
  | "SKIPPED";
```

Status meanings for driver execution:

| Status | Frontend handling |
| --- | --- |
| `CREATED` | Not ready for driver execution. |
| `ASSIGNED` | Driver can start loading. |
| `LOADING` | Driver can start route or report failure/skip where rules allow. |
| `EN_ROUTE` | Driver can arrive or report failure/skip where rules allow. |
| `ARRIVED` | Driver can start measuring or request OTP if operationally appropriate. |
| `MEASURING` | Driver can submit measurement or request OTP. |
| `AWAITING_OTP` | Driver can confirm OTP; completion requires backend actor/OTP guards. |
| `COMPLETED` | Terminal success state. Disable execution actions. |
| `FAILED` | Terminal failure state. Disable normal execution actions. |
| `SKIPPED` | Terminal skipped state. Disable normal execution actions. |

## Recommended Frontend State Machine

Recommended driver UI state machine:

```txt
ASSIGNED
  -> startLoading()
LOADING
  -> startRoute()
EN_ROUTE
  -> arrive()
ARRIVED
  -> startMeasuring()
MEASURING
  -> submitMeasurement()
AWAITING_OTP
  -> confirmOtp()
  -> complete()
COMPLETED
```

Exception actions:

```txt
LOADING | EN_ROUTE | ARRIVED | MEASURING | AWAITING_OTP
  -> fail(reason)

ASSIGNED | LOADING | EN_ROUTE | ARRIVED
  -> skip(reason) if actor is allowed by backend rules
```

Recommended UI model:

- Use backend `delivery.status` as the source of truth.
- Derive the primary CTA from `delivery.status`.
- Optimistically show a loading state while a mutation is in flight.
- Do not optimistically change status before the API returns.
- On failure, keep the old status and display `error`/`code`.
- Refetch or update local cache with `response.delivery` after success.
- Disable all driver execution actions in terminal states: `COMPLETED`, `FAILED`, `SKIPPED`.

## Recommended React Hook Shape

Example hook interface:

```ts
type DriverAction =
  | "startLoading"
  | "startRoute"
  | "arrive"
  | "startMeasuring"
  | "submitMeasurement"
  | "requestOtp"
  | "confirmOtp"
  | "complete"
  | "fail"
  | "skip";

type UseDriverExecutionResult = {
  execute: (
    action: DriverAction,
    input?: DriverExecutionInput
  ) => Promise<DriverExecutionResponse>;
  isPending: boolean;
  error: ApiError | null;
};
```

Suggested implementation behavior:

- Map each `DriverAction` to its endpoint path.
- Include `actorId` in every dev request.
- Allow `actorType` override for customer/fleet-head-only operations during dev testing.
- Use one mutation wrapper so success/error parsing is consistent.
- Invalidate or update delivery query cache after successful mutation.

Pseudo-code:

```ts
function useDriverExecution(deliveryId: string): UseDriverExecutionResult {
  async function execute(action: DriverAction, input: DriverExecutionInput = {}) {
    const path = driverActionPath(action, deliveryId);
    const response = await api.post<DriverExecutionResponse>(path, input);

    if (!response.data.success) {
      throw response.data;
    }

    return response.data;
  }

  return {
    execute,
    isPending: false,
    error: null,
  };
}
```

## Recommended Mobile Screen Flow

Driver mobile flow:

1. Assigned job screen
   - Show delivery ID, site summary, tanker/driver info if available.
   - Primary CTA: `Start loading`.

2. Loading screen
   - Show loading status and elapsed time.
   - Primary CTA: `Start route`.
   - Secondary CTA: `Report failure`.

3. En route screen
   - Show navigation/status summary.
   - Primary CTA: `Arrived`.
   - Secondary CTA: `Report failure`.

4. Arrival screen
   - Show site arrival confirmation.
   - Primary CTA: `Start measuring`.
   - Secondary CTA: `Report issue`.

5. Measurement screen
   - Capture estimated delivered litres, duration, observations, and notes.
   - Primary CTA: `Submit measurement`.

6. OTP screen
   - Show OTP request action where needed.
   - Capture customer-provided OTP.
   - Primary CTA: `Confirm OTP`.

7. Completion screen
   - Show final delivery status.
   - Disable normal execution actions.

8. Exception flow
   - Failure/skip modal requires reason.
   - Submit to `fail` or `skip`.
   - Show backend error if current actor/status is not allowed.

## TypeScript Interfaces

```ts
export type ActorType =
  | "CUSTOMER"
  | "DRIVER"
  | "FLEET_HEAD"
  | "ADMIN"
  | "SYSTEM";

export type DeliveryStatus =
  | "CREATED"
  | "ASSIGNED"
  | "LOADING"
  | "EN_ROUTE"
  | "ARRIVED"
  | "MEASURING"
  | "AWAITING_OTP"
  | "COMPLETED"
  | "FAILED"
  | "SKIPPED";

export type DeliveryEventType =
  | "DELIVERY_ASSIGNED"
  | "LOADING_STARTED"
  | "DRIVER_EN_ROUTE"
  | "DRIVER_ARRIVED"
  | "MEASUREMENT_STARTED"
  | "MEASUREMENT_COMPLETED"
  | "DELIVERY_COMPLETED"
  | "DELIVERY_FAILED"
  | "DELIVERY_SKIPPED"
  | "DELIVERY_OTP_GENERATED"
  | "DELIVERY_OTP_VERIFIED"
  | "DELIVERY_OTP_FAILED"
  | "DELIVERY_ALERT_CREATED";

export type JsonValue =
  | string
  | number
  | boolean
  | null
  | JsonValue[]
  | { [key: string]: JsonValue };

export type Delivery = {
  id: string;
  status: DeliveryStatus;
  customerId: string | null;
  driverId: string | null;
  tankerId: string | null;
  siteId: string | null;
  otpCode?: string | null;
  otpExpiresAt?: string | null;
  otpVerifiedAt: string | null;
  otpVerifiedByActorType?: ActorType | null;
  otpVerifiedByActorId?: string | null;
  otpAttemptCount: number;
  createdAt: string;
  updatedAt: string;
};

export type DeliveryEvent = {
  id: string;
  deliveryId: string;
  type: DeliveryEventType | string;
  actorType: ActorType;
  actorId: string | null;
  metadata: JsonValue;
  createdAt: string;
};

export type ApiSuccess<T> = {
  success: true;
  message: string;
  delivery: Delivery;
  event: DeliveryEvent | null;
  metadata: T;
};

export type ApiError = {
  success: false;
  error: string;
  code:
    | "VALIDATION_ERROR"
    | "DELIVERY_NOT_FOUND"
    | "INVALID_DELIVERY_TRANSITION"
    | "DELIVERY_TRANSITION_ACTOR_FORBIDDEN"
    | "DELIVERY_TRANSITION_ACTOR_ID_REQUIRED"
    | "DELIVERY_TRANSITION_REASON_REQUIRED"
    | "DELIVERY_TRANSITION_CONFLICT"
    | "DELIVERY_COMPLETION_REQUIRES_VERIFIED_OTP"
    | "DELIVERY_OTP_INVALID_STATUS"
    | "DELIVERY_OTP_EXPIRED"
    | "DELIVERY_OTP_INVALID"
    | "INTERNAL_SERVER_ERROR";
  details: Record<string, unknown>;
};

export type DriverExecutionMetadata = {
  targetStatus?: DeliveryStatus;
  actorType?: ActorType;
  actorId?: string | null;
  reason?: string;
  metadata?: Record<string, JsonValue>;
  measurement?: Record<string, JsonValue> | null;
  otpCode?: string;
};

export type DriverExecutionResponse =
  | ApiSuccess<DriverExecutionMetadata | null>
  | ApiError;

export type DriverExecutionInput = {
  actorId?: string;
  actorType?: ActorType;
  reason?: string;
  otpCode?: string;
  metadata?: Record<string, JsonValue>;
  measurement?: Record<string, JsonValue>;
};
```

## Known Dev-Only Assumptions

- No auth yet.
- `actorId` is passed manually by the frontend/mobile client.
- `actorType` defaults to `DRIVER` when omitted.
- Some endpoints may require overriding `actorType` during dev testing because backend transition rules still apply.
- Measurement is stored in delivery event metadata when no measurement table exists.
- Request OTP returns `metadata.otpCode` for dev verification.
- Dev endpoints live under `/dev`; production route names and auth behavior may change.
- The server remains the source of truth for status. Frontend must not invent or force status changes locally.
