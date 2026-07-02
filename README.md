# swim

UBC Aquatic Centre drop-in **Length Swim** schedule (25m/50m only) — a Java backend that fetches and caches the public UBC pm-feed, and a React frontend that displays it.

Also includes a **Pool** tab: pick a character, browse the real schedule to pick
a time slot and pool length, click a lane on an animated 10-lane pool to start a
swim, then log the distance you actually swam — persisted via a Spring
Data JPA + H2 backend. A **My Records** tab then shows your swim history (total
swims, distance, longest swim) in a card grid styled with an interactive,
cursor-reactive "fluid glass" (glassmorphism) effect that runs across every
page, not just Records.

## Structure

```
swim/
├── backend/   Spring Boot (Java 17, Maven) — schedule API + swim-record API (H2)
├── frontend/  Vite + React + TypeScript
└── infra/     AWS (S3 + CloudFront + EC2) deployment setup notes
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
                          │                  │
                          │      ┌───────────┴────────────┐
                          │      ▼                         ▼
                          │  aws s3 sync dist/ →     SSM RunCommand →
                          │  S3 bucket                EC2: docker pull
                          │      │                    + restart container
                          │      ▼                         │
                          │  CloudFront #1                 ▼
                          │  (frontend, HTTPS)        EC2 (Docker, :8080)
                          │      │                         ▲
                          │      ▼                         │
                          │  Browser (SPA) ──fetch──▶ CloudFront #2 ──┘
                          │                            (backend reverse
                          │                             proxy, HTTPS → :8080)
```

- **Backend**: containerized with Docker, deployed to a single **EC2**
  instance (Elastic IP, Amazon Linux 2023). The container always listens on
  `:8080`; deploys happen with no SSH and no stored AWS keys — GitHub
  Actions assumes an OIDC role and pushes the new container via **AWS
  Systems Manager (SSM RunCommand)**.
- **Backend reverse proxy**: a second **CloudFront distribution** sits in
  front of the EC2 instance as a TLS-terminating reverse proxy — it's a
  "custom origin" pointed at `<ec2-host>:8080` (HTTP only, no cert/domain
  needed on the EC2 side). This exists because the frontend is served over
  HTTPS and browsers block a HTTPS page from calling a plain `http://`
  backend ("mixed content"); CloudFront gives the backend a free HTTPS front
  door without standing up nginx/Let's Encrypt or owning a domain.
- **Frontend**: built as a static bundle and deployed to **S3 + CloudFront**
  (a separate, first CloudFront distribution) rather than run as a
  long-lived server — see `infra/AWS_SETUP.md` for the one-time AWS setup
  (OIDC role, bucket, distribution) and the reasoning.
- **CI/CD**: `.github/workflows/ci-cd.yml` builds and lints both apps on
  every push/PR, then (on `main`) builds + pushes Docker images to GHCR,
  redeploys the backend container on EC2 via SSM, and deploys the frontend
  to S3 with a CloudFront invalidation — all in one pipeline, no manual
  steps.

## Backend

Requires JDK 17+ and Maven.

```bash
cd backend
mvn spring-boot:run
```

Runs on `https://d1q6dtl87ueyeb.cloudfront.net` (always — in production this port is never
exposed directly to the internet; the CloudFront reverse proxy described
above is what the browser actually talks to). Endpoints:

- `GET /api/schedule` — cached schedule (refetches from UBC if the cache, default 10 min, is stale)
- `POST /api/schedule/refresh` — force a fresh fetch from UBC
- `GET /api/health` — health check
- `GET /api/swim-records` — the signed-in user's swim history, most recent first (powers the **My Records** tab)
- `GET /api/swim-records/occupied-lanes` — lanes (1–10) currently in use
- `POST /api/swim-records` — start a swim (character, pool length, optional lane)
- `PATCH /api/swim-records/{id}` — finish a swim, recording the distance actually swum
- `DELETE /api/swim-records/{id}` — delete a record

Social layer (all require a bearer token):

- `GET /api/friends` — accepted friends with live presence (`inPool`, `lane`, `poolLength` while they have an active swim)
- `GET /api/friends/search?q=` — find people by name/email (annotated with the current relationship)
- `GET/POST /api/friends/requests`, `POST /api/friends/requests/{id}/accept|decline`, `DELETE /api/friends/{userId}` — Instagram-style friend graph
- `GET /api/friends/{userId}/records` — a friend's swim history (friends only)
- `GET/POST /api/messages/{friendId}`, `GET /api/messages/unread` — direct messages between friends (polling chat)
- `GET/POST /api/invites`, `POST /api/invites/{id}/accept|decline` — "swim together" invites tied to a real schedule session; accepting notifies **both** users
- `GET /api/notifications`, `GET /api/notifications/unread-count`, `POST /api/notifications/read-all` — in-app notification feed (header bell)

The backend fetches 7 daily windows from `recreation.ubc.ca/pm-feed` concurrently, filters to only `Drop-in - 25m Length Swim` / `Drop-in - 50m Length Swim` sessions (excluding Aqua Fitness, Community Swim, Sensory-Sensitive, and 2STNB swims), and caches the merged result in memory.

Config lives in `backend/src/main/resources/application.properties` — notably
`app.cors.allowed-origins` (who's allowed to call the API) and
`app.schedule.cache-minutes`. CORS (`CorsConfig.java`) allows
`GET, POST, PATCH, PUT, DELETE` on `/api/**` — the wider method list (beyond
just `GET, POST`) exists because the swim-records API uses `PATCH` to finish
a swim, and browsers preflight that with an `OPTIONS` request that must also
pass CORS.

## Frontend

Requires Node 18+.

```bash
cd frontend
npm install
npm run dev
```

Runs on `https://du8yrnvuprbic.cloudfront.net` by default and expects the backend at `https://d1q6dtl87ueyeb.cloudfront.net` (override via `VITE_API_BASE_URL`, see `.env.example`). In production `VITE_API_BASE_URL` points at the **backend's CloudFront domain** (HTTPS), not the EC2 host/port directly — see Architecture above.

Features: sessions grouped by day, 25m/50m/all filter chips, manual refresh button, booking links straight to UBC's registration page, a Pool flow to log swims, and a My Records tab to review swim history. The whole UI uses a glassmorphism "fluid glass" treatment — frosted, blurred cards plus a pointer-reactive light trail (`FluidCursor`) that follows the cursor/finger across every page — over a dark, cinematic "Deep Water" theme (`src/theme.css`): a deep-navy backdrop with slowly drifting aurora light blobs, bold Sora display type, and micro-interactions on every control.

The 3D Pool scene (`Pool3D.tsx`) is a virtual UBC Aquatic Centre: the pool sits inside a natatorium shell with glass curtain walls and mullions, a wood-soffit roof band with skylight, exposed steel roof trusses, concrete columns, spectator bleachers, backstroke-flag lines, wall signage and a pace clock. The walls and roof are rendered front-side-only "dollhouse" style, so the orbit camera always sees into the hall. The water surface is a live vertex-animated ripple mesh.

A **Friends** tab makes the app social: search for swimmers, send/accept friend requests, open a friend's profile to browse their swim records and stats, chat with them (polling DM thread), and send a **swim-together invite** pinned to a real session from the UBC schedule. When the friend accepts, both users are notified via the header bell, the confirmed plan appears under "Swim plans" for both — and whenever a friend has an active swim, they appear **live in the 3D pool** in their actual lane with a floating name tag (plus an "in the pool now" badge on their friend card), so you can go find them in person.

## Docker

Run both apps with one command (builds images locally, persists the H2 file
under `backend/data/`):

```bash
docker compose up --build
```

Backend at `https://d1q6dtl87ueyeb.cloudfront.net`, frontend at `https://du8yrnvuprbic.cloudfront.net`.
Each app also has its own standalone `Dockerfile` if you only need one.

## CI/CD

`.github/workflows/ci-cd.yml` runs on every push/PR to `main`:

1. **backend-build** — `mvn package` (JDK 17)
2. **frontend-build** — `npm ci`, lint, type-check, `npm run build`, uploads
   `dist/` as an artifact
3. **docker-publish** (main only) — builds both Dockerfiles, pushes to
   `ghcr.io/<owner>/<repo>/swim-backend` and `swim-frontend`
4. **deploy-backend-ec2** (main only) — assumes the OIDC role, then uses
   `aws ssm send-command` to tell the EC2 instance to `docker pull` the new
   backend image and restart the container (no SSH, no stored keys; the
   data directory's permissions are reset on every deploy to avoid an H2
   file-lock crash loop)
5. **deploy-frontend-s3** (main only) — syncs the built frontend to S3 and
   invalidates the frontend's CloudFront distribution, authenticating via
   the same OIDC role

## AWS deployment

The frontend deploys as a static site to **S3 + CloudFront**. The backend
runs as a Docker container on a single **EC2** instance, fronted by a
*second*, independent CloudFront distribution acting purely as a TLS
reverse proxy (custom HTTP origin → EC2:8080, no caching) so the backend
gets HTTPS without a domain or a reverse-proxy server of its own. See
[`infra/AWS_SETUP.md`](infra/AWS_SETUP.md) for the one-time setup (bucket,
both distributions, EC2 instance + IAM instance profile, IAM OIDC role,
required GitHub secrets/variables) and the design reasoning.

## Notes

- Both apps are independent — no shared build step. Run them in two terminals
  (or via `docker compose up`).
- For production, `VITE_API_BASE_URL` (GitHub Actions variable) points at the
  backend's CloudFront HTTPS domain, and `app.cors.allowed-origins` (passed
  to the backend container as `APP_CORS_ALLOWED_ORIGINS`, via the
  `FRONTEND_ORIGIN` GitHub Actions variable) is set to the frontend's
  CloudFront HTTPS domain — each side's "origin" is the *other* CloudFront
  distribution's domain, not a raw IP/port.
