# UBC Length Swim

A full-stack swim tracker for the UBC Aquatic Centre — live drop-in schedule, a virtual 3D pool, social layer, and a conversational AI Swim Coach.

**Live:** [https://du8yrnvuprbic.cloudfront.net](https://du8yrnvuprbic.cloudfront.net)

---

## Table of Contents

1. [Overview](#overview)
2. [Structure](#structure)
3. [Architecture](#architecture)
4. [Features](#features)
5. [Backend API](#backend-api)
6. [Frontend](#frontend)
7. [Agentic Layer — Swim Coach](#agentic-layer--swim-coach)
8. [Authentication & OAuth](#authentication--oauth)
9. [Docker](#docker)
10. [CI/CD](#cicd)
11. [AWS Deployment](#aws-deployment)
12. [Notes](#notes)

---

## Overview

UBC Length Swim ingests the public UBC `pm-feed` schedule, filters it to drop-in 25m/50m Length Swim sessions, and presents a full swim-logging experience: pick a character, choose a lane in an animated 10-lane 3D pool, log the distance you swam, and review your history in a glassmorphism "My Records" dashboard. A social layer lets you find friends, chat, watch them appear live in the pool, and send swim-together invites. A conversational **Swim Coach** agent on top of all of it answers questions and orchestrates multi-step actions in plain English over streaming SSE.

---

## Structure

```
swim/
├── backend/   Spring Boot (Java 17, Maven) — schedule + swim-record + social + agent APIs
├── frontend/  Vite + React 19 + TypeScript
├── infra/     AWS setup notes, IAM policy, agent architecture doc
└── docs/      Additional project documentation
```

---

## Architecture

```
                ┌────────────────────┐
 GitHub push →  │  GitHub Actions CI │
                └─────────┬──────────┘
                          │
        ┌─────────────────┼──────────────────┐
        ▼                 ▼                  ▼
 mvn package        npm build/lint     docker build+push
 (backend)          (frontend)         (GHCR: backend image)
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

**Backend** — containerized with Docker, deployed to a single EC2 instance (Elastic IP, Amazon Linux 2023). Deploys happen via **AWS SSM RunCommand** with no SSH and no stored AWS keys — GitHub Actions assumes an OIDC role.

**Backend reverse proxy** — a second CloudFront distribution sits in front of EC2 as a TLS-terminating reverse proxy (`custom origin → EC2:8080`). This gives the backend a free HTTPS front door without nginx or a domain name, which is necessary because browsers block mixed-content requests from an HTTPS page to a plain HTTP backend.

**Frontend** — built as a static bundle deployed to S3 + CloudFront. See [`infra/AWS_SETUP.md`](infra/AWS_SETUP.md) for the one-time setup.

**CI/CD** — `.github/workflows/ci-cd.yml` runs on every push/PR, deploying to production on pushes to `master`.

---

## Features

| Tab | What it does |
|-----|-------------|
| **Schedule** | Live UBC drop-in schedule (25m/50m), grouped by day with filter chips and direct booking links |
| **Pool** | Animated 3D natatorium — pick a character, select a lane, log your swim distance |
| **Friends** | Search swimmers, send/accept friend requests, open a friend's profile, chat, send swim-together invites |
| **Ranking** | Daily leaderboard — ranked by total distance swum that day |
| **My Records** | Your personal swim history (distance, streak, longest swim) in a glassmorphism card grid |
| **Coach** | Conversational AI agent — ask anything about your swims in natural language |

**Character Studio** — the Pool tab's character picker includes a pose selector (Stand / Swim / Climb), a size slider, and a motion toggle. Characters without a 3D model fall back to the 2D `SwimmerAvatar` SVG component and are tagged "2D only".

**Real-time** — one auto-reconnecting WebSocket per session delivers chat messages, notifications, invite updates and pool presence the instant they happen. REST polling runs in the background as a fallback.

---

## Backend API

Requires JDK 17+ and Maven.

```bash
cd backend
mvn spring-boot:run
```

Runs locally on `:8080`. In production, the backend is accessed via `https://d1q6dtl87ueyeb.cloudfront.net`.

### Schedule

| Method | Path | Description |
|--------|------|-------------|
| `GET` | `/api/schedule` | Cached schedule (refetches from UBC if stale, default 10 min) |
| `POST` | `/api/schedule/refresh` | Force a fresh fetch from UBC |
| `GET` | `/api/health` | Health check |

### Swim Records (requires bearer token)

| Method | Path | Description |
|--------|------|-------------|
| `GET` | `/api/swim-records` | Signed-in user's swim history, most recent first |
| `GET` | `/api/swim-records/occupied-lanes` | Lanes (1–10) currently in use |
| `POST` | `/api/swim-records` | Start a swim (character, pool length, optional lane) |
| `PATCH` | `/api/swim-records/{id}` | Finish a swim (record distance) |
| `DELETE` | `/api/swim-records/{id}` | Delete a record |

### Social (requires bearer token)

| Method | Path | Description |
|--------|------|-------------|
| `GET` | `/api/friends` | Accepted friends with live presence (`inPool`, `lane`, `poolLength`) |
| `GET` | `/api/friends/search?q=` | Find people by name/email |
| `GET/POST` | `/api/friends/requests` | Send / list friend requests |
| `POST` | `/api/friends/requests/{id}/accept\|decline` | Accept or decline a request |
| `DELETE` | `/api/friends/{userId}` | Remove a friend |
| `GET` | `/api/friends/{userId}/records` | A friend's swim history (friends only) |
| `GET/POST` | `/api/messages/{friendId}` | Read / send direct messages |
| `GET` | `/api/messages/unread` | Unread message count |
| `GET/POST` | `/api/invites` | Create / list swim-together invites |
| `POST` | `/api/invites/{id}/accept\|decline` | Accept or decline an invite |
| `GET` | `/api/notifications` | In-app notification feed |
| `GET` | `/api/notifications/unread-count` | Bell badge count |
| `POST` | `/api/notifications/read-all` | Mark all as read |
| `WS` | `/ws` | Real-time push channel (first-message bearer auth) |

### Agent

| Method | Path | Description |
|--------|------|-------------|
| `GET` | `/api/agent/status` | Whether the Coach is enabled |
| `POST` | `/api/agent/chat` | Streaming SSE chat endpoint (conversational Coach) |

---

## Frontend

Requires Node 18+.

```bash
cd frontend
npm install
npm run dev
```

Runs on `http://localhost:5173` by default; expects the backend at `VITE_API_BASE_URL` (see `.env.example`). In production this points at the backend's CloudFront HTTPS domain.

The UI uses a glassmorphism "fluid glass" treatment — frosted blurred cards, a pointer-reactive light trail (`FluidCursor`), and a cinematic "Deep Water" dark theme (`src/theme.css`): deep-navy backdrop, drifting aurora light blobs, Sora display type, micro-interactions on every control.

The **3D Pool** (`Pool3D.tsx`) is a virtual UBC Aquatic Centre: glass curtain walls, a wood-soffit roof with skylight, exposed steel roof trusses, concrete columns, spectator bleachers, backstroke-flag lines, wall signage, pace clock, and a live vertex-animated ripple water surface. The scene is rendered dollhouse-style (front-side-only walls) so the orbit camera always sees into the hall.

---

## Agentic Layer — Swim Coach

> **Status: PROPOSAL / MVP deployed** · Author: Annie Zhang · Last updated: July 5, 2026

### Context & Objectives

The Swim Coach agent adds a conversational, autonomous layer on top of the existing full-stack application without rewriting any core services. It turns click-driven actions into a natural-language interface. The guiding design principle is:

> **The agent gets no new powers — it orchestrates the tools you already have.**

Every capability is a thin wrapper over existing domain services (`UbcFeedService`, `SwimRecordRepository`, leaderboard logic, user profile). The agent is entirely isolated in `com.annie.swim.agent`, gated behind `app.agent.enabled=false` so the app compiles and deploys cleanly without it.

### System Architecture

```
[ React SPA (Vite + TypeScript) ]
    │   ▲
    │   │  SSE token stream / structured cards
    ▼   │
[ Spring Boot REST API Backend ]
    │
    ├──> [ AgentController  POST /api/agent/chat ]
    │       │
    │       ├──> [ AgentOrchestrator ]
    │       │       │
    │       │       ├──> [ Guardrails & Validation ]
    │       │       └──> [ Tool / Skill Registry ]
    │       │               │
    │       │               └──> Core Services:
    │       │                    UbcFeedService, SwimRecordRepository, …
    │       │
    │       └──> [ Anthropic Claude API (LlmClient) ]
    │
    └──> [ H2 / JPA Database ]
```

**Components:**

- **AgentController** (`POST /api/agent/chat`) — exposes the execution endpoint and establishes an SSE pipeline to stream partial tokens and interactive structured cards to the frontend.
- **AgentOrchestrator** — manages the Perceive → Reason → Act → Observe lifecycle loop.
- **Tool/Skill Registry** — auto-discovers Spring beans implementing the `Skill` interface, compiling JSON schemas to pass to the LLM for tool selection.
- **Router / Sub-agents** — classifies user intent and delegates to specialized sub-agent layers (Coach, Analyst, Scheduler) to keep system prompts small and reasoning deterministic.

### Skill Interface

Every capability registered with the agent implements:

```java
public interface Skill {
    String name();            // e.g. "schedule.find_sessions"
    String description();     // Fed directly to the LLM for tool selection
    JsonSchema parameterSchema();   // Validated before execute() runs
    SkillResult execute(SkillContext ctx, JsonNode args);
}
```

Currently deployed skills: `ScheduleSkill` (find sessions by pool / time / day), `ProgressSkill` (personal swim stats and streaks).

### Data Model

Four tables support conversational history, background execution, and observability:

| Table | Purpose |
|-------|---------|
| `conversation` | Chat threads mapped to a `userId` |
| `conversation_message` | Individual turns (user messages, assistant text) |
| `agent_step` | Audit log: tool calls, arguments, observations, token usage, latency |
| `scheduled_agent` | Background cron configs for user subscriptions (e.g. weekly briefings) |

### Cross-Cutting Concerns

**Scalability** — Tool execution results are cached within a single conversational turn. A hard-capped step budget prevents runaway tool-call loops.

**Reliability** — A validation filter wraps every execution step, checking LLM-produced arguments against the skill's registered JSON schema before any code runs. Safety boundaries handle content filtering, domain verification, and age-aware advice restrictions.

**Observability** — The `agent_step` table captures and replays broken execution flows deterministically. Frontend type safety is enforced with `tseslint.configs.strictTypeChecked` across all `*.{ts,tsx}` files.

**Feature flag** — Set `app.agent.enabled=false` to unload the entire agent package. The core React tabs continue over Vite with HMR, with no dependency on any LLM endpoint.

### Alternatives Considered

**Frontend-only agent (Next.js edge / React)** — Rejected: exposes DB schemas, system prompts, and API credentials to the public client; prevents background cron jobs when the browser is closed.

**Single master system prompt (no sub-agents)** — Rejected: token consumption grows with the tool registry, degrading reasoning quality and increasing hallucination rate. The Orchestrator/Router pattern partitions prompts and toolsets into isolated sub-agent scopes.

### Roadmap

| Phase | Scope |
|-------|-------|
| **Phase 1 — MVP** | Single-agent backend, `ScheduleSkill` + `ProgressSkill`, streaming Coach tab in React |
| **Phase 2 — v2** | Orchestrator/Router with sub-agent boundaries, `WorkoutSkill`, `@Scheduled` background briefing |
| **Phase 3 — v3** | Expose the tool registry as an **MCP server** adapter — making internal app tools consumable by external clients (Claude Desktop, Cursor, etc.) |

**Rollback** — Toggle `app.agent.enabled=false` in `application.properties` (or the Docker env var `APP_AGENT_ENABLED=false`). The rest of the app is unaffected.

---

## Authentication & OAuth

Email/password accounts are supported out of the box. Third-party login is available via:

- **Google** — requires `APP_OAUTH_GOOGLE_CLIENT_ID` + `APP_OAUTH_GOOGLE_CLIENT_SECRET` environment variables (set as GitHub Secrets for CI/CD)
- **Facebook** — requires `APP_OAUTH_FACEBOOK_CLIENT_ID` + `APP_OAUTH_FACEBOOK_CLIENT_SECRET`; redirect URI must be registered in the Meta Developer Console as `https://d1q6dtl87ueyeb.cloudfront.net/api/auth/oauth/facebook/callback`

Both providers redirect back to `/api/auth/oauth/{provider}/callback`, which exchanges the code for a profile, mints a local bearer token, and bounces the browser to the SPA via a URL hash fragment (`#token=…`).

Tokens are stored in `localStorage` as `swim.token` and sent as `Authorization: Bearer <token>` on every authenticated request. Social login is 501 Not Implemented when the corresponding client-id env var is blank.

---

## Docker

Run both apps with one command (builds images locally, persists the H2 file under `backend/data/`):

```bash
docker compose up --build
```

Each app also has its own standalone `Dockerfile` if you only need one.

---

## CI/CD

`.github/workflows/ci-cd.yml` runs on every push/PR to `master`:

1. **backend-build** — `mvn package` (JDK 17)
2. **frontend-build** — `npm ci`, lint, type-check, `npm run build`, uploads `dist/` as an artifact
3. **docker-publish-backend** (master only) — builds the backend Dockerfile, pushes to `ghcr.io/<owner>/<repo>/swim-backend`
4. **deploy-backend-ec2** (master only) — assumes the OIDC role, uses `aws ssm send-command` to pull and restart the container on EC2 (no SSH, no stored keys; data directory permissions reset on each deploy)
5. **deploy-frontend-s3** (master only) — syncs the built frontend to S3 and invalidates the frontend's CloudFront distribution

The `master` branch is protected — all changes require a PR with 2 passing CI checks before merging.

**Required GitHub Secrets / Variables:**

| Key | Type | Purpose |
|-----|------|---------|
| `AWS_DEPLOY_ROLE_ARN` | Secret | OIDC role for S3 + SSM access |
| `AWS_REGION` | Secret | e.g. `us-east-1` |
| `EC2_INSTANCE_ID` | Secret | Target EC2 instance |
| `S3_BUCKET` | Secret | Frontend S3 bucket name |
| `CLOUDFRONT_DISTRIBUTION_ID` | Secret | Frontend CloudFront distribution |
| `GOOGLE_CLIENT_ID` | Secret | Google OAuth |
| `GOOGLE_CLIENT_SECRET` | Secret | Google OAuth |
| `FACEBOOK_CLIENT_ID` | Secret | Facebook OAuth |
| `FACEBOOK_CLIENT_SECRET` | Secret | Facebook OAuth |
| `FRONTEND_ORIGIN` | Variable | e.g. `https://du8yrnvuprbic.cloudfront.net` |
| `VITE_API_BASE_URL` | Variable | e.g. `https://d1q6dtl87ueyeb.cloudfront.net` |

---

## AWS Deployment

The frontend deploys as a static site to **S3 + CloudFront**. The backend runs as a Docker container on a single **EC2** instance, fronted by a second, independent CloudFront distribution acting purely as a TLS reverse proxy (custom HTTP origin → EC2:8080, no caching) so the backend gets HTTPS without a domain or a reverse-proxy server.

See [`infra/AWS_SETUP.md`](infra/AWS_SETUP.md) for the one-time setup (bucket, both distributions, EC2 instance + IAM instance profile, IAM OIDC role, required GitHub secrets/variables) and the design reasoning.

---

## Notes

- Both apps are independent — no shared build step. Run them in two terminals or via `docker compose up`.
- For production, `VITE_API_BASE_URL` points at the backend's CloudFront HTTPS domain, and `APP_CORS_ALLOWED_ORIGINS` is set to the frontend's CloudFront HTTPS domain — each side's "origin" is the other distribution's domain, not a raw IP/port.
- The H2 database persists to `/app/data/swim.mv.db` inside the container, mounted from `/home/ec2-user/swim-data` on the EC2 host.
- VS Code users: select "Use Workspace Version" for TypeScript (Cmd+Shift+P → "TypeScript: Select TypeScript Version") to avoid false tsconfig errors from the built-in older TypeScript version.
