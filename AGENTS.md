# TankUp V3 — Agent Instructions

You are working on TankUp V3, a Nigeria-focused water tanker logistics MVP.

This is not a generic CRUD app. Treat it as operational logistics software.

## Current Stack

### Backend
- Node.js + TypeScript
- Express
- Prisma 7
- PostgreSQL / Supabase
- Zod for validation
- Strict TypeScript enabled
- Domain-oriented folder structure under `src/domains`

### Frontend
- Vite + React + TypeScript
- React Router
- TanStack React Query
- Axios
- Zustand
- Tailwind CSS v4

### Docs
The `docs/` folder is the source of business truth. Always read relevant docs before editing code.

Important docs:
- `docs/workflow.md`
- `docs/entities.md`
- `docs/statuses.md`
- `docs/transition-rules.md`
- `docs/delivery-proof.md`
- `docs/dispatch-model.md`
- `docs/domain-boundaries.md`
- `docs/audit-logging.md`
- `docs/operational-events.md`
- `docs/failure-scenarios.md`
- `docs/fraud-prevention.md`
- `docs/site-intelligence.md`
- `docs/payment-and-payout.md`
- `docs/mvp-scope.md`

## Non-Negotiable Product Rules

1. Server is the source of truth.
2. Statuses are operational law, not UI decorations.
3. No important status change should happen without:
   - validation,
   - event record,
   - audit log,
   - actor information.
4. Delivery proof must be layered. OTP alone is not enough.
5. Do not bypass delivery transition guards.
6. Do not directly mutate another domain's data from the wrong domain.
7. Do not build generic CRUD endpoints when a business operation endpoint is more appropriate.
8. Do not add clever abstractions before the MVP needs them.
9. Do not silently change money, delivery proof, dispute, assignment, or status logic.
10. Keep implementation simple, explicit, and inspectable.

## Current Backend Reality

The backend currently contains an early operational core:

- `Delivery`
- `DeliveryEvent`
- `AuditLog`
- `DeliveryStatus`
- `ActorType`
- `transitionDeliveryStatus()`
- `DELIVERY_TRANSITIONS`
- `/dev/deliveries/:id/transition`

The current status flow is:

```txt
CREATED → ASSIGNED → LOADING → EN_ROUTE → ARRIVED → MEASURING → AWAITING_OTP → COMPLETED
```

Terminal states:

```txt
COMPLETED
FAILED
SKIPPED
```

Do not introduce shortcuts like:

```txt
ARRIVED → COMPLETED
LOADING → COMPLETED
CREATED → COMPLETED
```

## Coding Style

- Prefer small domain services over giant route handlers.
- Prefer explicit state machines over scattered `if` statements.
- Use Zod schemas for request validation.
- Keep route files thin.
- Keep Prisma calls mostly inside services/repositories.
- Use transactions for multi-write business operations.
- Return predictable JSON response shapes.
- Avoid `any` unless there is a strong reason.
- Do not leak internal stack traces to API responses.
- Do not commit secrets or `.env` values.

## TypeScript Rules

The project uses strict TypeScript and `exactOptionalPropertyTypes`.

When an optional value may be absent, avoid passing `undefined` into Prisma data fields. Use `null` where the Prisma schema allows nullable values.

Example:

```ts
actorId: input.actorId ?? null
```

## Backend Testing Discipline

Before considering backend work done, run:

```bash
npm run typecheck
```

When possible, also run a dev/manual route check.

## Frontend Discipline

The frontend is currently mostly starter code. Build it gradually around real TankUp workflows, not random dashboard decorations.

Frontend should eventually expose:
- delivery request creation
- delivery status timeline
- driver/fleet/admin views later
- operational event visibility
- delivery proof state

For now, prioritize a clean MVP shell and API integration before fancy UI.

## Commit/PR Discipline

For every change, summarize:
- what changed,
- why it changed,
- what files were touched,
- how to test it,
- what risks remain.

## Forbidden Agent Behavior

Do not:
- rewrite the whole project without being asked,
- delete docs,
- weaken transition rules,
- remove audit/event writing,
- invent payment behavior not in docs,
- invent dispatch behavior not in docs,
- add large libraries without justification,
- create fake production credentials,
- modify `.env` secrets,
- hide failing type checks.
