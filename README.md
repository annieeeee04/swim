# swim

UBC Aquatic Centre drop-in **Length Swim** schedule (25m/50m only) — a Java backend that fetches and caches the public UBC pm-feed, and a React frontend that displays it.

## Structure

```
swim/
├── backend/   Spring Boot (Java 17, Maven) — GET /api/schedule
└── frontend/  Vite + React + TypeScript
```

## Backend

Requires JDK 17+ and Maven.

```bash
cd backend
mvn spring-boot:run
```

Runs on `http://localhost:8080`. Endpoints:

- `GET /api/schedule` — cached schedule (refetches from UBC if the cache, default 10 min, is stale)
- `POST /api/schedule/refresh` — force a fresh fetch from UBC
- `GET /api/health` — health check

The backend fetches 7 daily windows from `recreation.ubc.ca/pm-feed` concurrently, filters to only `Drop-in - 25m Length Swim` / `Drop-in - 50m Length Swim` sessions (excluding Aqua Fitness, Community Swim, Sensory-Sensitive, and 2STNB swims), and caches the merged result in memory.

Config lives in `backend/src/main/resources/application.properties` — notably `app.cors.allowed-origins` (who's allowed to call the API) and `app.schedule.cache-minutes`.

## Frontend

Requires Node 18+.

```bash
cd frontend
npm install
npm run dev
```

Runs on `http://localhost:5173` by default and expects the backend at `http://localhost:8080` (override via `VITE_API_BASE_URL`, see `.env.example`).

Features: sessions grouped by day, 25m/50m/all filter chips, manual refresh button, booking links straight to UBC's registration page.

## Notes

- Both apps are independent — no shared build step. Run them in two terminals.
- For production, set `VITE_API_BASE_URL` to wherever the backend is deployed, and update `app.cors.allowed-origins` to match wherever the frontend is hosted.
