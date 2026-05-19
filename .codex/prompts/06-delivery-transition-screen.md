# Prompt 06 — Delivery Transition Testing Screen

Task:
Build a dev-only delivery transition testing screen.

Requirements:
- List deliveries from backend.
- Allow creating a test delivery.
- Allow selecting one delivery.
- Show delivery status.
- Show valid next statuses based on the frontend copy of the backend transition map.
- Allow transition with actorType, actorId, reason.
- Show events and audit logs for selected delivery.
- Display failed transition errors clearly.

Important:
- The frontend may suggest valid next statuses, but the backend remains the source of truth.
- Do not let UI logic replace backend guards.

After changes, run:

```bash
cd frontend
npm run build
```

Report changed files and build result.
