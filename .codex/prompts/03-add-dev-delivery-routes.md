# Prompt 03 — Add Safe Dev Delivery Routes

Read:
- `backend/prisma/schema.prisma`
- `backend/src/routes/dev.delivery.routes.ts`
- `backend/src/domains/delivery/delivery.service.ts`

Task:
Add safe development routes to help manually test the delivery engine.

Add:

```txt
POST /dev/deliveries
GET /dev/deliveries
GET /dev/deliveries/:id
```

Requirements:
- `POST /dev/deliveries` creates a delivery with optional customerId, driverId, tankerId, siteId.
- `GET /dev/deliveries` lists latest deliveries.
- `GET /dev/deliveries/:id` includes events and audit logs.
- Use Zod validation.
- Keep routes dev-only under `/dev`.
- Do not add production auth yet.
- Do not add payment or dispatch logic.

After changes, run:

```bash
cd backend
npm run typecheck
```

Report changed files and test result.
