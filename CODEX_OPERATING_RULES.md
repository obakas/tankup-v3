# Codex Operating Rules for Obaka

## How to Use Codex Without Creating Beautiful Chaos

Use Codex in small missions.

Bad prompt:

```txt
Build the TankUp backend.
```

Good prompt:

```txt
Read docs/transition-rules.md and backend/src/domains/delivery. Add Zod validation to the transition route only. Do not change the status machine. Run npm run typecheck.
```

## Your Review Checklist

Before accepting Codex changes, check:

- Did it touch only the files it needed?
- Did it weaken a business rule?
- Did it add fake abstractions?
- Did it duplicate logic?
- Did it bypass audit logs or events?
- Did typecheck/build pass?
- Did it invent future features not requested?
- Did it modify `.env`?

## Best First Workflow

1. Ask Codex to inspect and summarize.
2. Ask it to change one bounded thing.
3. Run typecheck/build.
4. Review diff manually.
5. Commit only if clean.
6. Move to the next bounded task.

## Suggested Commit Style

```txt
feat(delivery): add zod validation for transition route
fix(delivery): preserve transition guard under strict ts
chore(frontend): replace vite starter with tankup shell
```

## Golden Rule

Let Codex write code.

Do not let Codex decide the business.
