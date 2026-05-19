# TankUp V3 — Codex Start Here

## What This Project Is

TankUp V3 is a water tanker logistics MVP for Nigeria. The product coordinates customers, tanker drivers, fleet heads, delivery proof, payments, disputes, site difficulty, and dispatch operations.

The real product is not just water ordering. The real product is operational trust.

## Current Repository State

### Backend
The backend already has a small operational delivery core:

```txt
backend/
  prisma/schema.prisma
  src/app.ts
  src/server.ts
  src/lib/prisma.ts
  src/routes/dev.delivery.routes.ts
  src/domains/delivery/delivery.rules.ts
  src/domains/delivery/delivery.service.ts
  src/domains/audit/audit.service.ts
  src/events/eventBus.ts
  src/events/eventTypes.ts
```

Current implemented model:

```txt
Delivery
DeliveryEvent
AuditLog
```

Current implemented operation:

```txt
transitionDeliveryStatus()
```

### Frontend
The frontend is still a Vite starter shell and needs to be replaced with the TankUp MVP shell.

### Docs
The docs are currently the strongest part of the project. Use them as the operating manual.

## First Engineering Goal

Do not rush into big features.

First goal:

```txt
stabilize the operational delivery core
```

That means:
- validate transition requests with Zod,
- clean dev routes,
- add proper response shape,
- add delivery creation route for testing,
- ensure events and audit logs are consistently written,
- add a minimal frontend dashboard to exercise the backend.

## Suggested First 7 Codex Tasks

1. Harden backend TypeScript config and typecheck flow.
2. Add Zod validation for delivery transition route.
3. Add a dev route to create a test delivery.
4. Add a dev route to list delivery with events and audit logs.
5. Replace frontend starter page with TankUp operational dashboard shell.
6. Add frontend API client and React Query provider.
7. Add a delivery transition testing screen.

## Important Warning

Do not implement payment, dispatch, fraud, or full site intelligence yet.

Those are serious operational domains. Scaffold them only after the delivery state machine is stable.
