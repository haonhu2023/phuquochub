# PLACE-026 — Production Deployment Pipeline

- **Task:** PLACE-026 (`docs/delivery/tasks/PLACE-026.yaml`)
- **Type:** deployment_infrastructure
- **Date:** 2026-07-24
- **Outcome:** **COMPLETED** — repository-supported subset of Eligible PLACE Candidate 1 implemented and verified
- **Authority:** Owner explicit authorization 2026-07-24, naming Candidate 1 ahead of this package's own suggested-first Candidate 2 (a legitimate owner prerogative — Candidate 1 is fully within the Approved Decision Set and has no dependency on Candidate 2/3)
- **Implements:** `OD2-2`, `OD2-3`, `OD2-4`, `OD2-5`, `OD2-7`, `OD2-8`, `OD2-9` (all Approved, `docs/delivery/decisions/OWNER-APPROVAL-SESSION-2026-07-24.md`)

## 1. Preconditions verified (Phase 1 of the authorizing instruction)

| Precondition | Result |
|---|---|
| PLACE-025 completed | ✅ `state.yaml.completed_tasks` |
| Production Readiness Assessment completed | ✅ `docs/delivery/reports/PRODUCTION-READINESS-ASSESSMENT-2026-07-24.md` |
| Production Readiness Backlog completed | ✅ `docs/delivery/reports/PRODUCTION-READINESS-BACKLOG-2026-07-24.md` |
| Owner Decision Package v2 completed | ✅ `docs/delivery/decisions/OWNER-DECISION-PACKAGE-V2-2026-07-24.md` |
| Owner Approval Session completed | ✅ `docs/delivery/decisions/OWNER-APPROVAL-SESSION-2026-07-24.md` |
| PLACE-026 authorized by the Approved Decision Set | ✅ Candidate 1 implements `OD2-2,3,4,5,7,8,9`, all in the Approved Set |

No precondition was missing.

## 2. A scope boundary recorded before implementation

Several `OD2-x` sub-decisions name a **real external target** — a provisioned Hostinger VPS, a real Cloudflare R2 bucket, a real offsite backup destination, a real MapTiler API key, and an actual `git push` triggering a live GitHub Actions run. **None of these exist in this repository or session:** `git remote -v` is empty, no cloud credentials of any kind are present, and no VPS is reachable from here. Per the authorizing instruction's own "Scope" wording ("repository-supported items"), this task implements everything genuinely deliverable from within the repository and documents, rather than fabricates, what still needs owner-supplied credentials.

## 3. Implementation summary

| Decision | What was built | What still needs owner action |
|---|---|---|
| `OD2-2` (VPS sizing) | `docker-compose.prod.yml` is deliberately resource-agnostic — no code depends on a specific VPS size | Actual VPS provisioning at Hostinger |
| `OD2-3` (media storage) | `docker-compose.prod.yml`'s `minio` service stands in as the local S3-compatible target (same API as R2) | A real Cloudflare R2 bucket + credentials |
| `OD2-4` (PITR/WAL) | `infrastructure/docker/postgres/wal-archive.sh` + WAL flags in `docker-compose.prod.yml` — **verified live**: `archive_mode=on`, a forced `pg_switch_wal()` produced 4 real archived WAL segments | Swapping the script's `cp` line for a real offsite upload command once `OD2-5`'s target exists |
| `OD2-5` (offsite backup) | `WAL_ARCHIVE_DIR` is environment-variable-driven, defaulting to a local path | A real offsite bucket + credentials (same provider family as `OD2-3`) |
| `OD2-7` (registry) | `.github/workflows/ci.yml`'s new `docker-build` job includes a GHCR push step using the auto-provided `GITHUB_TOKEN` (no new secret needed) | Nothing — this will run for real the first time the workflow executes against an actual git remote; **not exercised by a live Actions run in this session** |
| `OD2-8` (tile provider) | `apps/web/src/modules/map/MapView.tsx` reads `NEXT_PUBLIC_MAP_TILE_URL`; default unchanged (current OSM URL) | A MapTiler account + API key, supplied via the same env var — zero code change needed |
| `OD2-9` (deploy strategy) | No blue-green orchestration built (per the recommendation); `docker-compose.prod.yml` uses a simple `restart: unless-stopped` per-service model | None — this *is* the recommended approach |

## 4. Files changed

| File | Change |
|---|---|
| `apps/api/Dockerfile` (new) | Multi-stage build: deps (with bcrypt build toolchain) → build (shared-types/utils/api) → lean alpine runtime, non-root `node` user |
| `apps/web/Dockerfile` (new) | Multi-stage build using Next.js standalone output |
| `apps/web/next.config.mjs` | Added `output: 'standalone'` — build-packaging only, verified zero route/behavior change |
| `.dockerignore` (new) | Keeps the Docker build context lean |
| `docker-compose.prod.yml` (new) | Wires api+web alongside postgres/redis/minio for a full local production-shaped run; does **not** modify the existing dev `docker-compose.yml` |
| `infrastructure/docker/postgres/postgresql.prod.conf` (new) | Documents the WAL/PITR policy (settings are actually applied via `-c` flags in `docker-compose.prod.yml`, per the officially-recommended pattern for the postgres image) |
| `infrastructure/docker/postgres/wal-archive.sh` (new) | `archive_command` target script — local by default, swappable for a real offsite upload command |
| `.github/workflows/ci.yml` | New `docker-build` job: builds both images, boots them against real Postgres/Redis service containers, verifies health, then a documented (not-yet-exercised) GHCR push |
| `apps/web/src/modules/map/MapView.tsx` | Tile URL now reads `NEXT_PUBLIC_MAP_TILE_URL`, default unchanged |
| `docs/architecture/deployment.md` | Implementation-status addendum distinguishing what PLACE-026 built vs. what needs owner-supplied credentials |
| `docs/delivery/tasks/PLACE-026.yaml` (new) | Task record |

**Not touched:** any entity, migration, repository/service class, API contract/DTO, authentication logic, or the existing dev `docker-compose.yml`.

## 5. Verification totals (Node v20.20.2 / npm 10.8.2)

| Check | Result |
|---|---|
| Full lint (api + web) | ✅ exit 0 both |
| Full typecheck (api + web) | ✅ exit 0 both |
| Full unit | ✅ **221/221**, 30 suites — **identical to PLACE-025 baseline** |
| Full API e2e | ✅ **44/44**, 8 suites — **identical to PLACE-025 baseline** |
| Clean build (`turbo --force`, tsbuildinfo purged) | ✅ 4/4, 0 cached |
| Artifacts | ✅ `main.js`/`app.module.js`/`core/`; **153==153**; `web/.next/standalone` present |
| CI YAML syntax | ✅ parses |
| `docker-compose.prod.yml` syntax | ✅ `docker compose config` succeeds |

Identical unit/e2e totals to PLACE-025 prove zero regression to existing application behavior.

## 6. Deployment verification (real, not simulated)

| Check | Method | Result |
|---|---|---|
| `apps/api/Dockerfile` builds | `docker build -f apps/api/Dockerfile -t phuquochub-api:test .` | ✅ succeeded (after fixing a missing `tsconfig.base.json` COPY, caught by the build itself) |
| `apps/web/Dockerfile` builds | `docker build -f apps/web/Dockerfile -t phuquochub-web:test .` | ✅ succeeded |
| API image boots + connects to real Postgres/Redis | `docker run` on the existing compose network, pointed at `phuquoc-postgres`/`phuquoc-redis` | ✅ `/api/health` → 200, `database:up`, `redis:up (PONG)` |
| Web image boots + serves | `docker run`, then `curl /` | ✅ 200; a static JS chunk also verified 200 (standalone-mode static-asset pitfall explicitly checked) |
| WAL archiving actually archives | Isolated postgres container with the exact `-c` flags from `docker-compose.prod.yml`, `wal-archive.sh` mounted, then `pg_switch_wal()` | ✅ `archive_mode=on`, `wal_level=replica`; **4 real WAL segments** found in the archive directory afterward |
| Source-level boot unaffected by `output: 'standalone'` | `node dist/main.js` + `next start` (traditional path, not Docker) | ✅ `/api/health` 200, web `/` 200, `/map` 200 |
| Health/startup (traditional path) | Same as PLACE-020 onward's established pattern | ✅ 200, db up, redis up |

## 7. An incident during verification, corrected immediately

While testing `docker-compose.prod.yml` with `docker compose -f docker-compose.prod.yml up -d postgres` (no explicit `-p` project flag), Compose resolved both that file and the pre-existing dev `docker-compose.yml` under the **same default project name** (both live in the same directory), and reconciling the two "postgres" service definitions caused it to **remove the running dev `phuquoc-postgres` container**. This was caught immediately:
- The underlying named volume (`phuquochub_pg_data`) was **never touched** — only the container was removed.
- The dev container was recreated via `docker compose -f docker-compose.yml up -d postgres`, reattaching to the same volume.
- Data integrity was verified immediately after: migrations table = 20 rows, `places` = 49 rows, all 6 extensions present — **identical to before the incident**.
- All further `docker-compose.prod.yml` testing used an explicit `-p phuquochub-prod-verify` project name to guarantee isolation from the dev stack; this is recorded here so the same mistake isn't repeated in a future task.

No data was lost. The dev environment was fully restored and independently verified before continuing.

## 8. Remaining risks

- **The GHCR push step in CI is unverified by an actual Actions run** — no git remote exists in this repository/session. It follows the standard, documented GHCR + `GITHUB_TOKEN` pattern and is expected to work, but this is stated as a residual risk, not a proven fact.
- **No real VPS, R2 bucket, offsite backup target, or MapTiler account exists.** `docker-compose.prod.yml` is a faithful local stand-in (MinIO for R2, a local path for the WAL archive) but is not itself a production deployment.
- **Blue-green deployment is intentionally not built** (`OD2-9`'s recommendation) — the first several real deploys will need a brief maintenance window.
- **Migrations are not baked into the runtime image** — they're run as a separate step (matching the existing e2e job's pattern: `npm run migration:run` against the target DB before the app container starts), which is the correct "migration gating" pattern per `deployment.md §7`, but requires the deploy process to actually perform that step once a real target exists.

## 9. Non-claims

This task does not provision a real VPS, Cloudflare R2 bucket, offsite backup destination, or MapTiler account, and does not verify a live GHCR push or a real disaster-recovery restore. It does not implement Eligible Candidates 2 or 3, and does not begin PLACE-027.
