# Prompt 05 — Frontend API Client + React Query

Task:
Wire the frontend to the backend dev delivery routes.

Requirements:
- Add an API client using Axios.
- Read API base URL from `VITE_API_BASE_URL`, defaulting to `http://localhost:5000`.
- Add TanStack Query provider.
- Add hooks for:
  - list deliveries,
  - create delivery,
  - get delivery by id,
  - transition delivery.
- Keep all API code in a clear folder like `src/api` or `src/features/deliveries`.
- Do not mix API calls directly into large components.

After changes, run:

```bash
cd frontend
npm run build
```

Report changed files and build result.
