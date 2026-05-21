# Local Demo Walkthrough

This guide is for running a local TankUp delivery execution demo with the current dev backend, scenario seeder, and frontend Driver Delivery Control Panel.

The backend is the source of truth. The frontend panel only calls the dev driver execution endpoints.

## 1. Backend Startup

Install dependencies once:

```bash
cd backend
npm install
```

Create a backend `.env` with the database connection expected by Prisma. At minimum, local demo runs need `DATABASE_URL` pointing at a PostgreSQL database.

Generate the Prisma client:

```bash
cd backend
npx prisma generate
```

Apply the database schema using the repo's normal Prisma workflow for your environment. If the database is already prepared, start the backend:

```bash
cd backend
npm run dev
```

By default, the backend listens on:

```txt
http://localhost:5000
```

If you set a custom `PORT`, use that port in the curl examples below.

## 2. Frontend Startup

Install dependencies once:

```bash
cd frontend
npm install
```

Optionally create `frontend/.env.local`:

```bash
VITE_API_BASE_URL=http://localhost:5000
```

If `VITE_API_BASE_URL` is not set, the frontend API client falls back to `http://localhost:5000`.

Start the frontend:

```bash
cd frontend
npm run dev
```

Open the Vite URL printed by the command, usually:

```txt
http://localhost:5173
```

The app currently renders the dev Driver Delivery Control Panel directly.

## 3. Seeder Execution

Run the scenario seeder after the backend database is available:

```bash
cd backend
npm run seed:delivery-scenarios
```

The seeder deletes previously seeded rows whose `siteId` starts with `seed-delivery-scenario:` and creates fresh rows every run. Delivery IDs change on every seed.

Copy the delivery IDs printed in the terminal. The output looks like:

```txt
Seeded delivery scenarios:
- healthy delivery: <delivery-id> (EN_ROUTE)
- stuck LOADING: <delivery-id> (LOADING)
- stuck EN_ROUTE: <delivery-id> (EN_ROUTE)
- ARRIVED but not MEASURING: <delivery-id> (ARRIVED)
- MEASURING too long: <delivery-id> (MEASURING)
- AWAITING_OTP too long: <delivery-id> (AWAITING_OTP)
- repeated OTP failures: <delivery-id> (AWAITING_OTP)
- suspicious SKIPPED: <delivery-id> (SKIPPED)
- completed delivery: <delivery-id> (COMPLETED)
- failed delivery: <delivery-id> (FAILED)
```

## 4. Example Delivery IDs To Use

Use the IDs printed by the seeder, not the labels themselves.

| Demo purpose | Scenario label | Starting status |
| --- | --- | --- |
| Continue an in-progress delivery | `healthy delivery` | `EN_ROUTE` |
| Loading alert | `stuck LOADING` | `LOADING` |
| En-route alert | `stuck EN_ROUTE` | `EN_ROUTE` |
| Arrival-to-measurement demo | `ARRIVED but not MEASURING` | `ARRIVED` |
| Measurement submission demo | `MEASURING too long` | `MEASURING` |
| OTP retry/expiry demo | `AWAITING_OTP too long` | `AWAITING_OTP` |
| Repeated OTP failure alert | `repeated OTP failures` | `AWAITING_OTP` |
| Suspicious skip alert | `suspicious SKIPPED` | `SKIPPED` |
| Completed timeline inspection | `completed delivery` | `COMPLETED` |
| Failed timeline inspection | `failed delivery` | `FAILED` |

Current limitation: the scenario seeder does not create an `ASSIGNED` delivery. To click through every driver action from the very beginning in the UI, use any local delivery row that is already in `ASSIGNED`. The backend verification script still covers the full status chain from `CREATED` through `AWAITING_OTP`.

## 5. Driver Control Panel Walkthrough

Open the frontend app and use the Driver Delivery Control Panel.

1. Paste a delivery ID into `Delivery ID`.
2. Leave `Actor ID` as `driver-dev-001`, or change it for a specific manual test.
3. Use the action buttons in the same order as the delivery's current status allows.
4. For `Submit Measurement`, fill:
   - `measuredVolumeLiters`
   - `measurementNote`
5. For `Confirm OTP`, paste the OTP returned by `Request OTP`.
6. Watch:
   - `Loading`
   - `Status`
   - `Latest Event`
   - `Last Success Response`
   - `Last Error Response`

Buttons are disabled until a delivery ID is entered. Invalid transitions are expected to return a normalized error response.

## 6. Full Happy-Path Flow

Operationally, the happy path is:

```txt
ASSIGNED
→ LOADING
→ EN_ROUTE
→ ARRIVED
→ MEASURING
→ AWAITING_OTP
→ DELIVERED
```

In the backend status model, the final delivered state is currently stored as:

```txt
COMPLETED
```

Use this click sequence for a delivery that starts in `ASSIGNED`:

1. `Start Loading`: `ASSIGNED -> LOADING`
2. `Start Route`: `LOADING -> EN_ROUTE`
3. `Arrive`: `EN_ROUTE -> ARRIVED`
4. `Start Measuring`: `ARRIVED -> MEASURING`
5. `Submit Measurement`: `MEASURING -> AWAITING_OTP`
6. `Request OTP`: generates a dev OTP and returns it in `metadata.otpCode`
7. `Confirm OTP`: verifies the OTP
8. `Complete Delivery`: completes the delivery

Important actor note: `Complete Delivery` uses existing transition guards. The current guard expects `AWAITING_OTP -> COMPLETED` to be customer-triggered, so curl examples pass `actorType: "CUSTOMER"` for completion. The dev panel defaults to driver actor payloads, so a driver-triggered completion may correctly show an actor-forbidden error.

## 7. Failure-Path Examples

### Invalid Transition

Try clicking an action that does not match the delivery status. For example, paste the `healthy delivery` ID, which starts at `EN_ROUTE`, and click `Start Loading`.

Expected result:

```json
{
  "success": false,
  "code": "INVALID_DELIVERY_TRANSITION"
}
```

### OTP Failure

Use a delivery in `AWAITING_OTP`, such as `awaiting OTP too long` or `repeated OTP failures`.

1. Enter an incorrect OTP in the panel.
2. Click `Confirm OTP`.
3. Inspect `Last Error Response`.

Expected result:

```json
{
  "success": false,
  "code": "DELIVERY_OTP_INVALID"
}
```

### Skipped Delivery

Skip uses existing transition rules and requires a reason. The current driver panel sends a reason, but defaults actor type to `DRIVER`. If the status/actor combination is not allowed, the response should be rejected.

For a successful skip curl example, use `actorType: "FLEET_HEAD"` from an allowed operational status such as `EN_ROUTE`.

### Failed Delivery

Fail also requires a reason and depends on the current transition rules. Use an active operational delivery such as `healthy delivery` or `stuck EN_ROUTE`, then call the fail endpoint with an allowed actor.

After failure, inspect the timeline and operations endpoint to confirm the failure event and audit record.

## 8. Operational Alert Examples

After seeding, call the operations alerts endpoint:

```bash
curl "$BASE_URL/dev/operations/alerts"
```

Expected seeded alert candidates:

| Scenario label | Expected alert |
| --- | --- |
| `stuck LOADING` | `LOADING_TOO_LONG` |
| `stuck EN_ROUTE` | `EN_ROUTE_TOO_LONG` |
| `ARRIVED but not MEASURING` | `ARRIVED_NOT_MEASURING` |
| `MEASURING too long` | `MEASURING_TOO_LONG` |
| `AWAITING_OTP too long` | `AWAITING_OTP_TOO_LONG` |
| `repeated OTP failures` | `REPEATED_OTP_FAILURES` |
| `suspicious SKIPPED` | `SKIPPED_SUSPICIOUS` |

Persist current alert candidates as events/audit logs:

```bash
curl -X POST "$BASE_URL/dev/deliveries/check-alerts"
```

`GET /dev/operations/alerts` computes candidates without persisting events. `POST /dev/deliveries/check-alerts` persists alert events for active operational statuses only.

## 9. Timeline Inspection Examples

Set a delivery ID from the seeder:

```bash
BASE_URL=http://localhost:5000
DELIVERY_ID=<seeded-delivery-id>
```

Inspect the timeline:

```bash
curl "$BASE_URL/dev/deliveries/$DELIVERY_ID/timeline"
```

Inspect the operator snapshot:

```bash
curl "$BASE_URL/dev/deliveries/$DELIVERY_ID/operations"
```

Good timeline demos:

| Scenario label | What to inspect |
| --- | --- |
| `completed delivery` | OTP verification plus completion event |
| `failed delivery` | Failure event and escalation notification |
| `repeated OTP failures` | Multiple OTP failure events |
| `suspicious SKIPPED` | Skip event with missing reason evidence |

Timeline metadata sanitizes OTP codes.

## 10. Example Curl Commands

Set common variables:

```bash
BASE_URL=http://localhost:5000
DELIVERY_ID=<delivery-id>
DRIVER_ID=driver-dev-001
```

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
      "measuredVolumeLiters": 12000,
      "measurementNote": "Dev panel measurement"
    }
  }'
```

Request OTP:

```bash
curl -X POST "$BASE_URL/dev/deliveries/$DELIVERY_ID/driver/request-otp" \
  -H "Content-Type: application/json" \
  -d '{"actorId":"'"$DRIVER_ID"'"}'
```

Confirm OTP:

```bash
OTP_CODE=<otp-from-request-otp-response>

curl -X POST "$BASE_URL/dev/deliveries/$DELIVERY_ID/driver/confirm-otp" \
  -H "Content-Type: application/json" \
  -d '{
    "actorId": "'"$DRIVER_ID"'",
    "otpCode": "'"$OTP_CODE"'"
  }'
```

Complete delivery:

```bash
curl -X POST "$BASE_URL/dev/deliveries/$DELIVERY_ID/driver/complete" \
  -H "Content-Type: application/json" \
  -d '{
    "actorType": "CUSTOMER",
    "actorId": "customer-dev-001"
  }'
```

Fail delivery:

```bash
curl -X POST "$BASE_URL/dev/deliveries/$DELIVERY_ID/driver/fail" \
  -H "Content-Type: application/json" \
  -d '{
    "actorType": "FLEET_HEAD",
    "actorId": "fleet-head-dev-001",
    "reason": "Pump failure during local demo",
    "metadata": {
      "reportedBy": "driver"
    }
  }'
```

Skip delivery:

```bash
curl -X POST "$BASE_URL/dev/deliveries/$DELIVERY_ID/driver/skip" \
  -H "Content-Type: application/json" \
  -d '{
    "actorType": "FLEET_HEAD",
    "actorId": "fleet-head-dev-001",
    "reason": "Customer requested skip during local demo"
  }'
```

List alert candidates:

```bash
curl "$BASE_URL/dev/operations/alerts"
```

Persist alert candidates:

```bash
curl -X POST "$BASE_URL/dev/deliveries/check-alerts"
```

Timeline:

```bash
curl "$BASE_URL/dev/deliveries/$DELIVERY_ID/timeline"
```

Operations view:

```bash
curl "$BASE_URL/dev/deliveries/$DELIVERY_ID/operations"
```

## 11. Known Limitations And Dev Assumptions

- These are dev endpoints. They are not authenticated.
- `actorId` is passed manually.
- Driver endpoints default `actorType` to `DRIVER` when omitted.
- Some valid operations require a non-driver actor type, such as customer completion or fleet-head skip.
- Scenario delivery IDs are regenerated every time the seeder runs.
- The current scenario seeder does not create an `ASSIGNED` delivery for a full UI happy-path from the first driver step.
- Measurement data is stored in `DeliveryEvent` metadata because there is no dedicated measurement table yet.
- OTP codes are returned by dev OTP generation/request endpoints for local testing.
- Timeline and operations views sanitize OTP codes from timeline metadata.
- `/dev/deliveries/check-alerts` persists alerts for active operational statuses only; suspicious skipped deliveries appear as candidates but are not persisted by that endpoint.
- Alerts, timelines, operations views, and notifications do not have pagination yet.
- The final delivered business state is represented by backend status `COMPLETED`.

## Quick Verification

Backend verification:

```bash
cd backend
npm run typecheck
npm run test:delivery
```

Frontend verification:

```bash
cd frontend
npm run typecheck
npm run build
```
