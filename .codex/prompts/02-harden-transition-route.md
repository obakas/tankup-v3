# Prompt 02 — Harden Delivery Transition Route

Read:
- `docs/transition-rules.md`
- `docs/audit-logging.md`
- `docs/operational-events.md`
- `backend/src/domains/delivery/delivery.service.ts`
- `backend/src/routes/dev.delivery.routes.ts`

Task:
Harden the delivery transition route without changing the core status flow.

Requirements:
- Add a Zod schema for the transition request body.
- Validate `to`, `actorType`, `actorId`, `reason`, and `metadata`.
- Return a clean 400 response for validation errors.
- Keep route handler thin.
- Do not weaken transition guards.
- Do not remove audit log creation.
- Do not remove delivery event creation.
- Do not introduce shortcuts to `COMPLETED`.

After changes, run:

```bash
cd backend
npm run typecheck
```

Report:
- files changed,
- test/typecheck result,
- any remaining risk.
