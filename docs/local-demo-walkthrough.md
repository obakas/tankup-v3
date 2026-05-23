# Local Demo Walkthrough

This guide runs the current TankUp V3 local demo around the Operations Control Room dashboard and the dev delivery backend.

The backend remains the source of truth. The dashboard reads operational delivery state and calls existing guarded backend operations; it does not create frontend-only delivery transitions.

## Required Environment Variables

Backend `.env` in `backend/`:

```bash
DATABASE_URL=postgresql://USER:PASSWORD@HOST:PORT/DATABASE
PORT=5000
```

`DATABASE_URL` is required by Prisma and the PostgreSQL adapter. `PORT` is optional; the backend defaults to `5000`.

Frontend `.env.local` in `frontend/`:

```bash
VITE_API_BASE_URL=http://localhost:5000
```

`VITE_API_BASE_URL` is optional. If it is not set, the frontend API client falls back to `http://localhost:5000`.

Do not commit real `.env` values.

## Prisma Generate And Migrate Notes

Install backend dependencies first:

```bash
cd backend
npm install
```

Generate Prisma Client after dependency install, schema changes, or a fresh checkout:

```bash
cd backend
npx prisma generate
```

Apply migrations to the local demo database:

```bash
cd backend
npx prisma migrate deploy
```

For local development databases where you intentionally want Prisma to run development migrations, use the repo's normal local workflow:

```bash
cd backend
npx prisma migrate dev
```

Do not use local demo commands against a production database.

## Backend Startup Commands

Start the backend:

```bash
cd backend
npm run dev
```

Default backend URL:

```txt
http://localhost:5000
```

If `PORT` is changed, use the matching port in frontend `VITE_API_BASE_URL` and curl examples.

## Frontend Startup Commands

Install frontend dependencies once:

```bash
cd frontend
npm install
```

Start the frontend:

```bash
cd frontend
npm run dev
```

Open the Vite URL printed in the terminal, usually:

```txt
http://localhost:5173
```

The app renders the Operations Control Room dashboard.

## Scenario Seeding

Run the scenario seeder after the database schema is ready:

```bash
cd backend
npm run seed:delivery-scenarios
```

The seeder removes previous seeded rows whose `siteId` starts with `seed-delivery-scenario:` and creates a fresh scenario set. Delivery IDs change each time.

Example output:

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

## Open The Operations Dashboard

1. Start the backend.
2. Start the frontend.
3. Open `http://localhost:5173`, or the Vite URL printed by `npm run dev`.
4. Confirm the dashboard shows `Operations / Control Room`.

The dashboard uses these dev endpoints:

```txt
GET /dev/operations/deliveries
GET /dev/operations/alerts
GET /dev/deliveries/:id/operations
GET /dev/deliveries/:id/timeline
```

## Inspect Deliveries

Use the Live Deliveries Board:

1. Set `Status` to filter by a delivery status, or leave it as all statuses.
2. Use `Search` to find a delivery, customer, driver, tanker, or site identifier.
3. Use `Limit` to choose how many deliveries to fetch.
4. Click `Refresh` to reload the board.
5. Click a delivery card to open its detail drawer.

The board groups deliveries by status and shows:

- delivery ID,
- customer/request identifier when available,
- driver and tanker identifiers,
- latest event,
- active alert count,
- last updated time.

## Inspect Alerts

Use the Operational Alerts panel on the right side of the dashboard.

The panel is powered only by:

```txt
GET /dev/operations/alerts
```

It polls automatically every 10 seconds. Use `Refresh` for a manual reload.

Seeded alert scenarios:

| Scenario label | Expected alert |
| --- | --- |
| `stuck LOADING` | `LOADING_TOO_LONG` |
| `stuck EN_ROUTE` | `EN_ROUTE_TOO_LONG` |
| `ARRIVED but not MEASURING` | `ARRIVED_NOT_MEASURING` |
| `MEASURING too long` | `MEASURING_TOO_LONG` |
| `AWAITING_OTP too long` | `AWAITING_OTP_TOO_LONG` |
| `repeated OTP failures` | `REPEATED_OTP_FAILURES` |
| `suspicious SKIPPED` | `SKIPPED_SUSPICIOUS` |

The alerts endpoint computes current candidates. Persisting alert events is a separate backend dev operation:

```bash
BASE_URL=http://localhost:5000
curl -X POST "$BASE_URL/dev/deliveries/check-alerts"
```

## Inspect Delivery Drawer

Click a delivery card or alert item to open the drawer.

The drawer loads:

```txt
GET /dev/deliveries/:id/operations
GET /dev/deliveries/:id/timeline
```

Inspect:

- current status,
- driver, tanker, customer, and site identifiers,
- OTP state,
- active alerts,
- latest event metadata,
- risk flags,
- chronological timeline.

Use the drawer `Refresh` button after manual backend actions or while demoing status changes.

## Use Drawer Actions Safely

Drawer action buttons call existing dev driver execution endpoints. They do not bypass backend transition rules.

Supported actions:

- `Refresh`: reloads delivery operations and timeline.
- `Confirm OTP`: available on `AWAITING_OTP` when an OTP is entered.
- `Complete Delivery`: available only when the drawer sees `AWAITING_OTP` with verified OTP and a customer identifier.
- `Fail Delivery`: available only for statuses where the UI expects backend failure handling.
- `Skip Delivery`: available only for statuses where the UI expects backend skip handling.

Fail, skip, and complete show a browser confirmation prompt before sending the request.

After a successful action, the dashboard refreshes:

- selected delivery detail,
- timeline,
- deliveries board,
- alerts panel.

If the backend rejects an action, treat it as expected operational feedback. The UI should show the returned error instead of changing state locally.

## Happy Path Demo Flow

The full backend happy path is:

```txt
CREATED -> ASSIGNED -> LOADING -> EN_ROUTE -> ARRIVED -> MEASURING -> AWAITING_OTP -> COMPLETED
```

The current scenario seeder does not create an `ASSIGNED` delivery for a complete first-step UI walkthrough. For a full happy-path transition demo, use a local delivery already in `ASSIGNED`, or run the backend verification script:

```bash
cd backend
npm run test:delivery
```

For a dashboard-focused happy-path inspection:

1. Seed scenarios.
2. Open the Operations Dashboard.
3. Search for the `completed delivery` scenario.
4. Open its drawer.
5. Inspect the completed status, latest event, and timeline.
6. Verify the timeline includes OTP verification and completion evidence.

For an OTP/completion action demo on an eligible delivery:

1. Open a delivery in `AWAITING_OTP`.
2. Enter the OTP code if one is available from dev OTP generation.
3. Click `Confirm OTP`.
4. Confirm the drawer refresh shows OTP as verified.
5. Click `Complete Delivery` only when enabled.
6. Confirm the drawer refresh shows `COMPLETED`.

## Failure And Alert Demo Flow

Use seeded operational-alert scenarios.

1. Seed scenarios.
2. Open the Operations Dashboard.
3. Check the Operational Alerts panel for alert candidates.
4. Click `stuck EN_ROUTE`, `MEASURING too long`, or `repeated OTP failures`.
5. Inspect active alerts and the chronological timeline in the drawer.
6. Use `Fail Delivery` on an allowed active status and confirm the prompt.
7. Confirm the drawer, board, and alert panel refresh after success.

For skipped-delivery review:

1. Search for `suspicious SKIPPED`.
2. Open the delivery drawer.
3. Inspect active alerts and timeline evidence.
4. Do not expect skip actions on terminal `SKIPPED`; the dashboard should treat it as inspect-only.

## Demo Checklist

- Backend `.env` has `DATABASE_URL`.
- Prisma Client generated.
- Database migrations applied.
- Backend running at `http://localhost:5000`.
- Frontend running at `http://localhost:5173`.
- `VITE_API_BASE_URL` points to the backend if the backend port is not `5000`.
- Scenario seeder completed and printed delivery IDs.
- Operations board loads deliveries.
- Alerts panel loads alert candidates.
- Delivery drawer opens from a delivery card.
- Drawer refresh works.
- Safe action prompts appear before fail, skip, and complete.
- Successful actions refresh drawer, timeline, board, and alerts.

## Known Limitations

- Dev endpoints are unauthenticated.
- Actor IDs are demo values.
- Scenario delivery IDs change every seed run.
- The seeder does not currently create an `ASSIGNED` delivery for a full UI happy path from the first driver step.
- Some operational actions require actor types such as `CUSTOMER`, `FLEET_HEAD`, or `ADMIN`; backend rules decide what is allowed.
- OTP codes are exposed by dev flows for local testing only.
- Measurement volume is derived from delivery event metadata where available; there is no dedicated measurement table yet.
- `orderId`, `requestId`, and some operational identifiers may be `null` because the current MVP schema does not have dedicated request/order tables.
- Alerts in `GET /dev/operations/alerts` are computed candidates; `POST /dev/deliveries/check-alerts` is the persistence-oriented dev operation.
- No production auth, maps, sockets, or alert resolution workflow exists yet.
- The final delivered operational state is represented as backend status `COMPLETED`.

## Quick Verification

Backend:

```bash
cd backend
npm run typecheck
npm run build
```

Frontend:

```bash
cd frontend
npm run typecheck
npm run build
```
