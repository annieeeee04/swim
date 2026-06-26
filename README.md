# swim

UBC Aquatic Centre drop-in **Length Swim** schedule (25m/50m only) — a Java backend that fetches and caches the public UBC pm-feed, and a React frontend that displays it.

Also includes a **Pool** tab: pick a character, browse the real schedule to pick
a time slot and pool length, click a lane on an animated 10-lane pool to start a
swim, then log the distance you actually swam — persisted via a Spring
Data JPA + H2 backend.

## Structure

```
swim/
├── backend/   Spring Boot (Java 17, Maven) — schedule API + swim-record API (H2)
├── frontend/  Vite + React + TypeScript
└── infra/     AWS (S3 + CloudFront) deployment setup notes
```

## Architecture

```
                ┌────────────────────┐
 GitHub push →  │  GitHub Actions CI │
                └─────────┬──────────┘
                          │
        ┌─────────────────┼──────────────────┐
        ▼                 ▼                  ▼
 mvn package        npm build/lint     docker build+push
 (backend)          (frontend)         (GHCR: backend + frontend images)
                          │
                          ▼
              aws s3 sync dist/ → S3 bucket
                          │
                          ▼
              CloudFront cache invalidation
                          │
                          ▼
                    Browser (SPA)  ──fetch──▶  Backend API (Spring Boot, Dockerized)
```

- **Backend**: containerized with Docker, runs anywhere a container can run
  (the H2 database file persists via a mounted volume).
- **Frontend**: built as a static bundle and deployed to **S3 + CloudFront**
  rather than run as a long-lived server — see `infra/AWS_SETUP.md` for the
  one-time AWS setup (OIDC role, bucket, distribution) and the reasoning.
- **CI/CD**: `.github/workflows/ci-cd.yml` builds and lints both apps on every
  push/PR, then (on `main`) builds + pushes Docker images to GHCR and deploys
  the frontend to S3 with a CloudFront invalidation.

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

## Docker

Run both apps with one command (builds images locally, persists the H2 file
under `backend/data/`):

```bash
docker compose up --build
```

Backend at `http://localhost:8080`, frontend at `http://localhost:5173`.
Each app also has its own standalone `Dockerfile` if you only need one.

## CI/CD

`.github/workflows/ci-cd.yml` runs on every push/PR to `main`:

1. **backend-build** — `mvn package` (JDK 17)
2. **frontend-build** — `npm ci`, lint, type-check, `npm run build`, uploads
   `dist/` as an artifact
3. **docker-publish** (main only) — builds both Dockerfiles, pushes to
   `ghcr.io/<owner>/<repo>/swim-backend` and `swim-frontend`
4. **deploy-frontend-s3** (main only) — syncs the built frontend to S3 and
   invalidates CloudFront, authenticating via OIDC (no stored AWS keys)

## AWS deployment

The frontend deploys as a static site to **S3 + CloudFront**. See
[`infra/AWS_SETUP.md`](infra/AWS_SETUP.md) for the one-time setup (bucket,
distribution, IAM OIDC role, required GitHub secrets) and the design reasoning.

## Notes

- Both apps are independent — no shared build step. Run them in two terminals
  (or via `docker compose up`).
- For production, set `VITE_API_BASE_URL` to wherever the backend is deployed, and update `app.cors.allowed-origins` to match wherever the frontend is hosted.
