# PLACE-037 — Production Deployment Target and Monitoring Provider Decision Gate

- **Date:** 2026-07-25
- **Authority:** Owner explicit instruction — "PLACE-037 — Production Deployment Target and Monitoring Provider Decision Gate". Decision and planning task only. No deployment, no cloud provisioning, no purchases, no DNS changes, no monitoring integration, no source/config changes.
- **Repository:** `D:\Projects\PhuQuocHub` (branch `master`)

---

## 1. Executive Summary

PhuQuocHub has, as of PLACE-036, a **locally verified, production-shaped Docker Compose stack** (`docker-compose.prod.yml`) that builds and boots real production images for the API and web app, connects them to real Postgres/PostGIS/Redis, and passes health checks — all confirmed live, repeatedly, across PLACE-026 through PLACE-036. **None of this has ever run outside this machine.** There is no provisioned VPS, no domain, no TLS, no reverse proxy, no monitoring, and no verified path to Hostinger specifically. The target architecture is already designed in detail (`docs/architecture/deployment.md`) but explicitly self-labeled as **mostly unimplemented** — a target design, not a status report.

This gate's job is to turn that design into a small number of concrete, evidence-based recommendations the Owner can act on, without inventing facts about services (Hostinger, Sentry, Prometheus) this repository has no way to verify directly.

**Bottom line recommendation:** a **single Hostinger VPS running the existing `docker-compose.prod.yml` stack**, fronted by a minimal reverse proxy for TLS, is the correct initial topology — it reuses infrastructure that is *already built and verified*, matches the project's actual current scale (no real users yet), and keeps rollback to the proven "redeploy the previous image tag" mechanism already rehearsed three times this session (PLACE-031, PLACE-032, PLACE-036). For monitoring, the correct initial stack is **infrastructure-native monitoring (Docker healthchecks + structured logs + one external uptime check)** — not Sentry, not Prometheus/Grafana — because the application has zero real users, the correlation-ID/structured-logging foundation (PLACE-030) already gives meaningful debuggability, and every heavier option requires either an SDK/code change (Sentry) or nontrivial new infrastructure (Prometheus/Grafana) that is not yet justified.

**Gate result: `READY WITH CONDITIONS`** — see §30 and §31.

---

## 2. Gate Status

`READY WITH CONDITIONS`. Deployment-model comparison, topology recommendation, resource sizing, backup/migration/secrets strategy, and a minimum monitoring stack can all be recommended today from repository evidence. The conditions are entirely Owner-side account/budget facts this repository cannot verify (see §25) — none of them are missing repository evidence.

---

## 3. Preflight

| Check | Result |
|---|---|
| Repository root | `D:\Projects\PhuQuocHub` |
| Branch | `master` |
| HEAD | `1e68481` |
| Working tree | clean |
| Git remotes | none configured |
| `current.task` | `none` — authorizes PLACE-037 |
| PLACE-032 | completed (NestJS 10→11 migration) |
| PLACE-033 | read-only assessment, no task file (established precedent, findings persisted in PLACE-034) |
| PLACE-034 | draft decision gate, `draft_pending_owner_authorization` (expected — never meant to reach `completed`) |
| PLACE-035 | completed (Next.js 14→16 migration) |
| PLACE-036 | completed, decision `STABILIZED WITH BOUNDED FOLLOW-UPS` |
| Current stable frontend baseline | Next.js `16.2.11` (per `docs/delivery/reports/PLACE-036-NEXTJS-16-BASELINE-DECLARATION-2026-07-25.md`) |
| Current stable backend baseline | NestJS `11.1.28` (per PLACE-032) |
| Node.js | `v20.20.2` |
| npm | `10.8.2` |
| Docker | `29.6.2` |
| Docker Compose | `v5.3.1` |
| Local service health | `phuquoc-postgres`/`-redis`/`-minio` all healthy (dev stack) |
| Production Dockerfiles | `apps/api/Dockerfile`, `apps/web/Dockerfile` — both exist, both build and boot successfully (verified repeatedly, most recently in PLACE-036) |
| Compose files | `docker-compose.yml` (dev dependencies only), `docker-compose.prod.yml` (full prod-shaped stack: postgres+redis+minio+api+web) |
| CI/CD config | `.github/workflows/ci.yml` — lint/typecheck/build/test job + a `docker-build` job that builds both images, boots them, and curls `/api/health`; a GHCR-push step exists but has **never run** (no git remote in this repository) |
| Deployment documentation | `docs/architecture/deployment.md` — a **500+ line target design**, explicitly self-labeled "phần lớn CHƯA triển khai" (mostly not yet implemented); §15 lists exactly 9 pre-production Owner decisions, all still open |
| Monitoring documentation | `deployment.md §12` designs a 7-domain Prometheus/Grafana/Sentry stack — **design only**, zero monitoring dependency in any `package.json`, confirmed via grep |
| Environment templates | `.env.example` — reasonably complete, documents `S3_*` vars as "used from Sprint 5" (i.e., not yet) |
| Health endpoints | `GET /api/health` — combined liveness+readiness, checks Postgres (`TypeOrmHealthIndicator`) + Redis (`RedisHealthIndicator`); no object-storage check (object storage isn't wired into application code at all — see §6) |
| Logging / correlation-ID | `AppLoggerService` wired as the active NestJS logger (PLACE-030); `correlation-id.middleware.ts` attaches `X-Request-Id` to every request, propagated into `meta.requestId` and every structured log line; sensitive-key redaction confirmed |
| Rollback documentation | `docs/delivery/RELEASE-ROLLBACK-RUNBOOK.md` (PLACE-031) — rehearsed three separate times (PLACE-031, PLACE-032, PLACE-036), each with real data-continuity proof |

**No `BLOCKED` condition triggers.** The working tree is clean and does not make this assessment unreliable.

---

## 4. Current Production Architecture

Evidence-based inventory of every service the application actually requires, derived from `docker-compose.prod.yml`, `apps/api/src/core/config/env.validation.ts`, and direct source inspection — not from `deployment.md`'s target design, which includes components (PgBouncer, a BullMQ worker, Cloudflare, nginx) that **do not exist in code today**.

| Component | Mandatory for initial launch? | Deferrable? | Containerized today? | Persistent storage? | Public exposure? | Private networking? | Health check exists? | Rollback-affecting? |
|---|---|---|---|---|---|---|---|---|
| Next.js web (`apps/web`) | Yes | No | Yes (`apps/web/Dockerfile`, verified) | No (stateless) | Yes | — | Implicit (HTTP 200 on `/`) | Yes — image-tag rollback |
| NestJS API (`apps/api`) | Yes | No | Yes (`apps/api/Dockerfile`, verified) | No (stateless) | Yes (behind proxy) | Yes (to DB/Redis) | Yes, `GET /api/health` | Yes — image-tag rollback |
| PostgreSQL + PostGIS | Yes | No | Yes (`postgis/postgis:16-3.4` in `docker-compose.prod.yml`) | Yes (`pg_data_prod` volume) | No | Yes | Yes, `pg_isready` | Yes — but via DB restore, not container rollback (see §21) |
| Redis | Yes | No | Yes (`redis:7-alpine`) | Yes (`redis_data_prod` volume, AOF enabled) | No | Yes | Yes, `redis-cli ping` | Partial — cache/session loss on restart is tolerable, not data-loss |
| MinIO / object storage | **No — not wired into application code** | Yes, indefinitely until file-upload work begins | Yes (container exists in compose) but **application never calls it** — zero `S3_*`/`@aws-sdk`/`minio` reference anywhere in `apps/api/src` | Yes (`minio_data_prod` volume) | No | Yes | Yes, `mc ready local` | N/A — unused |
| Reverse proxy (nginx/Caddy/provider-managed) | Yes, for real TLS | No | **Does not exist** — `infrastructure/nginx/` contains only `.gitkeep` | No | Yes | — | N/A | Yes — TLS/routing layer |
| TLS termination | Yes | No | **Not implemented anywhere** | — | — | — | — | — |
| DNS | Yes | No | **Not applicable to this repo** — no domain referenced anywhere except placeholder `phuquochub.*` examples in `deployment.md` | — | — | — | — | — |
| Persistent volumes | Yes (Postgres, Redis, MinIO) | — | Yes, named Docker volumes in `docker-compose.prod.yml` | Yes | — | — | — | Yes |
| Migration execution | Yes | No | Runs via `npm run migration:run` (TypeORM CLI against `apps/api/src/core/database/data-source.ts`), **not** automatically at container boot (`migrationsRun: false` in `database.module.ts:25`) | — | — | — | — | Yes — see §12 |
| Background jobs | **None exist** | N/A | `deployment.md`'s BullMQ worker is target design only — grep confirms zero `bullmq` reference in `apps/api/src` or any `package.json` | — | — | — | — | N/A |
| Scheduled jobs | **None exist** | N/A | No cron/scheduler code found anywhere in `apps/api/src` | — | — | — | — | N/A |
| Email provider | **None exists** | N/A | No email-sending code or dependency found | — | — | — | — | N/A |
| External API dependencies | Map tiles only | Yes | `NEXT_PUBLIC_MAP_TILE_URL` defaults to public OpenStreetMap tiles (`apps/web/src/modules/map/MapView.tsx` reads it); MapTiler is an optional, unconfigured upgrade | — | — | — | — | No |
| File-upload paths | **None exist** | N/A | No multipart/upload endpoint found in `apps/api/src` | — | — | — | — | N/A |
| Image-delivery paths | Plain `<img src>` to externally-hosted URLs only | N/A | Confirmed in PLACE-036: `next/image` is unused; images are always external-host `<img>` tags | — | — | — | — | N/A |
| Application logs | Yes | No | stdout, `AppLoggerService` (structured JSON-ish, redacted) | No (ephemeral unless collected) | No | — | N/A | No |
| Infrastructure logs | Yes | No | Docker's default `json-file` log driver (no rotation configured — see §16) | No | No | — | N/A | No |
| Health checks | Yes | No | `GET /api/health` (API); implicit `GET /` 200 (web); Docker Compose `healthcheck:` blocks on all 3 data services | — | — | — | Yes | Yes |
| Secrets / env vars | Yes | No | `.env` file (gitignored), `docker-compose.prod.yml`'s `${VAR:-default}` interpolation | No | — | — | — | Yes |

**Not invented:** PgBouncer, Cloudflare, BullMQ, a `worker` service/image, Prometheus, Grafana, Sentry, and nginx all appear in `deployment.md`'s target diagram but have **zero corresponding code, config, or dependency** in this repository today. They are correctly excluded from "currently required services" and are addressed separately as deferred/future items where relevant.

---

## 5. Current Deployment Readiness

| Area | Classification | Evidence |
|---|---|---|
| `apps/api/Dockerfile` | **production-ready** | Multi-stage, `dumb-init` PID 1 for signal handling, non-root `node` user, prod-only deps in runtime layer; built and booted repeatedly (PLACE-026, -028, -029, -030, -031, -032) against real Postgres/Redis with clean health checks |
| `apps/web/Dockerfile` | **production-ready** | Multi-stage, Next.js `output:'standalone'`, non-root `node` user, `--chown=node:node` on runtime COPY (PLACE-036 fix); built/booted repeatedly, byte-identical reproducibility proven in PLACE-036 |
| `docker-compose.prod.yml` | **ready with configuration** | Structurally sound and verified locally end-to-end; every secret-bearing value uses a `${VAR:-dev-placeholder}` pattern that **must** be overridden via a real `.env` before any real deploy — this is by design, not a defect |
| Production start commands | **production-ready** | `node dist/main.js` (API, via `dumb-init`), `node apps/web/server.js` (web, via Next standalone `server.js`) — both verified |
| Standalone Next.js output | **production-ready** | Confirmed working, `.next/standalone` + `.next/static` + `public` all correctly assembled (PLACE-035/036) |
| NestJS compiled output | **production-ready** | `nest build` → `dist/main.js`, verified booting cleanly every PLACE task this session |
| Environment-variable validation | **production-ready** | `env.validation.ts` — Joi schema, `abortEarly:false`; `DB_HOST`/`DB_USER`/`DB_PASSWORD`/`DB_NAME`/`CORS_ALLOWED_ORIGINS`/`JWT_ACCESS_SECRET`/`JWT_REFRESH_SECRET` all fail-fast when missing in `NODE_ENV=production` (PLACE-028, PLACE-029) — closes the exact "permissive `.default()`" risk flagged by the pre-existing `PRODUCTION-READINESS-ASSESSMENT-2026-07-24.md` |
| Database migrations | **ready with configuration** | 20 migrations apply cleanly and repeatably (verified every PLACE task this session); explicitly **not** run at container boot (`migrationsRun: false`) — a separate, safer step, matching this task's own §9 recommendation already |
| Redis connectivity | **production-ready** | `RedisHealthIndicator` verified live every PLACE task; AOF persistence enabled in `docker-compose.prod.yml` |
| Object-storage configuration | **requires application change** (deferred, not blocking) | MinIO container exists in compose but is never called by application code — no upload feature exists yet to configure |
| Container users | **production-ready** | Both Dockerfiles run as non-root `node` |
| Filesystem permissions | **production-ready (web)** / **requires infrastructure verification (api)** | Web's EACCES defect found and fixed in PLACE-036. **API's Dockerfile has the identical `COPY --from=build` pattern without `--chown`** — no direct evidence of a runtime write-path problem (no code found that writes to the API container's own filesystem at runtime), but this was never specifically tested the way web's was. Flagged as an unverified, low-priority pre-launch check, not a claimed defect (no evidence exists either way). |
| Exposed ports | **production-ready** | `4000` (API), `3000` (web) — both explicit, both currently mapped directly to the host in `docker-compose.prod.yml` (fine for local verification; a real deploy should not publish these directly, see §18) |
| Health endpoints | **ready with configuration** | `/api/health` exists and works; it combines liveness+readiness into one endpoint (see §20 for the gap vs. `deployment.md`'s target `/health` + `/health/ready` split) |
| Restart behaviour | **production-ready** | `restart: unless-stopped` on every service in `docker-compose.prod.yml` |
| Log output | **production-ready** | Structured, correlation-ID-tagged, redacted (PLACE-030); no aggregation exists yet (see §14) |
| Secret redaction | **production-ready** | `AppLoggerService`'s `REDACTED_KEYS` list covers snake_case + cookie/DB/Redis-credential keys, case-insensitive (PLACE-030); zero secret-leakage found in any live verification this session |
| Image tags | **requires Owner decision** | Currently ad-hoc local tags (`:local`, `:ci`, `:place036-stabilization`); no commit-SHA tagging policy is wired into any real registry push (GHCR step exists but unverified) |
| Rollback process | **ready with configuration** | Mechanism proven three times locally (image-tag swap, zero DB involvement for the frontend; full data-continuity proof for the API across a real NestJS-version rollback in PLACE-032) — never exercised against a real deployed environment, because none exists |

**No blocker classification anywhere in this table.** Every "requires X" item is bounded and already understood from existing evidence.

---

## 6. Required Production Services

Restating §4's inventory as a direct answer to "what must run in production":

**Must run:** Next.js web, NestJS API, PostgreSQL+PostGIS, Redis, a reverse proxy for TLS.
**Should exist but is currently unused by application code, so is deferrable:** MinIO/object storage (no upload feature exists to justify it yet — provisioning it now is not harmful, but is not required either).
**Does not need to exist for initial launch:** background-job worker, scheduler, email provider (none of these have any corresponding application code).

---

## 7. Deployment-Model Comparison

### 7.1 Single VPS with Docker Compose

Architecture: one VPS running `docker-compose.prod.yml` (or a close variant) — reverse proxy + web + api + postgres + redis + minio, all on one host, named volumes for the three data services.

| Factor | Assessment |
|---|---|
| Compatibility | **High** — this is almost exactly what `docker-compose.prod.yml` already runs and has been verified against, repeatedly |
| Operational complexity | Low-to-moderate — one host to patch/monitor/secure; no orchestration layer |
| Cost profile | Lowest of the realistic options — one VPS covers everything |
| Backup responsibility | Fully on the Owner/operator — `pg_dump`/WAL archiving script already exists (`infrastructure/docker/postgres/wal-archive.sh`), points at a **local** directory today, not yet offsite |
| Scaling limitations | Vertical only until §14 of `deployment.md`'s roadmap (read replicas, horizontal API scaling) is reached — acceptable, since the project has no real users yet |
| Security burden | Moderate — operator owns OS patching, firewall (UFW), SSH hardening, Docker daemon security |
| Rollback simplicity | **High** — proven mechanism (redeploy previous image tag), zero orchestration complexity |
| Monitoring options | Fully compatible with all 5 options evaluated in §15 |

### 7.2 VPS for Applications with Managed Data Services

Architecture: web+API in Docker on a VPS; PostgreSQL/Redis/object storage each replaced by a managed provider service.

| Factor | Assessment |
|---|---|
| Compatibility | High for Postgres/Redis (both are standard connection-string based in `env.validation.ts` — `DB_HOST`/`DB_PORT`/`REDIS_URL` etc. require no code change to point at a managed host); object storage already S3-compatible-shaped in `.env.example` |
| Cost | Higher than 7.1 — managed Postgres/Redis carry a real monthly premium over a self-hosted container |
| Resilience | Better than self-hosting one instance of each (managed providers typically offer automated backups/failover) |
| Operational workload | Lower — no DB/Redis patching, backup automation, or PITR tooling to build yourself |
| Networking | Requires the managed services to be reachable from the VPS — either public endpoints with strict firewalling/auth, or a VPC/private-link feature (Hostinger's own managed-DB/VPC offering, if any, is **unverified** — see §8) |
| Migration complexity | None beyond pointing `DB_HOST` at the managed endpoint — TypeORM migrations are already environment-agnostic |
| Rollback | Same application-level mechanism as 7.1; database rollback becomes "restore the managed provider's own backup" instead of operator-run `pg_dump`/WAL |

### 7.3 Provider-Native Node Hosting

Assessed strictly against what the repository actually requires, not against any specific provider's marketing claims (no such provider evidence exists in this repository):

| Requirement | Compatible? |
|---|---|
| Node v20.20.2 or supported line | Depends entirely on the specific provider's supported Node versions — **unknown without checking a specific provider** |
| Next.js 16 standalone | Requires the provider to run an arbitrary long-lived Node process (the standalone `server.js`), not just serve static files or edge functions — many "Node hosting" products are actually serverless-function platforms that do **not** support this cleanly without adaptation |
| NestJS 11 (long-running API process) | Same concern — NestJS needs a persistent process, not a request-scoped function; many provider-native "Node hosting" tiers are function-based |
| Separate web and API services | Depends on the provider supporting multiple independent services/processes per project |
| Private networking between web/API/DB/Redis | Provider-dependent; not guaranteed on lower tiers |
| Redis / PostgreSQL+PostGIS | Provider-native hosting rarely bundles PostGIS specifically — usually requires a separate managed-Postgres add-on that must be checked for PostGIS extension support |
| Docker support | Many provider-native Node platforms do **not** run arbitrary Dockerfiles — they use their own buildpacks, which this repository has never been adapted for |
| Custom start commands | Usually supported, but buildpack-based platforms may not recognize the monorepo's Turborepo/npm-workspaces layout without adaptation |
| Rolling deployment / rollback | Usually supported natively by these platforms — a genuine strength |

**This model is the least evidence-supported option** — the repository is built around Docker images, not a specific provider's buildpack conventions, and adapting it would be nontrivial, unverified work. Not recommended as the initial model.

### 7.4 Split-Provider Architecture

Frontend on a frontend-focused provider (e.g., a Vercel-like platform) + API on a container/VPS provider + managed Postgres/Redis + S3-compatible storage.

| Factor | Assessment |
|---|---|
| Complexity | Highest of all options evaluated — multiple providers, multiple deploy pipelines, multiple sets of credentials |
| CORS | Already correctly handled in code (`CORS_ALLOWED_ORIGINS`, PLACE-028) — would just need the real cross-origin domain configured, not a code change |
| Cookies | Not applicable — the app uses bearer-token auth exclusively, confirmed no-cookie design (`apps/web/src/modules/auth/session.ts`), so split-domain cookie complications (SameSite, etc.) simply do not arise |
| Latency | An extra network hop between the split frontend/backend providers, typically small but nonzero |
| DNS | More records to manage (see §22) |
| Cost | Can be cheaper for the frontend leg (frontend-specialist platforms often have generous free tiers) but adds a second provider's floor cost for the API |
| Vendor dependence | Highest — two or more vendors instead of one |
| Monitoring fragmentation | Real concern — logs/metrics/alerts split across providers unless a unifying tool is added |
| Rollback | Two independent rollback mechanisms to coordinate instead of one |

**Technically viable** (the app's stateless-frontend, bearer-token-auth, environment-variable-driven design supports it cleanly) but **not recommended for the initial release** — it multiplies operational surface area for a project that has zero real users yet and already has a working, verified, single-host Docker path.

### 7.5 Current Hostinger Account

**No repository evidence exists about the specific Hostinger plan on the Owner's account.** This repository cannot see account dashboards, invoices, or plan tiers — nothing in `docs/`, `.env`, or any config file names a specific Hostinger product (shared hosting vs. VPS vs. Cloud). `deployment.md` *assumes* a Hostinger VPS throughout but never records which plan or confirms it was purchased with Docker/root-SSH access in mind.

| Capability | Classification |
|---|---|
| Docker support | **unknown** — Hostinger's *shared* hosting plans do not support Docker; Hostinger's *VPS* plans generally do (root access, install anything). Which one the Owner has is not established anywhere in this repository. |
| VPS/root SSH access | **unknown** — same reasoning |
| Persistent long-running Node processes | **unknown** — shared hosting typically does not support this cleanly; VPS does |
| PostGIS | **unknown** — requires either a self-managed Postgres+PostGIS container (needs Docker/VPS) or a managed-Postgres add-on that specifically supports the PostGIS extension (not all managed Postgres offerings do) |
| Redis | **unknown** — same Docker/VPS dependency |
| MinIO | **unknown** — same, though deferrable per §4/§6 |
| Private networking / custom ports | **unknown** — VPS-tier products generally allow this; shared hosting generally does not |

**Classification: `unknown`.** This is correctly *not* treated as a blocker (per this task's own instruction) — it is a bounded, checkable fact the Owner can resolve by looking at their own Hostinger dashboard or plan documentation. §25 lists the exact question to answer.

---

## 8. Hostinger Compatibility Status

**`unknown`**, pending Owner verification of the specific plan. If the Owner confirms a **VPS plan with root/Docker access**, Hostinger becomes `potentially compatible` (pending the standard hosting-checklist items any VPS needs: enough RAM/CPU per §9, a public IPv4, and the ability to open ports 80/443). If the Owner has a **shared hosting plan without Docker/root access**, Hostinger is `incompatible` with this repository's current Docker-based deployment artifacts as-is, and either an upgrade to a VPS tier or a different provider (§7.3/§7.4) would be required.

**This report does not assume Hostinger is compatible merely because an account exists**, per this task's explicit instruction.

---

## 9. Recommended Production Topology

Two realistic topologies, per this task's requirement, followed by exactly one recommendation.

### Topology A — Single VPS, Full Docker Compose Stack (recommended)

- **Component placement:** everything in §6 on one VPS, one `docker-compose.prod.yml`-derived stack.
- **Network flow:** Internet → reverse proxy (443/80) → `web`/`api` containers (internal Docker network) → `postgres`/`redis`/`minio` (internal-only Docker network, never published to the host's public interface).
- **Public endpoints:** reverse proxy only.
- **Private endpoints:** everything else, on a Docker-internal network.
- **TLS termination:** at the reverse proxy (see §18).
- **Database placement:** same VPS, named Docker volume.
- **Redis placement:** same VPS, named Docker volume (AOF).
- **Object-storage placement:** same VPS if/when needed (MinIO container already in compose); not required at launch.
- **Secrets handling:** `.env` file on the VPS, `chmod 600`, never committed (see §13).
- **Log collection:** Docker `json-file` driver initially, with an explicit size/rotation limit configured (currently absent — see §16) plus the reverse proxy's own access/error log.
- **Backup model:** nightly `pg_dump` + continuous WAL archiving to an **offsite** target (the existing `wal-archive.sh` script currently points at a local directory only — pointing it offsite is a config change, not a code change) (see §11).
- **Health checks:** existing Docker Compose `healthcheck:` blocks + `/api/health` + reverse-proxy-level upstream health.
- **Rollout process:** replace-and-verify (see §20).
- **Rollback process:** redeploy the previous image tag (proven mechanism).
- **Operational responsibility:** entirely the Owner/operator (or whoever administers the VPS) — OS patching, Docker daemon updates, firewall, backups, monitoring response.

### Topology B — VPS for Applications + Managed Postgres/Redis

- **Component placement:** `web`/`api` in Docker on a VPS (or provider-native Node hosting, if confirmed compatible); PostgreSQL+PostGIS and Redis each replaced by a managed service.
- **Network flow:** Internet → reverse proxy → `web`/`api` → managed Postgres/Redis over a private-network or firewalled public connection.
- **Public endpoints:** reverse proxy only.
- **Private endpoints:** `web`/`api` are never directly exposed; managed DB/Redis reachable only from the VPS's IP (or private link, if the managed provider offers one).
- **TLS termination:** reverse proxy for app traffic; the managed DB/Redis providers handle their own connection encryption.
- **Database placement:** managed provider (must specifically support the `postgis` extension — not all managed Postgres offerings do; this must be verified against whichever managed provider is chosen).
- **Redis placement:** managed provider.
- **Object-storage placement:** managed S3-compatible provider (e.g., Cloudflare R2, already anticipated by `docker-compose.prod.yml`'s own comments as the intended eventual replacement for local MinIO) — not required at launch per §6.
- **Secrets handling:** same as Topology A, plus the managed providers' own connection credentials.
- **Log collection:** same as Topology A for `web`/`api`; managed providers typically offer their own log/metrics dashboards for DB/Redis.
- **Backup model:** delegated to the managed providers' own backup/PITR features (verify RPO/RTO commitments per provider — not assumable).
- **Health checks:** same `/api/health` pattern, now also reflecting managed-service reachability.
- **Rollout / rollback:** same application-level mechanism as Topology A; database "rollback" becomes "restore from the managed provider's backup" rather than operator-run `pg_dump`/WAL restore.
- **Operational responsibility:** VPS/app layer on the Owner/operator; DB/Redis operational burden (patching, backup execution, failover) shifted to the managed providers.

### Recommendation: **Topology A**

Reasoning, in the priority order this task specifies:

1. **Reliability:** Topology A's stack is the *exact* stack already built and repeatedly verified booting cleanly against real data (PLACE-026 through PLACE-036) — reliability here is evidenced, not assumed.
2. **Rollback simplicity:** Topology A's rollback mechanism (redeploy the previous image tag) is the one already proven three separate times this session with real data-continuity checks; Topology B adds a second, unproven rollback path (managed-provider restore) for no benefit at this scale.
3. **Manageable operational burden:** at zero real users, the marginal operational simplicity Topology B buys (not patching Postgres/Redis yourself) is not worth its added cost and the unverified-provider-compatibility risk it introduces.
4. **Reasonable cost:** Topology A is unambiguously cheaper — one VPS instead of one VPS plus managed-service premiums.
5. **Future scalability:** `deployment.md §14`'s own scaling roadmap explicitly starts from "GĐ1: 1 VPS" and only moves toward managed services/read-replicas in GĐ2 — Topology A is the correct **GĐ1** choice, with a clear, already-documented upgrade path to Topology B later, not a dead end.

---

## 10. Resource Estimates

**All figures below are estimates**, most already present in `deployment.md §10` (written before this session's work, still the best available sizing evidence) and re-stated here for the decision gate, not re-derived from any new traffic data (this repository represents **zero real production traffic** — there is no log/metrics evidence to size against beyond the target-capacity assumption already documented).

| Resource | Minimum viable | Recommended starting profile | Scale-up trigger |
|---|---|---|---|
| CPU | 2 vCPU | **4 vCPU** | Sustained CPU saturation on the API/Postgres processes under real monitoring (not available until §15's minimum stack is running) |
| RAM | 8 GB | **16 GB** (Postgres ~4–6 GB, Redis 2–4 GB, app 2–4 GB, OS/buffer remainder) | RAM utilization consistently >80% |
| Storage (OS+Docker+Postgres+logs, media offloaded) | 100 GB | **200 GB NVMe** | Disk usage >70% |
| Storage (if self-hosting MinIO instead of offloading media) | ≥500 GB | **≥1 TB** | Same, sooner |
| Database storage | a few GB initially | headroom within the 200 GB above | Query-latency degradation or approaching the disk trigger above |
| Redis memory | 512 MB | **2–4 GB**, `allkeys-lru` for cache | Redis `maxmemory` evictions observed |
| Object storage | 0 (unused, see §6) | N/A until upload feature ships | N/A |
| Bandwidth | provider's base allocation | monitor actual egress once real traffic exists | Approaching plan's bandwidth cap |
| Docker image storage | <1 GB | **<10–20 GB** total with periodic `docker system prune` | Approaching disk trigger |
| Backup storage | N/A locally | sized to retention policy in §11 (offsite, separate from the VPS's own disk) | N/A — provisioned upfront, not reactively |

No monthly cost figure is stated — this repository has no verified pricing source, and this task's own instruction prohibits fabricating one. The Owner's own Hostinger account/plan page is the only reliable source for a real number.

---

## 11. Persistence and Backup Requirements

| Category | Frequency | Retention | Encryption | Restore-test requirement | Responsible |
|---|---|---|---|---|---|
| PostgreSQL/PostGIS | Nightly logical dump + continuous WAL archiving (mechanism already exists: `infrastructure/docker/postgres/wal-archive.sh`, verified working against a **local** directory in PLACE-026 — pointing it offsite is the only remaining step, a config change not a code change) | daily 7 · weekly 4 · monthly 6 (already specified in `deployment.md §11.1`, not re-invented here) | Required at rest for the offsite copy | **Required, quarterly** — "a backup that has never been restored is not a backup" (this exact principle already stated in `deployment.md §11.5`) | Operator (VPS admin) |
| Redis | AOF already enabled (`--appendonly yes` in `docker-compose.prod.yml:54`) — sufficient for cache/session; **not** part of the durable-backup policy (cache data is regenerable) | N/A (ephemeral by design) | N/A | N/A | Operator |
| MinIO / object storage | N/A at launch (unused, §6) — when file uploads ship, bucket versioning + periodic offsite sync per `deployment.md §11.2` | Deferred | Deferred | Deferred | Deferred |
| Application-generated files | None exist (no upload path, §4) | N/A | N/A | N/A | N/A |
| Logs | Rotated locally (see §16), not currently backed up offsite — acceptable for launch since logs are diagnostic, not source-of-truth data | 14–30 days locally (recommendation, see §16) | Not required (no secrets should ever appear in logs, enforced by `AppLoggerService`'s redaction) | N/A | Operator |
| Docker volumes | Covered by the Postgres/Redis backup mechanisms above; the volumes themselves are not separately snapshotted in current tooling | — | — | — | Operator |
| Configuration | Already in Git (`docker-compose.prod.yml`, `infrastructure/`) — versioned "for free" | Full Git history | N/A (no secret values in Git) | N/A | N/A |
| Secrets metadata (which vars exist, not their values) | Already in Git (`.env.example`) | Full Git history | N/A | N/A | N/A |
| Deployment artifacts (images) | Retained image tags on the VPS/registry, per §21's rollback requirements | At minimum: current + previous | N/A | Implicitly tested by every rollback rehearsal | Operator |

No backup is executed and no backup infrastructure is created by this task, per instruction — the table above is a policy design, matching and citing the pre-existing `deployment.md §11` design where it already covers a category, and filling in only what that document left unspecified (restore-test cadence phrasing, and marking object storage/application files as correctly deferred given §6's finding that they're unused).

---

## 12. Database Migration Strategy

Grounded in the actual current TypeORM setup, not invented:

- **When migrations run:** as an explicit, separate step — **not** automatically at container boot. `apps/api/src/core/database/database.module.ts:25` sets `migrationsRun: false`. This is confirmed already the safer pattern in practice: `.github/workflows/ci.yml`'s `docker-build` job runs `npm run migration:run --workspace @phuquochub/api` as its own step, *before* building/booting the images, exactly matching the recommended production sequence.
- **Who/what runs them:** the TypeORM CLI (`typeorm-ts-node-commonjs migration:run -d src/core/database/data-source.ts`), invoked by whatever deploy mechanism is chosen (a deploy script or CI step) — not the application process itself.
- **Why a separate command is safer here (repository-specific reasoning, not generic advice):** the API's own `env.validation.ts` fail-fast behavior means a misconfigured `DB_*` var already stops the *application* from booting; keeping migrations as a distinct step additionally stops a *bad migration* from ever reaching a state where the application boots against a half-migrated schema, since the migration step must succeed before the deploy proceeds to the image-boot step.
- **Pre-deployment backup:** the rollout sequence in §20 places a fresh Postgres backup immediately before migrations run, consistent with `deployment.md §9`'s "expand→migrate→contract" principle.
- **Backward compatibility:** all 20 existing migrations in `apps/api/src/core/database/migrations/` are additive (confirmed by their naming pattern and by every PLACE task this session re-verifying `migrations=20` unchanged across every rollback rehearsal) — no destructive migration exists yet in this codebase's history, which is a favorable starting condition for zero-downtime rollout.
- **Rollback limitations:** TypeORM's `migration:revert` reverses exactly one migration at a time and is only as safe as each migration's own `down()` implementation — this repository has never exercised a real `migration:revert` in production-shaped conditions (only forward migrations have been verified live). **This is a genuine gap**: recommend a migration-revert rehearsal be included in the future implementation task's rollback-rehearsal scope (§24), not assumed safe by default.
- **Failed-migration handling:** if `migration:run` fails mid-deploy, the correct response is to **not** proceed to boot the new image — the previous image (still pointing at the unmigrated-but-consistent schema) should remain running. This requires the deploy script to treat migration failure as a hard stop, which is a scripting detail for the future implementation task, not something this repository's CI currently encodes as a *deploy* gate (CI only proves migrations run cleanly *in CI's own disposable database*, not that a failure correctly blocks a real deploy).
- **Migration locking:** TypeORM's default migration-run behavior uses a `migrations` table with its own locking to prevent two concurrent `migration:run` invocations from racing — standard TypeORM behavior, not something this repository has customized or needs to.
- **Verification:** post-migration, the existing `/api/health` check (which pings the DB) combined with the rollout smoke-test step (§20) is sufficient to confirm the schema-and-application state is consistent before declaring the deploy successful.

---

## 13. Production Secrets Strategy

Inventory (categories only — no values reproduced, per instruction):

| Category | Where currently declared | Production storage recommendation |
|---|---|---|
| Database credentials (`DB_USER`/`DB_PASSWORD`/`DB_NAME`) | `.env` (gitignored), fail-fast-required in production per `env.validation.ts` | VPS-local `.env`, file permissions restricted to the deploying user; never in Git |
| Redis credentials | `REDIS_URL`/`REDIS_HOST`/`REDIS_PORT` — currently **no password** configured anywhere (`docker-compose.prod.yml`'s Redis service has no `requirepass`) | **Gap worth flagging**: `deployment.md §6.5` itself says Redis "should have a password, bind internally" — this is not yet implemented in `docker-compose.prod.yml`. Since Redis is never published outside the Docker-internal network in the recommended topology, this is a defense-in-depth gap, not an exposed-credential risk today — but should be added before real launch (implementation-task scope, §24) |
| JWT secrets (`JWT_ACCESS_SECRET`/`JWT_REFRESH_SECRET`) | `.env`, required ≥16 chars via Joi, fail-fast if missing | Same as DB credentials; **must** be regenerated to real random values before any real deploy — `docker-compose.prod.yml`'s current defaults are explicit placeholders (`change-me-access-secret-min-16-chars`) |
| Cookie secrets | **Not applicable** — the app uses bearer-token auth exclusively, zero cookie usage confirmed (PLACE-036's source-compatibility review) | N/A |
| CORS configuration | `CORS_ALLOWED_ORIGINS`, required in production, currently defaults to `http://localhost:3000` in `docker-compose.prod.yml` | Must be updated to the real production domain (see §22) before launch — not a secret, but a required pre-launch config change |
| API URLs (`NEXT_PUBLIC_API_URL`) | Public by design (`NEXT_PUBLIC_` prefix, confirmed baked into the client bundle harmlessly in PLACE-036) | Set to the real production API domain; not sensitive |
| Object-storage credentials | `.env.example` documents `S3_*` vars but **application code never reads them** (§6) | Deferred until the upload feature ships |
| Email credentials | **N/A — no email feature exists** | N/A |
| Third-party API keys | `NEXT_PUBLIC_MAP_TILE_URL` (optional MapTiler upgrade) — public-by-design if used, since it's a `NEXT_PUBLIC_` var | Same handling as API URLs |
| Monitoring tokens | N/A yet — depends on the monitoring option selected in §15 | To be determined alongside that decision |
| Deployment credentials (SSH keys, registry tokens) | Not yet provisioned | SSH: key-only auth to the VPS, key never in Git. Registry: GHCR already uses the CI-provided `GITHUB_TOKEN` (no new secret needed) if/when a git remote is added |

**Storage/rotation/Git-prevention/log-redaction/local-vs-prod-separation, as a policy (not new code):**
- **Storage:** VPS-local `.env` file (or a proper secrets manager if the Owner later wants one — not required at this stage) — never a database, never Git.
- **Reaching containers:** `docker-compose.prod.yml`'s existing `${VAR}` interpolation pattern already does this correctly; no change needed.
- **Rotation:** manual for now (rotate JWT secrets and DB password on a defined cadence, e.g., quarterly, or immediately on suspected compromise) — no automated rotation tooling exists or is proposed for the initial launch.
- **Prevented from entering Git:** `.gitignore` already excludes `.env` (confirmed); `.env.example` correctly contains only placeholder values — this pattern is already correct and requires no change.
- **Log redaction:** `AppLoggerService`'s `REDACTED_KEYS` list (PLACE-030) already redacts secret-shaped keys case-insensitively — confirmed via live log-grep verification in PLACE-030, -032, -035, -036, zero leakage found every time.
- **Local vs. production separation:** already correct — `.env` (real, gitignored, per-environment) vs. `.env.example` (template, committed) is standard practice and already followed.

---

## 14. Existing Observability Inventory

| Capability | Classification | Evidence |
|---|---|---|
| Structured application logs | **implemented** | `AppLoggerService` (PLACE-030), wired as the active NestJS logger |
| Correlation IDs | **implemented** | `correlation-id.middleware.ts`, `X-Request-Id` header, propagated into every log line and `meta.requestId` |
| Request logging | **implemented** | `LoggingInterceptor` — method/URL/status/duration per request |
| Error logging | **implemented** | `AllExceptionsFilter` — 5xx logged with stack traces; expected 4xx stay quiet (verified live every relevant PLACE task) |
| Quiet expected-4xx behaviour | **implemented** | Explicitly verified: wrong-password logins, validation errors, etc. produce zero `ERROR`-level log lines |
| Log redaction | **implemented** | See §13 |
| Health endpoints | **partially implemented** | `/api/health` exists and works, but combines liveness+readiness into one endpoint rather than the two `deployment.md §9` envisions — see §20 |
| Database health | **implemented** | `TypeOrmHealthIndicator`, part of `/api/health` |
| Redis health | **implemented** | `RedisHealthIndicator`, part of `/api/health` |
| Docker health checks | **implemented** | `healthcheck:` blocks on postgres/redis/minio in `docker-compose.prod.yml`; web/api rely on external checks (curl `/api/health`, curl `/`) rather than a Docker-native `HEALTHCHECK` instruction in their own Dockerfiles — **a gap**: neither `apps/api/Dockerfile` nor `apps/web/Dockerfile` declares a `HEALTHCHECK` instruction, so `docker ps`/orchestration tooling cannot natively see container-level health for these two services the way it can for postgres/redis/minio |
| Frontend runtime logs | **implemented (basic)** | Next.js's own console output; no structured frontend logging exists — acceptable, since the frontend has no server-side business logic beyond data fetching |
| Backend runtime logs | **implemented** | See above |
| Security-event logging | **partially implemented** | Rate-limit rejections and CORS rejections are visible as ordinary request logs (status 429/403), but there is no dedicated "security event" log stream distinct from general request logs |
| Audit logging | **implemented (data layer)** | `apps/api/src/core/audit/audit.service.ts` exists (confirmed present, exercised by `audit.service.spec.ts`) — application-level audit trail for privileged actions, separate from infrastructure/observability logging |
| Metrics (Prometheus-style) | **absent** | Zero metrics dependency anywhere; confirmed by grep |
| Traces | **absent** | No OpenTelemetry or tracing dependency anywhere |
| Uptime checks | **absent** | No external uptime monitoring configured (nothing to check — no deployed environment exists) |
| Alerting | **absent** | No alert channel, no alerting tool wired |
| Dashboards | **absent** | No Grafana/equivalent exists |

This table directly supersedes the "Monitoring: None implemented" / "Logging: dead code" findings from the pre-existing `PRODUCTION-READINESS-ASSESSMENT-2026-07-24.md` — logging has since been substantially implemented (PLACE-030), but **metrics, traces, dashboards, alerting, and uptime checks remain exactly as absent as that report found**, because no PLACE task since has addressed them (correctly — they were never in scope for the migration-focused tasks that followed).

---

## 15. Monitoring-Provider Comparison

Only options realistically relevant to this project's actual stage are evaluated, per instruction.

### Option A — Infrastructure-Native Monitoring
Docker logs + `restart: unless-stopped` container-restart visibility + reverse-proxy access/error logs + VPS-level CPU/RAM/disk alerts (most VPS providers, including likely Hostinger, offer basic resource alerting in their own dashboard) + one lightweight external uptime check.
- **Frontend error visibility:** none beyond what appears in browser consoles / server logs for SSR failures.
- **Backend error visibility:** good — `AllExceptionsFilter` already logs every 5xx with a stack trace and correlation ID; readable via `docker logs`.
- **Setup cost:** near zero — almost everything needed already exists in the codebase.
- **Ongoing operational cost:** low — reading logs on demand, not a maintained dashboard.

### Option B — Sentry
- **Frontend error monitoring:** would require the Sentry Next.js SDK (a real dependency + `next.config.mjs` change) — genuinely useful, since today a client-side error is only visible if a user reports it.
- **Backend error monitoring:** would require the Sentry Node/NestJS SDK — largely duplicates what `AllExceptionsFilter` already logs, with the added benefit of aggregation/deduplication/alerting across errors instead of raw log lines.
- **Source maps:** would need to be uploaded at build time for readable stack traces — a CI step, not yet present.
- **Performance tracing:** available but not needed at this stage (zero real traffic to have a performance problem yet).
- **Release tracking:** genuinely useful once real deploys begin — ties errors to the exact image/commit.
- **Privacy considerations:** Sentry captures request context by default; would need explicit configuration to avoid capturing PII, layered on top of the redaction discipline already built for the app's own logger.
- **SDK/build changes:** real — a new dependency in both `apps/web/package.json` and `apps/api/package.json`, plus config. **This task does not install it**, but it is the only option evaluated here that inherently requires a code change to adopt.
- **Cost:** Sentry has a free tier sufficient for low-volume early-stage use; a paid tier becomes relevant only at real traffic volume.
- **Self-hosted vs. hosted:** self-hosting Sentry is itself nontrivial infrastructure (its own Postgres/Redis/Kafka-ish stack) — not appropriate at this stage; hosted (SaaS) Sentry's free tier is the only realistic version of this option for now.

### Option C — Grafana Stack (Grafana + Prometheus + Loki + a collector)
- **Infrastructure burden:** significant — this is itself a multi-container stack to deploy, secure, and maintain, on top of the application stack.
- **Metrics:** would require instrumenting the NestJS app with a Prometheus client (new dependency, new code) — none exists today.
- **Logs:** Loki would need a log-shipping agent (e.g., Promtail/Alloy) added to the Compose stack.
- **Dashboards/alerting:** genuinely powerful once running, but represents the single largest new-infrastructure commitment of any option evaluated.
- **Retention/storage:** additional disk planning beyond §10's estimates.
- **Maintenance complexity:** highest of all options — this is a real second system to operate, not a SaaS dependency.

### Option D — OpenTelemetry-Compatible Provider
- **Traces/metrics/logs:** a single OTel SDK integration could, in principle, feed any compatible backend (vendor-portable) — but this still requires real instrumentation work in both `apps/api` and `apps/web` that does not exist today.
- **Vendor portability:** the main theoretical advantage over Option B/C — avoids locking into one vendor's proprietary SDK.
- **Instrumentation effort:** nontrivial — comparable to Option B's SDK integration, plus choosing and configuring a backend.
- **Cost/operational complexity:** depends entirely on which backend is chosen; cannot be estimated without that decision, which is itself premature at this stage.

### Option E — Lightweight Uptime Provider
- **HTTP checks:** a single external check against `GET /api/health` and/or `GET /` — trivial to set up, many free tiers exist (this report names no specific vendor, since no such choice is evidenced or required by this repository).
- **SSL expiry checks:** directly addresses the exact "cert sắp hết hạn (<14 ngày)" alert `deployment.md §12.1` already calls for.
- **Response-time checks:** basic latency visibility, better than nothing, far short of real APM.
- **Alert channels:** typically email/webhook — sufficient for a single-operator project.
- **Lack of application-level context:** the core limitation — an uptime check tells you the site is down, not *why*; it must be paired with the actual application logs (Option A) to be useful for diagnosis, not a replacement for them.

---

## 16. Monitoring Decision Matrix

Scored 0–10 (10 = best) per this task's required criteria. Weighting rationale: at zero real production traffic, **implementation effort, operational effort, and cost suitability are weighted most heavily** — the project cannot yet justify ongoing operational burden or spend for observability depth it has no traffic to exercise. Frontend/backend error visibility and alerting quality matter, but a "minimum stack" evaluation correctly favors options that are cheap to adopt now and upgradeable later, over options that are powerful but front-load cost/complexity the project doesn't yet need.

| Criterion | A: Infra-native | B: Sentry | C: Grafana stack | D: OTel-compatible | E: Uptime provider |
|---|---|---|---|---|---|
| Implementation effort (10=easiest) | 10 | 6 | 2 | 3 | 9 |
| Operational effort (10=lowest ongoing burden) | 8 | 7 | 2 | 4 | 9 |
| Frontend error visibility | 2 | 9 | 4 | 6 | 0 |
| Backend error visibility | 6 | 8 | 7 | 7 | 0 |
| Infrastructure visibility | 5 | 3 | 9 | 7 | 2 |
| Log-search capability | 3 | 5 | 8 | 6 | 0 |
| Alerting quality | 4 | 7 | 8 | 6 | 6 |
| Correlation-ID usefulness (how well the option leverages the existing `X-Request-Id` work) | 9 | 6 | 8 | 7 | 0 |
| Cost suitability (10=cheapest at current stage) | 10 | 8 | 4 | 6 | 9 |
| Vendor lock-in (10=least locked-in) | 10 | 5 | 7 | 8 | 8 |
| Privacy control (10=most control) | 9 | 5 | 8 | 6 | 7 |
| Scalability (10=scales best to real traffic later) | 3 | 8 | 9 | 8 | 3 |

**Recommendation:**

- **Minimum stack for the first production release:** **Option A (infrastructure-native) + Option E (one external uptime check)**. This costs nothing to adopt (no new dependency, no new infrastructure beyond one free-tier external checker), directly leverages the correlation-ID/structured-logging work already done, and covers the launch-blocking signals identified in §17.
- **Preferred enhanced stack (recommended next step, not launch-blocking):** add **Sentry (Option B)** once real users exist — it is the best-scoped upgrade because it directly fills Option A's biggest gap (frontend error visibility, currently near-zero) without requiring new infrastructure to operate.
- **Explicitly deferrable:** Option C (Grafana stack) and Option D (OpenTelemetry) — both represent real, useful capability but are disproportionate to a project with no real traffic yet; revisit when `deployment.md §14`'s GĐ2 scaling triggers are actually reached.

---

## 17. Minimum Launch Observability

| Item | Classification |
|---|---|
| External uptime check | **launch-blocking** |
| API health check (`/api/health`) | **launch-blocking** — already exists, just needs to be wired into whatever check mechanism is chosen |
| Web health/homepage check | **launch-blocking** |
| Database health alert | **strongly recommended** — already surfaced via `/api/health`; needs an alert wrapped around it |
| Redis health alert | **strongly recommended** — same reasoning |
| CPU alert | **strongly recommended** — typically available for free at the VPS-provider level |
| RAM alert | **strongly recommended** — same |
| Disk-space alert | **launch-blocking** — a full disk silently breaks Postgres writes; cheap to set up, high consequence if missing |
| Container-restart alert | **strongly recommended** — `restart: unless-stopped` already exists; knowing *when* it fires matters |
| TLS-expiry alert | **launch-blocking** — a lapsed cert is a full outage; nearly free to monitor |
| 5xx alert | **strongly recommended** — the logging foundation already exists to support this once any alerting tool reads it |
| Frontend error reporting | **post-launch follow-up** — the Sentry upgrade path in §16 |
| Backend exception reporting (beyond logs) | **post-launch follow-up** — same reasoning; today's log-based visibility is sufficient for a single-operator, zero-traffic launch |
| Log aggregation | **post-launch follow-up** |
| Metrics dashboard | **post-launch follow-up** |
| Tracing | **unnecessary** for initial release |
| Alert escalation (multi-tier paging) | **unnecessary** for initial release — a single-operator project doesn't need an escalation policy beyond "the one person gets notified" |

---

## 18. Alert Policy

Designed, not implemented. Notification channel is explicitly marked as an Owner decision (§25) — no channel is invented here.

| Signal | Condition | Evaluation period | Severity | Notification target | Immediate action | Escalation | False-positive notes |
|---|---|---|---|---|---|---|---|
| Web unavailable | `GET /` fails or non-200 | 3 consecutive failed checks | Critical | *Owner decision* | Check reverse proxy + web container logs | If unresolved 15 min, treat as full outage | Transient deploy-window blips — checks should tolerate one failure during a rollout |
| API unavailable | `GET /api/health` fails or non-200 | 3 consecutive failed checks | Critical | *Owner decision* | Check API container + DB/Redis health | Same as above | Same |
| Database unavailable | `/api/health`'s `database` field != `up`, or `pg_isready` fails | 2 consecutive failures | Critical | *Owner decision* | Check Postgres container/logs, disk space | Immediate if sustained >5 min | A single missed healthcheck during a Postgres restart is expected, not an incident |
| Redis unavailable | `/api/health`'s `redis` field != `up` | 2 consecutive failures | High (not critical — the app degrades, doesn't fully fail, for cache/rate-limit purposes) | *Owner decision* | Check Redis container/logs | If sustained, escalate to critical (auth rate-limiting depends on Redis) | Same as above |
| Disk nearly full | VPS disk usage >80% | Sustained 10 min | High | *Owner decision* | Check log/WAL growth, prune Docker images | Escalate to critical at >90% | Temporary spikes during a backup run are expected |
| Repeated container restart | A `restart: unless-stopped` container restarts >3 times in 10 min | 10-minute window | Critical | *Owner decision* | Check the specific container's logs immediately | Immediate | A single restart after a deploy is expected, not an incident |
| Elevated 5xx errors | 5xx rate exceeds a defined threshold (to be set once real traffic exists — no baseline exists today) | 5-minute window | High | *Owner decision* | Check `AllExceptionsFilter` logs by correlation ID | Escalate to critical if sustained | No production traffic baseline exists yet — this threshold cannot be set meaningfully until real traffic is observed; treat as a post-launch tuning item |
| SSL expiry | Certificate expires in <14 days (matches `deployment.md §12.1`'s own existing target) | Daily check | High | *Owner decision* | Renew certificate | Escalate to critical at <3 days | None |
| Backup failure | Nightly `pg_dump`/WAL-archive job exits non-zero | Per run | Critical | *Owner decision* | Investigate immediately — a silent backup failure is worse than a slow response to a live incident | Immediate | None acceptable — this alert should never be suppressed |
| Migration failure | `migration:run` exits non-zero during a deploy | Per deploy | Critical | *Owner decision* | Deploy must halt automatically (§12); alert confirms the halt happened as intended | Immediate | None — this should be rare and always investigated |

---

## 19. Logging and Retention Policy

| Log category | Format | Collection method | Retention | Size limits | Rotation | Access control |
|---|---|---|---|---|---|---|
| Application logs (api/web) | Structured (existing `AppLoggerService` format) | Docker `json-file` driver (default today — **no `max-size`/`max-file` currently configured in `docker-compose.prod.yml`, a real gap**) | **Recommend 14–30 days locally** | **Recommend `max-size: 10m`, `max-file: 5`** (a `logging:` block addition to each service — an implementation-task item, not made here) | Docker's built-in rotation once the above is configured | VPS-operator-only (file-level, no separate log-viewing tool exists yet) |
| Reverse-proxy logs | Depends on proxy chosen (§18) — typically combined/common log format | Proxy's own file or Docker log driver | Same 14–30 day recommendation | Same rotation recommendation | Same | Same |
| Docker daemon logs | Docker's own | `journald`/system log, provider-dependent | Provider default | Provider default | Provider default | VPS-operator-only |
| Infrastructure logs (Postgres/Redis/MinIO) | Native format of each service | Docker `json-file`, same rotation gap as application logs | 14–30 days | Same recommendation | Same | VPS-operator-only |
| Monitoring events (once §17's minimum stack exists) | Depends on tool | Depends on tool | Depends on tool's own defaults initially | N/A | N/A | Same |
| Security events | Currently folded into general request logs (see §14's "partially implemented" finding) | Same as application logs | Same | Same | Same | Same |

**Correlation-ID preservation:** already fully implemented API-side (`X-Request-Id`, PLACE-030). **Not yet preserved through a reverse proxy**, because no reverse proxy exists yet — this must be an explicit requirement of whatever proxy config the future implementation task writes (forward the client's `X-Request-Id` if present, or let the API's own middleware generate one, and ensure the proxy's own access-log line includes it for correlation across the boundary).

**Must never be logged** (already the case, verified repeatedly): passwords, raw tokens, cookies (n/a — none used), Authorization headers, secret environment variables, sensitive personal data. `AppLoggerService`'s redaction list already enforces this at the application layer; the reverse-proxy access log (once one exists) must be configured not to log full request bodies or the `Authorization` header value, only method/path/status/timing.

---

## 20. Production Health-Check Design

**Current state:** `GET /api/health` (`apps/api/src/modules/health/health.controller.ts`) is a single, combined endpoint checking Postgres (`TypeOrmHealthIndicator.pingCheck`, 3s timeout) and Redis (`RedisHealthIndicator.isHealthy`), decorated `@Public()` and `@SkipThrottle()` — publicly reachable without auth and exempt from rate limiting, appropriate for a probe endpoint.

**Is it sufficient?** For the *initial* launch: **yes, as a combined liveness+readiness signal.** It correctly distinguishes "up" (200) from "degraded" (503 with per-dependency detail, standard Terminus behavior) and is already exercised by CI and every PLACE task's Docker verification.

**Where it diverges from `deployment.md`'s target design** (`/health` liveness + `/health/ready` readiness split, §9 of that document): this repository has only the combined form. This is a **real, bounded gap**, not a blocker — a combined check is a reasonable choice for a single-instance, non-orchestrated (no Kubernetes) deployment, since the liveness/readiness distinction matters most for orchestrators that need to decide whether to *restart* a container (liveness) versus *route traffic to it* (readiness) independently. Docker Compose's own `restart: unless-stopped` + `healthcheck:` model doesn't need that distinction as sharply as Kubernetes would.

**Recommend exact future changes only where necessary** (not made in this task):
- Object storage is correctly **not** included in the health check today, since it's unused (§6) — adding a MinIO/S3 check to `/api/health` should happen only once the upload feature that needs it actually ships, not preemptively.
- If/when this repository later needs Kubernetes or a load-balancer that makes independent liveness/readiness decisions, split the endpoint then — not before, since it would be speculative work today.
- **Information disclosure:** the current 503 response body includes per-dependency error detail (standard `@nestjs/terminus` behavior) — worth a quick look before real launch to confirm no internal connection-string or stack-trace detail leaks in the failure-case JSON body (this was not specifically re-verified in this task, since it requires triggering a real dependency failure, which is out of this decision-gate task's scope; flagged as a pre-launch check).

---

## 21. Reverse Proxy and TLS

**Minimum requirement:** something must terminate TLS and route `/` → web, `/api` → api — currently **nothing exists** for this (`infrastructure/nginx/` is empty).

| Option | Assessment |
|---|---|
| Nginx | Matches `deployment.md §6.3`'s own target design; mature, well-understood, minimal resource footprint; requires manually configuring TLS (e.g., via Certbot) unless paired with a provider that automates it |
| Caddy | Automatic TLS out of the box (much less manual cert-management work than nginx+Certbot) with a comparably simple reverse-proxy config; a genuinely strong fit for a single-operator initial launch |
| Provider-managed proxy | Depends entirely on what Hostinger's specific product offers (unknown, §8) — cannot be recommended without that information |

**Recommend one initial approach:** **Caddy**, specifically because of its automatic TLS — for a first launch with a single operator and no existing nginx expertise investment in this repository, minimizing manual certificate-lifecycle work reduces real operational risk (an expired cert is a launch-blocking alert per §17) more effectively than nginx's marginally larger ecosystem/performance edge matters at this traffic scale.

Other requirements the chosen proxy config (future implementation task, not built here) must cover: HTTP→HTTPS redirect, forwarding real client IP (`X-Forwarded-For`, paired with the API's existing `TRUST_PROXY_HOPS` variable — currently `0`, must be increased to `1` once a proxy is in front, per the exact guidance already written in `.env.example`'s own comment on that variable), no WebSocket requirement identified (no WebSocket usage found anywhere in the codebase), a sane request-body size limit (relevant once file uploads exist, not yet), compression, no proxy-level caching needed initially (the app has no cacheable-at-the-edge public asset strategy beyond what Next.js's own standalone server already serves), rate limiting is already handled at the application layer (`@nestjs/throttler`, PLACE-028) so proxy-level rate limiting is a defense-in-depth nice-to-have, not a requirement, and forwarding/preserving the `X-Request-Id` correlation header (§19).

---

## 22. Domain and DNS Requirements

**No production domain is represented anywhere in this repository** — `deployment.md`'s `phuquochub.*` references are illustrative placeholders, not a confirmed registered domain. Likely records, listed for planning purposes only (none confirmed, none created):

| Record | Purpose | Status |
|---|---|---|
| Root domain (e.g., `phuquochub.com`) | Web app | **Owner decision** — not represented in repo evidence |
| `www` | Redirect to root (or vice versa) | Owner decision, standard convention |
| API subdomain (e.g., `api.phuquochub.com`) | If a split subdomain is chosen over a `/api` path prefix behind the same domain — the app's CORS design (`CORS_ALLOWED_ORIGINS`) supports either | Owner decision |
| Object-storage/CDN subdomain | Deferred — not needed until object storage is actually wired into the app (§6) | Deferred |
| TLS validation records | Depends entirely on the TLS method chosen (§21) — Caddy's automatic TLS typically needs only the domain pointing at the server, no separate DNS-validation record for HTTP-01 challenges | To be determined alongside the proxy implementation task |

**Domain naming is explicitly an Owner decision**, not assumed here.

---

## 23. Rollout Strategy

1. Infrastructure preparation (VPS provisioned, per §25's Owner decision).
2. Secrets configuration (`.env` populated with real, rotated values per §13 — never the placeholders currently in `docker-compose.prod.yml`).
3. Database provisioning (Postgres+PostGIS container started, extensions confirmed, per the existing `infrastructure/docker/postgres/init/01-init.sql`).
4. Backup verification (confirm the nightly `pg_dump`/WAL mechanism is running and pointed offsite, per §11, **before** any real data exists to lose).
5. Application image build (from a tagged commit, using the existing, verified Dockerfiles).
6. Image tagging (recommend commit-SHA tags, matching `deployment.md §6.2`'s already-stated convention).
7. Migration preparation (`migration:run` executed as its own step, per §12, with the pre-deployment backup from step 4 already in place).
8. Production-like smoke test (exactly the pattern already proven in every PLACE task's Docker verification: boot, curl `/api/health`, curl `/`, check logs for errors) — run against the real environment before declaring it live.
9. Initial production deployment (start the `web`/`api` containers).
10. Health checks (automated, per §17's minimum stack).
11. Route checks (a small, repeatable smoke-test script covering the same route categories PLACE-036 already exercises locally: homepage, a static page, a dynamic page, a not-found page).
12. Monitoring activation (the minimum stack from §16 — uptime check + alert wiring — turned on *before* real traffic, not after).
13. Limited observation period (recommend at least 24–48 hours of close attention before considering the launch "settled," given this is a first-ever real deployment with no prior production track record to lean on).
14. Rollback decision criteria (see §24 — defined in advance, not improvised during an incident).
15. Release evidence (a delivery-evidence record, matching this repository's own established PLACE-task convention, documenting exactly what was deployed and verified).

**Strategy selection:** **simple replace-and-rollback**, not canary or blue-green. Justification: blue-green requires running two full environments simultaneously (meaningfully more VPS resource and reverse-proxy complexity than this project's current stage justifies) and canary requires traffic-splitting infrastructure that does not exist and isn't justified at zero-to-low initial traffic. Replace-and-rollback is exactly the mechanism already built, verified, and rehearsed three times this session — recommending anything more complex for a *first* production release would be exactly the kind of "theoretical enterprise complexity" this task's own instructions warn against prioritizing over the project's actual stage.

---

## 24. Rollback Requirements

| Element | Rollback approach |
|---|---|
| Retained frontend image | Keep at least the current + previous tagged image on the VPS/registry (matches the pattern already used throughout PLACE-031/032/036's local rehearsals) |
| Retained API image | Same |
| Git commit reference | Every deployed image tag should map 1:1 to a Git commit SHA (per §23's tagging recommendation) — enables exact source correlation for any rollback |
| Lockfile reference | Implicit in the image (the lockfile is baked into the built image, not re-resolved at deploy time) — no separate action needed |
| Environment compatibility | Must confirm the previous image's expected env vars are still a subset of what's configured — not automated today, a manual pre-rollback check |
| Database compatibility | The genuine constraint: rolling back the **application** is instant (redeploy previous image); rolling back the **database schema** is not, if a migration was destructive. Since all 20 existing migrations are additive (§12), a straightforward application rollback works cleanly against the current schema — but this assumption must be re-checked for any *future* migration before relying on it |
| Database backup | Must exist and be recent (§11) before any migration-involving deploy, specifically so a schema-incompatible failure has a real restore path, not just an application-level rollback |
| Static assets | Next.js standalone output is self-contained per image (no separate CDN-cached asset-versioning concern at this stage, since no CDN is in front yet) |
| Object storage | N/A — unused (§6) |
| DNS behaviour | Rollback does not require any DNS change (same domain, same server, just a different container image) — a real operational advantage of the single-VPS topology over any DNS-based blue-green scheme |
| Proxy configuration | No change needed for an application-only rollback (proxy still routes to the same container names/ports) |
| Cache invalidation | None required at this stage (no CDN/edge cache in front) |
| Monitoring verification | The rollback is not "done" until the same health/route checks from §23 pass again post-rollback — exactly the discipline already proven in every PLACE-task rollback rehearsal this session |

**Independently rollback-able:** the web image and the API image (proven independently swappable in every rehearsal this session — e.g., PLACE-036's web-only rollback while the API container stayed untouched).

**Requires database restore, not just container rollback:** any incident caused by a *destructive* migration (none exist today, but a future one could) or by real data corruption/loss — container rollback alone cannot undo either of those; it only reverts *code*, not *data*.

---

## 25. Owner Decisions

| Decision | Options | Technical consequences | Recommended default | Can the next implementation task proceed without it? |
|---|---|---|---|---|
| Deployment provider | Hostinger VPS (pending plan verification) / a different VPS provider / provider-native hosting / split-provider | Determines which of §9's topologies is actually buildable | Hostinger VPS **if** the Owner confirms a VPS-tier plan with Docker/root access (§8); otherwise select any standard VPS provider — the repository's Docker-based artifacts are provider-agnostic beyond that one requirement | **No** — this is the single decision every other rollout step depends on |
| Hostinger plan / alternative | Whatever the Owner's actual account supports, or an upgrade/alternate provider | Gates Docker/VPS-dependent capability entirely | Confirm current plan first; upgrade only if it lacks VPS/root access | No |
| VPS vs. managed services (Topology A vs. B) | See §9 | Cost, operational burden, resilience trade-off | Topology A for launch | Yes — Topology A can proceed without this being permanently decided, since it's the lower-commitment starting point and migrating to B later is a config change, not a rebuild |
| Expected launch budget | N/A — no figures fabricated here | Determines VPS tier (§10) and whether Sentry's paid tier is ever relevant | N/A | No — resource sizing needs at least a rough ceiling |
| Domain layout | Root+`www`, `/api` path vs. `api.` subdomain, etc. | Affects CORS config and proxy routing rules | `/api` path prefix on one domain (simplest, avoids a second subdomain's DNS/TLS overhead) | Yes, with a placeholder assumption the implementation task can adjust |
| Monitoring provider | See §15/§16 | Determines what infra/SDK work the implementation task includes | Option A + E for launch | Yes — the minimum stack proceeds regardless of a later Sentry decision |
| Paid vs. free monitoring | Free-tier options are sufficient for the recommended minimum stack | None blocking | Free tier at launch | Yes |
| Notification channel | Email / Telegram / Slack / other | Where alerts actually go | Not recommended here — genuinely the Owner's own preference | **No** — alerts configured with no destination are useless; this must be answered before §18's policy can be wired up, though it does not block *planning* it (already done here) |
| Backup retention | Already has a recommended default (§11, matching `deployment.md`'s own daily-7/weekly-4/monthly-6) | Storage cost scales with retention | Accept the existing documented default unless the Owner wants otherwise | Yes |
| Deployment timing | Whenever the Owner is ready, post-conditions in §31 | None beyond sequencing | N/A | N/A |
| Acceptable maintenance window | None strictly required for the replace-and-rollback strategy (near-instant swap), but a brief window is still prudent for the *first ever* deploy | Low | A short, announced window for the first deploy specifically, not required for routine ones after | Yes |
| Initial production region | Wherever the Owner's Hostinger account/VPS is provisioned | Latency to the actual target user base (Phú Quốc/Vietnam) | A Vietnam-region or nearest-available Hostinger datacenter, if offered | Yes — reasonable default, revisit only if verified latency is bad |
| Whether a staging environment is required | Yes/no | `deployment.md §3-4` already designs a full 4-environment model; building it in full now is disproportionate to a first launch | **No** for the very first launch — a local Docker smoke test (already proven) plus a careful, observed initial rollout is sufficient; introduce a real staging environment once the first production deploy is stable, per the same "don't front-load enterprise complexity" principle applied elsewhere in this report | Yes |

---

## 26. Recommended First-Launch Architecture

- **Deployment provider category:** single VPS (Hostinger, pending plan verification per §8, or an equivalent VPS provider).
- **Web placement:** Docker container on the VPS, behind the reverse proxy.
- **API placement:** Docker container on the same VPS, behind the reverse proxy.
- **PostgreSQL placement:** Docker container on the same VPS, named volume, WAL archiving pointed offsite.
- **Redis placement:** Docker container on the same VPS, named volume (AOF), **password added** (currently missing — see §13).
- **Object-storage placement:** not deployed at launch (unused by application code, §6); the MinIO service definition can remain in `docker-compose.prod.yml` unused, or be commented out, at the Owner's preference.
- **Proxy/TLS:** Caddy, automatic TLS.
- **Backups:** nightly `pg_dump` + continuous WAL, offsite target (specific provider is an Owner decision — R2/Backblaze are the two `deployment.md` already names as candidates), daily-7/weekly-4/monthly-6 retention.
- **Monitoring:** infrastructure-native (Docker healthchecks, structured/correlated logs) + one external uptime check.
- **Alerting:** the policy in §18, wired to an Owner-chosen notification channel.
- **Log retention:** 14–30 days locally, rotation configured (currently missing — implementation-task item).
- **Rollout model:** simple replace-and-rollback.
- **Rollback model:** redeploy the previous tagged image; database restore only for the (currently nonexistent) case of a destructive migration or real data loss.

**Based on repository evidence (no Owner confirmation needed to state):** every item above involving the existing Dockerfiles, Compose stack, migration behavior, logging/correlation-ID system, and rollback mechanism.

**Assumptions requiring Owner confirmation:** the Hostinger plan actually supports Docker/VPS access (§8); the specific offsite backup target and notification channel (§25); the domain name itself (§22); the launch budget ceiling (§25).

---

## 27. Proposed Implementation-Task Scope (for a future, separately authorized task)

**May include, only where justified:**
- `infrastructure/nginx/` (or a new `infrastructure/caddy/`) — real reverse-proxy configuration.
- `docker-compose.prod.yml` — add a `logging:` block (size/rotation limits) to each service; add `requirepass` to the Redis service; adjust `TRUST_PROXY_HOPS` guidance once a real proxy exists; point `WAL_ARCHIVE_DIR`'s underlying script at a real offsite target.
- `apps/api/Dockerfile` / `apps/web/Dockerfile` — add native `HEALTHCHECK` instructions (closing the gap noted in §14); verify (and fix if needed) the API Dockerfile's own file-ownership pattern, following the exact precedent and verification method PLACE-036 already established for the web image.
- A minimal uptime-check configuration (Option A+E from §16) — likely just documentation/setup steps against an external free-tier service, not repository code.
- Log-rotation configuration (ties to the `docker-compose.prod.yml` change above).
- Deployment scripts (a small script wrapping steps 5–11 of §23's rollout sequence).
- Backup scripts (wiring the existing `wal-archive.sh` to a real offsite destination + a scheduled `pg_dump` job).
- Documentation updates (`docs/architecture/deployment.md` reconciled to whatever subset of the design actually gets built, following this repository's own established pattern of keeping docs honest about implemented-vs-designed).
- A real rollback rehearsal against the **actual** provisioned environment (not just local Docker) — the natural next step after PLACE-031/032/036's local rehearsals.
- A `migration:revert` rehearsal specifically (§12's flagged gap).

**Explicitly excluded** (per this task's own instruction, restated for the future task's own boundary): product feature development, UI redesign, backend business-logic changes, database-schema redesign, unrelated dependency upgrades, content population, broad performance optimization, and production deployment itself before separate authorization.

**Files likely affected:** `docker-compose.prod.yml`, `apps/api/Dockerfile`, `apps/web/Dockerfile`, a new `infrastructure/nginx/` or `infrastructure/caddy/` config file, `infrastructure/docker/postgres/wal-archive.sh` (destination only, not logic), possibly a new `scripts/deploy.sh` and `scripts/backup.sh`, `docs/architecture/deployment.md` (status reconciliation), `docs/delivery/state.yaml` / `docs/delivery/workstreams/place.yaml` (governance).

**This task does not create or activate that implementation task.**

---

## 28. Risks and Mitigations

| Risk | Mitigation |
|---|---|
| Hostinger plan turns out not to support Docker/VPS | §25's first Owner decision resolves this before any implementation work begins; §7.3/§7.4 remain available fallbacks |
| No real production traffic baseline exists to size resources or 5xx-alert thresholds against | §10 clearly labels every figure as an estimate; §18's 5xx alert is explicitly flagged as needing post-launch tuning |
| Redis currently has no password | Flagged in §13/§26 as a pre-launch implementation item; low risk today since Redis is never publicly exposed in the recommended topology |
| API Dockerfile's file-ownership pattern was never specifically tested the way web's was (which had a real, found defect) | Flagged in §5/§27 as an unverified pre-launch check, following the exact verification method PLACE-036 already proved works |
| No `migration:revert` has ever been rehearsed | Flagged in §12/§27 as an implementation-task item before real launch |
| No offsite backup target is currently configured (WAL archiving points locally) | Flagged throughout §11/§26; this is a config change to an already-working script, not new engineering |
| No Docker `HEALTHCHECK` instruction exists in either app Dockerfile | Flagged in §14/§27 as an implementation-task item |

---

## 29. Decision Matrix

Scored 0–10 (10 = best/most-ready). Weighting rationale: **rollback confidence and security readiness are weighted most heavily**, because this is a first-ever production launch for a project handling real user data (auth, contributions) — the cost of getting rollback or security wrong on launch is categorically higher than the cost of, say, imperfect cost optimization or minor implementation complexity, which are both readily fixable after the fact.

| Criterion | Score | Basis |
|---|---|---|
| Deployment compatibility | 8 | Docker artifacts fully built and verified; only the specific hosting provider's Docker support is unconfirmed |
| Infrastructure confidence | 7 | `docker-compose.prod.yml` proven locally, repeatedly; never run on real infrastructure |
| Operational simplicity | 8 | Single-VPS, single-compose-file topology recommended specifically for its simplicity |
| Rollback confidence | 8 | Proven three times this session with real data-continuity checks; only untested against a real deployed environment |
| Monitoring readiness | 6 | A genuinely minimal, cheap, immediately-adoptable stack is ready to recommend; deeper observability is deliberately deferred |
| Backup readiness | 5 | Mechanism exists and is verified locally; offsite target not yet configured |
| Security readiness | 7 | Fail-fast config, redacted logging, rate limiting, CORS allow-list, non-root containers all already implemented; Redis password and Docker-native healthchecks are the two concrete gaps found |
| Cost suitability | 8 | Recommended topology and monitoring stack are both close to the cheapest realistic options |
| Owner dependency | 4 | Several genuine, unavoidable Owner decisions remain (§25) — appropriately scored low, not treated as a defect |
| Implementation complexity | 8 | The proposed implementation-task scope (§27) is small and well-bounded |
| Launch risk | 6 | Moderate — this repository has never been deployed to real infrastructure before; the plan mitigates this with a careful, observed rollout (§23) rather than eliminating the inherent first-deploy risk |

---

## 30. Final Decision

# `READY WITH CONDITIONS`

The technical planning, comparison, and recommendation work this gate covers is complete and evidence-based. The conditions are Owner-side facts and choices this repository cannot resolve on its own (§25) — none of them reflect missing engineering work or an unreliable repository state.

---

## 31. Conditions for Implementation

Before the proposed implementation task (§27) begins:

1. Owner confirms the Hostinger plan supports Docker/VPS/root access (§8), or names an alternative provider.
2. Owner sets a rough budget ceiling sufficient to size the VPS (§10).
3. Owner names the production domain (§22).
4. Owner picks a notification channel for alerts (§18/§25).
5. Owner picks an offsite backup destination (R2/Backblaze/other — §11/§26).

None of these require re-running this decision gate — they are direct inputs the implementation task can simply receive and proceed with.

---

## 32. Files Inspected

`docker-compose.prod.yml`, `docker-compose.yml`, `docs/architecture/deployment.md`, `docs/delivery/reports/PRODUCTION-READINESS-ASSESSMENT-2026-07-24.md`, `docs/delivery/reports/PLACE-026-deployment-pipeline-report.md`, `.github/workflows/ci.yml`, `apps/api/Dockerfile`, `apps/web/Dockerfile`, `apps/api/src/core/config/env.validation.ts`, `apps/api/src/core/database/database.module.ts`, `apps/api/src/core/database/data-source.ts`, `apps/api/src/modules/health/health.controller.ts`, `apps/api/src/modules/health/indicators/redis.health.ts`, `apps/api/src/common/middleware/correlation-id.middleware.ts`, `apps/api/src/core/logger/app-logger.service.ts`, `apps/api/src/core/audit/audit.service.ts`, `.env.example`, `apps/api/package.json`, `infrastructure/docker/postgres/*`, `infrastructure/nginx/.gitkeep`, `infrastructure/k8s/.gitkeep`, `docs/delivery/state.yaml`, `docs/delivery/workstreams/place.yaml`, `docs/delivery/tasks/PLACE-032.yaml`, `docs/delivery/tasks/PLACE-034.yaml`, `docs/delivery/tasks/PLACE-035.yaml`, `docs/delivery/tasks/PLACE-036.yaml`.

## 33. Commands Executed

`git rev-parse HEAD`, `git status --short`, `git remote -v`, `git branch --show-current`, `git log --oneline -5`, `node -v`, `npm -v`, `docker version`, `docker compose version`, `docker ps`, `docker images`, `node -e` version/state checks (js-yaml parse of `state.yaml`/task files), `find`/`grep` searches across `infrastructure/`, `apps/api/src`, `apps/web/src`, `.github/workflows/`, `docs/`.

## 34. Files Changed

None in `apps/`, `packages/`, `docker-compose*.yml`, any Dockerfile, `.github/`, or any environment file — per this task's explicit constraints. Only governance/evidence files were created: `docs/delivery/tasks/PLACE-037.yaml`, this report, and (if governance requires it) `docs/delivery/state.yaml`/`docs/delivery/workstreams/place.yaml` updates.

## 35. Working-Tree Status

Clean before this task began; only the governance files listed above added.

## 36. Commit and Push Status

Commit(s) recorded after this report is finalized (see the delivery-evidence commit). **Nothing pushed** — no git remote is configured in this repository.
