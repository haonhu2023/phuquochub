# PhuQuocHub — Production Readiness Reassessment v2

- **Date:** 2026-07-24
- **Scope:** Repository-wide governance reassessment, post-PLACE-028
- **Nature:** Governance and verification only. No runtime code, dependency, or infrastructure change. No PLACE-029 created. Nothing deployed. Nothing pushed.
- **Repository:** `D:\Projects\PhuQuocHub` (branch `master`, working tree clean throughout)
- **Method:** Fresh, live re-execution of the full verification ladder under the pinned toolchain (Node v20.20.2 / npm 10.8.2), fresh `npm audit`, fresh Docker image builds and live boots against the real dev Postgres/Redis, and a section-by-section reconciliation of every finding in the prior `PRODUCTION-READINESS-ASSESSMENT-2026-07-24.md` and `PRODUCTION-READINESS-BACKLOG-2026-07-24.md` against current repository state. No conclusion below is copied from the prior assessment without being independently re-verified in this session.
- **Environment note:** a real deviation was caught and corrected during this reassessment: the default shell in this session resolves `node`/`npm` to a system install (v24.18.0 / npm 11.16.0), not the project's pinned Node v20.20.2 / npm 10.8.2. Every verification command in this report was re-run after explicitly prepending the pinned portable install to `PATH`. This is recorded as a fresh finding (§Phase 3, "Verification-environment discipline").

---

## Phase 1 — Authority and state verification

| Check | Result | Evidence |
|---|---|---|
| PLACE-026/027/028 reports exist | ✅ | `docs/delivery/reports/PLACE-026-deployment-pipeline-report.md`, `PLACE-027-dependency-security-report.md`, `PLACE-028-api-bootstrap-hardening-report.md` — all present |
| PLACE-026/027/028 evidence indexes exist | ✅ | corresponding `docs/delivery/evidence/PLACE-0{26,27,28}-*-evidence-index.md` — all present |
| Task records show `completed` | ✅ | `docs/delivery/tasks/PLACE-026.yaml:7`, `PLACE-027.yaml:7`, `PLACE-028.yaml:7` — all `status: completed` |
| Delivery state has no active task | ✅ | `docs/delivery/state.yaml:33` — `current.task: none`, `status: awaiting_task_authorization` |
| Working tree clean | ✅ | `git status --short` — empty, both at start and end of this reassessment |
| No PLACE-029 exists | ✅ | `docs/delivery/tasks/PLACE-029.yaml` — does not exist |
| No unapproved implementation in progress | ✅ | no staged/unstaged diff of any kind found before this task began |
| All three Owner Approval Session candidates accounted for | ✅ | `state.yaml` `eligible_candidate_disposition`: Candidate 1 IMPLEMENTED (PLACE-026), Candidate 2 PARTIALLY IMPLEMENTED per its own narrower scope (PLACE-027), Candidate 3 IMPLEMENTED (PLACE-028) |

**No discrepancy found. Phase 1 passes cleanly.**

---

## Phase 2 — Fresh repository verification

All commands re-run live in this session under the pinned toolchain, with the dev stack (`phuquoc-postgres`/`-redis`/`-minio`) healthy throughout and untouched afterward.

| Check | Result | Evidence |
|---|---|---|
| Lint (api) | ✅ exit 0 | `eslint "src/**/*.ts" --max-warnings=0` |
| Typecheck (api) | ✅ exit 0 | `tsc -p tsconfig.json --noEmit` |
| Typecheck (web) | ✅ exit 0 | `tsc --noEmit` |
| Unit tests | ✅ **223/223**, 31 suites | `jest` (pinned Node) |
| API e2e tests | ✅ **51/51**, 9 suites | `jest --config test/jest-e2e.json` against real Postgres/PostGIS + Redis |
| Clean monorepo build | ✅ **4/4**, real artifacts confirmed (after a real anomaly was found and fixed — see below) | `turbo run build --force` |
| Docker image buildability (api) | ✅ | `docker build -f apps/api/Dockerfile -t phuquochub-api:reassess-v2 .` — succeeded |
| Docker image buildability (web) | ✅ | `docker build -f apps/web/Dockerfile -t phuquochub-web:reassess-v2 .` — succeeded |
| Production Compose syntax | ✅ | `docker compose -p phuquochub-reassess-v2-verify -f docker-compose.prod.yml config --quiet` — resolved cleanly, isolated project name used, **no containers started** |
| API production-image boot | ✅ | booted on `phuquochub_default` network against real `phuquoc-postgres`/`phuquoc-redis` |
| Web production-image boot | ✅ | booted, `GET /` → 200 |
| `/api/health` | ✅ | `{"status":"ok","database":"up","redis":"up (PONG)"}` |
| Database connectivity | ✅ | live TypeORM ping to real Postgres, confirmed via health payload |
| Redis connectivity | ✅ | live `PING`→`PONG`, confirmed via health payload |
| CORS allow-list behavior | ✅ | `Origin: http://localhost:3000` → `Access-Control-Allow-Origin: http://localhost:3000` reflected |
| CORS rejection behavior | ✅ | `Origin: https://evil.example.com` → header absent/not reflected |
| Preflight behavior | ✅ | `OPTIONS /api/auth/login` → `204`, `Access-Control-Allow-Methods: GET,POST,PATCH,DELETE,OPTIONS`, `Access-Control-Allow-Headers: Content-Type,Authorization` |
| Live rate-limit behavior | ✅ | 5 requests to `/api/auth/login` (bad credentials, test override `RATE_LIMIT_AUTH_LIMIT=5`) → `401` each; 6th → `429` |
| Health-check throttle exemption | ✅ | `/api/health` stayed `200` throughout the above loop |
| Configuration fail-fast behavior | ✅ | booting with `NODE_ENV=production` and `CORS_ALLOWED_ORIGINS` unset → immediate crash: `Config validation error: "CORS_ALLOWED_ORIGINS" is required` |
| CI workflow syntax | ✅ | parses as valid YAML; full manual read confirms `build-test`/`e2e`/`docker-build` jobs are logically complete and consistent with current code (the `docker-build` job's API boot step already carries `CORS_ALLOWED_ORIGINS`, added in PLACE-028) |
| CI workflow — **never live-executed** | ⚠️ open, unchanged since PLACE-026 | no git remote exists (`git remote -v` → empty); GitHub Actions has never run this workflow for real |
| Delivery-state YAML validity | ✅ | `state.yaml`, `workstreams/place.yaml`, all three task YAMLs — parse cleanly via `js-yaml` |

### A real finding surfaced during this phase: stale local `.tsbuildinfo` produced a false-positive "successful" build with empty output

The first `turbo run build --force` run in this reassessment reported **"4/4 successful, 0 cached"** but produced a `WARNING no output files found for task @phuquochub/api#build` and `apps/api/dist/` contained **only** `tsconfig.tsbuildinfo` — no `main.js`, no `app.module.js`, nothing runnable. Root cause, confirmed by direct investigation:

- `apps/api/tsconfig.build.tsbuildinfo` (TypeScript's own incremental-compile cache, **outside** the `dist/` directory it describes) survived a prior `dist/` deletion on this local machine.
- TypeScript's `--incremental` mode decides whether to re-emit based on this cache file's content hashes, not on whether the described output files still exist. With the cache intact but `dist/` empty, `tsc`/`nest build` reported success while emitting nothing.
- `turbo --force` only bypasses **Turborepo's own** cache; it has no visibility into TypeScript's independent incremental cache, so it could not detect or prevent this.

**This does not affect CI or Docker.** `.gitignore` and `.dockerignore` both exclude `*.tsbuildinfo` and `dist/`, confirmed by direct inspection — a fresh `git clone` (what CI does) or a fresh Docker build context (what every image build does) never carries this file, so every Docker build and every CI run performed to date, including the ones in this session, compiled from a genuinely clean state. This is a **local-development-machine hazard only**: `npm run clean` (`rimraf dist`) does not remove `tsconfig.build.tsbuildinfo`, so a developer running `clean` then `build` on a persistent machine can get a silent, artifact-free "successful" build. After deleting the stray file and re-running, the build produced real artifacts (`dist/main.js`, `dist/app.module.js`, 308 files; `apps/web/.next` with `BUILD_ID`, `standalone/`, `static/`; both shared packages' `dist/index.js`).

**Classification:** new, low-severity, repository-hygiene finding. **Recommendation:** add `*.tsbuildinfo` removal to `apps/api/package.json`'s `clean` script (currently `rimraf dist` only). Not release-blocking; does not require an Owner Decision; eligible for a trivial future task or folding into unrelated work.

---

## Phase 3 — Previous blocker reconciliation

Classification legend: **RESOLVED** (verified fixed) · **PARTIALLY RESOLVED** · **STILL OPEN** (verified unchanged) · **SUPERSEDED** (decision changed the frame) · **N/A** (no longer applicable).

| # | Item (from prior assessment) | Classification | Evidence |
|---|---|---|---|
| 1 | R-01 — No deployable artifact or pipeline | **RESOLVED** | `apps/api/Dockerfile`, `apps/web/Dockerfile`, `docker-compose.prod.yml` all exist and were rebuilt + booted live in this session (§Phase 2); `.github/workflows/ci.yml`'s `docker-build` job reproduces this automatically (PLACE-026) |
| 2 | R-02 — Dependency vulnerabilities, no scanning | **PARTIALLY RESOLVED** | The *safe* subset was patched (PLACE-027: `fast-uri` only). **No CI SCA/scan step was added** — `npm audit` is still never invoked by `.github/workflows/ci.yml`. See Phase 4 for the fresh vulnerability count (18 prod, up from 17 — see below). |
| 3 | R-03 — No rate limiting on public API | **RESOLVED** | PLACE-028: global + auth-specific throttling, live-proven 429 in this session |
| 4 | R-04 — Permissive CORS with credentials | **RESOLVED** | PLACE-028: explicit allow-list, `credentials` default `false`, fail-fast in production, live-proven in this session |
| 5 | R-05 — No monitoring/alerting/APM | **STILL OPEN** | `grep -l "prometheus\|grafana\|sentry\|@sentry"` across both `package.json` files → no hits. Zero change since the prior assessment. |
| 6 | R-06 — Insecure default DB credentials | **STILL OPEN** | `env.validation.ts:12-14` — `DB_USER`/`DB_PASSWORD`/`DB_NAME` still `Joi.string().default(...)`, not `required()`. Unchanged. |
| 7 | R-07 — Four planned modules unbuilt (community/contributions/notifications/reviews) | **STILL OPEN** | directories still `.gitkeep`-only; blocking only if a full-product-vision launch is claimed (owner scope decision, OD2-1, already recorded as the owner's prerogative) |
| 8 | R-08 — ADR-008 verification workflow not implemented | **STILL OPEN** | no `verifications`/`verification_events`/`verification_votes` tables in any of the 20 migrations; only the cached `verification_status` enum column exists |
| 9 | R-09 — README materially stale | **STILL OPEN** | not touched by PLACE-026/027/028 (out of scope for all three); README still describes the environment as unverified and several implemented modules as not started |
| 10 | TD-01 — PLACE-021/022/023 task-file status lag | **STILL OPEN** | `docs/delivery/tasks/PLACE-021.yaml:7`/`PLACE-022.yaml:7`/`PLACE-023.yaml:7` still read `status: authorized`, not `completed` (self-consistency only; `state.yaml` remains authoritative and correct) |
| 11 | TD-02 — Stale `highest_leverage_fix` note | **STILL OPEN** | `state.yaml:101` (renumbered from the prior report's line 102) still names GAP-05/10, resolved since PLACE-021 |
| 12 | TD-03 — `AppLoggerService` built but never wired | **STILL OPEN** | `grep -rn "useLogger" apps/api/src` → zero hits; the service still only self-references |
| 13 | TD-05 — `packages/database` Prisma stub | **SUPERSEDED** | PLACE-025 explicitly decided (ADR-013 addendum) to keep it as documentation-only, non-runtime reference rather than delete it — this is a resolved decision, not an open gap |
| 14 | Reproducible production builds | **PARTIALLY RESOLVED, with a new caveat** | CI/Docker builds are genuinely reproducible (fresh checkout every time); a **local-machine-only** incremental-cache hazard was found and documented this session (see Phase 2) — does not affect any shipped artifact |
| 15 | Docker images | **RESOLVED** | both images build and boot successfully, re-verified fresh in this session |
| 16 | CI/CD validation | **PARTIALLY RESOLVED** | CI's `build-test`/`e2e`/`docker-build` jobs are real, logically complete, and independently reproduced locally; **the workflow itself has never executed on GitHub Actions** because no git remote exists — "CI validation" is proven by local reproduction of every step, not by a live Actions run |
| 17 | Deployment packaging | **RESOLVED** (locally) | multi-stage Dockerfiles, `docker-compose.prod.yml`, all verified; no actual external deploy target exists (see Phase 7) |
| 18 | Startup and health verification | **RESOLVED** | live-proven repeatedly, including in this session |
| 19 | WAL archiving | **RESOLVED (mechanism), STILL OPEN (destination)** | `archive_mode=on`, `wal_level=replica` verified live in PLACE-026 (unchanged since); destination is still a **local directory** (`WAL_ARCHIVE_DIR`), not an offsite target |
| 20 | Backup destination | **STILL OPEN** | no offsite backup target configured or provisioned anywhere; `wal-archive.sh`'s own comment states this explicitly |
| 21 | Rollback readiness | **STILL OPEN** | no deployed environment exists to roll back from; no rollback rehearsal has ever been performed; `git revert` capability exists at the code level only |
| 22 | Release artifact publication | **STILL OPEN, unverified** | CI's GHCR push step exists (PLACE-026) but is gated on `github.event_name == 'push'` to `main`/`develop` on a real remote — never executed, since no remote exists |
| 23 | CORS | **RESOLVED** | see #4 above |
| 24 | Rate limiting | **RESOLVED** | see #3 above |
| 25 | Trusted proxy handling | **RESOLVED (safe default), STILL OPEN (no real proxy exists to configure for)** | `TRUST_PROXY_HOPS` env var added (PLACE-028), default `0` — correct and safe for the current no-proxy topology; will need a nonzero value once a real reverse proxy is deployed (external prerequisite, not a code gap) |
| 26 | Secrets management | **STILL OPEN** | still purely `.env`-file based; no Vault/cloud-KMS/GitHub-Environments rotation integration exists |
| 27 | Environment validation | **RESOLVED (expanded)** | Joi fail-fast schema now also covers rate-limit/CORS/proxy config (PLACE-028), in addition to the pre-existing JWT-secret enforcement; DB credentials remain the one un-hardened exception (see #6) |
| 28 | Dependency vulnerabilities | **STILL OPEN, count changed** | see Phase 4 — 18 prod findings now (was 17 at PLACE-027's close), net **+1 high**, traced to newly-disclosed `lodash` advisories on an already-present transitive dependency, **not** to any change made in PLACE-028 (confirmed: `@nestjs/throttler` has zero transitive dependencies of its own) |
| 29 | Monitoring | **STILL OPEN** | see #5 |
| 30 | Logging | **STILL OPEN (same shape)** | request/exception logging via plain Nest `Logger`; `AppLoggerService` still dead code (see #12); no aggregation/correlation IDs |
| 31 | Alerting | **STILL OPEN** | no alerting mechanism or recipient list exists anywhere |
| 32 | TLS | **STILL OPEN** | `infrastructure/nginx/` still `.gitkeep`-only; no TLS termination exists anywhere in-repo |
| 33 | Domain and DNS | **STILL OPEN** | no domain owned/verified; `git remote -v` confirms no remote either |
| 34 | External object storage | **STILL OPEN, more precisely scoped this session** | MinIO is provisioned as infra (`docker-compose.prod.yml`) but **no application code references S3/MinIO at all** (`grep -rln "S3_ENDPOINT\|@aws-sdk\|minio" apps/api/src` → zero hits); the `media` module has an entity/mapper/repository but **no service, no controller, no upload endpoint** — object storage is infrastructure-ready but feature-unbuilt |
| 35 | Staging environment | **STILL OPEN** | `docker-compose.prod.yml` is explicitly documented as "prod-shaped, entirely local" (its own header comment) — not a real staging environment; no VPS/cloud target of any kind exists |
| 36 | Database migration execution | **RESOLVED, re-verified** | 20 migrations, clean re-apply, confirmed via live containers this and every prior session |
| 37 | Disaster recovery | **STILL OPEN** | `deployment.md` only *designs* RPO/RTO targets (§ "RPO/RTO rõ ràng"); no DR drill, no restore-from-backup test, has ever been performed |
| 38 | Release runbook | **STILL OPEN** | `docs/delivery/ENVIRONMENT-SETUP-RUNBOOK.md` exists but is a **local dev-environment setup guide**, not a release/rollback runbook; no such document exists |
| 39 | Operational ownership | **STILL OPEN** | no on-call rotation, no named operational owner, no incident process defined anywhere in the repository |

### New finding not in the prior assessment: verification-environment discipline

This reassessment's own Phase 2 work caught that the default shell environment does **not** resolve to the project's pinned Node v20.20.2/npm 10.8.2 — it resolves to a system Node v24.18.0/npm 11.16.0 instead. Every verification command in every PLACE task since PLACE-020 was supposed to run under the pinned toolchain; whether every single one of them genuinely did, versus silently running under whatever the shell of that moment defaulted to, cannot be retroactively audited from this session alone. Functionally, the two Node majors did not produce different test/build outcomes in this session's own side-by-side use — but the standing project rule ("pinned portable install for all verification") depends on discipline enforced per-command, not on shell persistence, and this session's own tooling does not persist `PATH` exports between tool invocations. **Classification: process/tooling risk, not a code defect.** No action taken beyond documenting it here and using the pinned toolchain explicitly for every command in this reassessment going forward.

---

## Phase 4 — Dependency-risk reassessment

Fresh evidence: `npm audit --omit=dev --json` and `npm audit --json`, both run under the pinned toolchain in this session.

### Production dependencies

| Metric | Count |
|---|---|
| Total | 18 |
| Critical | 1 |
| High | 7 |
| Moderate | 10 |
| Low | 0 |
| Directly reachable (direct dependency of `@phuquochub/api`/`@phuquochub/web`) | 8 — `@nestjs/common`, `@nestjs/config`, `@nestjs/core`, `@nestjs/platform-express`, `@nestjs/terminus`, `@nestjs/typeorm`, `bcrypt`, `next` |
| Install-time-only (never loaded/executed by the running server) | 3 — `@mapbox/node-pre-gyp`, `tar` (both: native-binary staging during `npm install`/Docker build only), plus `bcrypt`'s own flagged entry (the vulnerability is in its *install tooling*, not its runtime hashing code) |
| Transitive-only, loaded at runtime | 9 — `body-parser`, `express`, `file-type`, `lodash`, `multer`, `postcss`, `qs`, `uuid` (8 — `postcss` is loaded into `node_modules` but executed only during `next build`, not at request time, so it is functionally build-time despite being a runtime-resolvable package) |

### Development dependencies

| Metric | Count |
|---|---|
| Total (dev-only, not counted above) | 15 |
| Critical | 0 |
| High | 6 — `@nestjs/cli`, `@next/eslint-plugin-next`, `eslint-config-next`, `glob`, `picomatch`, `tmp` |
| Moderate | 6 — `@angular-devkit/core`, `@angular-devkit/schematics`, `@angular-devkit/schematics-cli`, `@nestjs/schematics`, `@nestjs/testing`, `ajv` |
| Low | 3 — `external-editor`, `inquirer`, `webpack` |

Reconciliation check: prod (18) + dev-only (15) = 33 = the `--include dev` total, confirming no double-count or omission.

### Change since PLACE-027

PLACE-027 closed with **17** prod findings (1 critical, 6 high, 10 moderate, 0 low). This reassessment finds **18** (1 critical, **7** high, 10 moderate, 0 low) — a net **+1 high**. Root-caused: `@nestjs/throttler@6.4.0` (added in PLACE-028) has **zero transitive dependencies of its own** (`npm ls @nestjs/throttler --all` shows nothing beneath it), so it did not and could not introduce this. The new `lodash` finding traces to `@nestjs/config@3.3.0` (present since before PLACE-026, untouched by any PLACE-026/027/028 change) — its advisory set expanded between PLACE-027's audit and this one, which is ordinary public-advisory-database drift over elapsed wall-clock time, not a consequence of any change made in this repository.

### Per-vulnerability detail (all 18 production findings)

| Package | Severity | Direct/Transitive | Exposure | Fix path | Major required? | Blocks staging? | Blocks beta? | Blocks public? |
|---|---|---|---|---|---|---|---|---|
| `tar` | Critical | Transitive (`bcrypt`→`@mapbox/node-pre-gyp`→`tar`) | **Install-time only** — used to unpack a prebuilt native binary during `npm install`/Docker build; never loaded by the running server | `bcrypt@6.0.0` removes the entire `node-pre-gyp`/`tar` chain outright (confirmed: `bcrypt@6.0.0`'s only dependencies are `node-addon-api`/`node-gyp-build` — no `tar` anywhere) | **Yes** (bcrypt 5→6), but a clean, isolated, low-blast-radius bump | No | No | Recommended before public launch |
| `@nestjs/platform-express` | High | Direct | **Runtime** — the HTTP server for every request | NestJS 11 ecosystem (Program A) | Yes | No | No | Recommended before public launch |
| `multer` | High | Transitive (via `platform-express`) | Present in the dependency tree but **no reachable code path** — `grep -rln "FileInterceptor\|multer\|@UploadedFile" apps/api/src` → zero hits; no upload feature is implemented | NestJS 11 ecosystem | Yes | No | No | Recommended (becomes materially relevant once upload is built) |
| `next` | High | Direct | **Runtime** — the entire web server | Next 16 (Program B) | Yes | No | No | Recommended before public launch |
| `postcss` | High | Transitive (via `next`) | **Build-time only** — CSS is compiled once during `next build`, not reprocessed per request | Next 16 (Program B) | Yes | No | No | Recommended |
| `lodash` | High | Transitive (via `@nestjs/config`) | Loaded at process boot for config merging; the vulnerable functions (`_.template`/`_.unset`/`_.omit`) are not invoked with any user-controlled input in this codebase — config keys come from env vars, not requests | `@nestjs/config@4.0.4` | Yes | No | No | Recommended |
| `@mapbox/node-pre-gyp` | High | Transitive (via `bcrypt`) | **Install-time only** | Same as `tar` — `bcrypt@6.0.0` | Yes (bcrypt) | No | No | Recommended |
| `bcrypt` | High (flagged for its dependency) | Direct | Install-tooling only; the runtime hashing code itself is not the vulnerable surface | `bcrypt@6.0.0` | Yes, but clean/isolated | No | No | Recommended |
| `@nestjs/core` | Moderate | Direct | **Runtime** — framework core, active on every request | NestJS 11 | Yes | No | No | Recommended |
| `@nestjs/config` | Moderate | Direct | Runtime, boot-time config load only | `4.0.4` | Yes | No | No | Recommended |
| `@nestjs/terminus` | Moderate | Direct | Runtime, but only serves `/api/health` — minimal functional surface | NestJS 11 | Yes | No | No | Recommended |
| `@nestjs/typeorm` | Moderate | Direct | Runtime — every DB query goes through this integration layer | NestJS 11 (TypeORM itself does **not** need to change — see Phase 5) | Yes | No | No | Recommended |
| `body-parser` | Moderate | Transitive (via `platform-express`) | **Runtime** — parses every POST/PATCH body | NestJS 11 | Yes | No | No | Recommended |
| `express` | Moderate | Transitive (via `platform-express`) | **Runtime** — foundational middleware for every request | NestJS 11 | Yes | No | No | Recommended |
| `file-type` | Moderate | Transitive (via `@nestjs/common`) | Present but **no reachable code path** — `grep -rln "FileTypeValidator\|ParseFilePipe" apps/api/src` → zero hits | NestJS 11 (`@nestjs/common` exact-pins `file-type@20.4.1`) | Yes | No | No | Recommended |
| `qs` | Moderate | Transitive (via `express`) | **Runtime** — parses every request's query string (e.g. every `/places?page=&limit=` call) | NestJS 11 | Yes | No | No | Recommended |
| `uuid` | Moderate | Transitive (via `@nestjs/typeorm`) | Runtime, but only for server-generated entity IDs — not attacker-controlled input | NestJS 11 | Yes | No | No | Recommended |
| `@nestjs/common` | Moderate | Direct | **Runtime** — framework core, used everywhere | NestJS 11 | Yes | No | No | Recommended |

**No production vulnerability found in this reassessment currently blocks staging or restricted beta.** All 18 are, at most, "recommended before public production launch," and this recommendation is driven by the two clear ecosystem-level fixes (Program A/B, both major) plus one clean, isolated, low-risk fix (`bcrypt` 5→6) — not by any demonstrated live exploit against this codebase.

### A correction to `npm`'s own dry-run labeling (verified, not assumed)

`npm audit fix --dry-run` (no `--force`) labels both `tar` and `file-type`/`@nestjs/common` as **"fix available via `npm audit fix`"** — implying a non-major fix exists. Direct range inspection disproves this for both:
- `@mapbox/node-pre-gyp@1.0.11`'s own `package.json` pins `tar` to `^6.1.11`; the latest `tar` 6.x release ever published is `6.2.1` (confirmed via `npm view tar versions`) — **no patched 6.x release exists**, and `node-pre-gyp`'s own latest 1.x release is `1.0.11` itself (confirmed via `npm view @mapbox/node-pre-gyp versions`) — there is no non-major path to a patched `tar`.
- `@nestjs/common@10.4.22`'s own `package.json` **exact-pins** `file-type` to `20.4.1` (not a range) — the patched version is `21.3.2`+ — again, no non-major path exists.

This does not change PLACE-027's original conclusion (both packages genuinely require a major bump upstream); it confirms it with fresh, independent evidence rather than trusting the audit tool's own summary label at face value. **No upgrade of any kind was performed in this reassessment.**

---

## Phase 5 — Major-version migration decision analysis

### Program A — NestJS 10 → NestJS 11

| Dimension | Finding |
|---|---|
| Packages affected | 9 direct: `@nestjs/common`, `@nestjs/config`, `@nestjs/core`, `@nestjs/jwt`, `@nestjs/platform-express`, `@nestjs/terminus`, `@nestjs/typeorm`, plus dev-only `@nestjs/cli`, `@nestjs/schematics`, `@nestjs/testing` |
| Peer-dependency implications | `@nestjs/platform-express@11.1.28` **requires** `@nestjs/common`/`@nestjs/core` to also be `^11.0.0` — confirmed via `npm view` — this is an all-or-nothing ecosystem bump, not an incremental one |
| Likely breaking changes | Standard NestJS major-version pattern: platform-express's Express/body-parser/multer major bumps ripple into request-handling edge cases (body size limits, multipart parsing); `@nestjs/config@4.x` changes its lodash-based merge internals |
| API bootstrap implications | `main.ts`'s `NestFactory.create<NestExpressApplication>`, guard registration (`APP_GUARD`), and `ValidationPipe` usage are all stable NestJS 10/11 APIs — no rewrite expected there |
| Throttler compatibility | **Confirmed non-blocking**: `@nestjs/throttler@6.5.0`'s peer range is `@nestjs/common`/`@nestjs/core: ^7‖^8‖^9‖^10‖^11` — already compatible with NestJS 11, no throttler change needed |
| TypeORM implications | **Confirmed non-blocking**: `@nestjs/typeorm@11.0.3`'s peer range is `typeorm: ^0.3.0 ‖ ^1.0.0-dev` — the currently-installed `typeorm@0.3.31` satisfies this already; **TypeORM itself does not need to move** for this migration |
| Test impact | All 223 unit + 51 e2e tests use `@nestjs/testing`'s `Test.createTestingModule` — a stable API across the major boundary; expect targeted breakage only where DTO validation error shapes or exception-filter internals shifted, not a wholesale rewrite |
| Estimated engineering effort | Medium — one coordinated PR bumping 9 packages together, full regression re-run, likely 1-3 days including investigation of any NestJS 11 behavioral changes surfaced by the existing test suite |
| Migration sequencing | Single atomic bump (cannot be done package-by-package due to the peer constraint above); should follow immediately after a full green baseline, with the existing 274-test suite as the primary regression detector |
| Rollback strategy | `git revert` of the single migration commit + `package-lock.json`; no schema/migration/data change involved, so rollback is a pure code revert |
| Deferrable until after staging? | **Yes.** Every affected vulnerability is either install-time-only, build-time-only, or requires no demonstrated user-controlled input in this codebase (Phase 4). Nothing here blocks a staging deployment. |

### Program B — Next.js 14 → Next.js 16

| Dimension | Finding |
|---|---|
| Packages affected | `next`, `eslint-config-next` (direct); `@next/eslint-plugin-next` (transitive, dev) |
| React compatibility | **Confirmed non-blocking for React itself**: `next@16.2.11`'s peer range accepts `react`/`react-dom: ^18.2.0 ‖ ^19.0.0` — the currently-installed React `18.3.1` satisfies this; a React 19 bump is *not* forced |
| Optional peers | `sass`, `@playwright/test`, `@opentelemetry/api`, `babel-plugin-react-compiler` are all listed `optional: true` (confirmed via `npm view next@16.2.11 peerDependenciesMeta`) — none of these need to be installed |
| App Router implications | The app already uses App Router exclusively (`apps/web/src/app/`, no `pages/` directory found) — no dual-router migration burden |
| Build/runtime implications | `engines.node: ">=20.9.0"` — the pinned Node v20.20.2 already satisfies this |
| Standalone Docker implications | `apps/web/next.config.mjs` already sets `output: 'standalone'` (added in PLACE-026) — this is the config shape Next 16 also expects; the Dockerfile's `COPY .next/standalone` pattern should carry forward unchanged |
| Lint/tooling implications | **A real, previously-unrecorded finding**: `eslint-config-next@16.2.11` requires `eslint: >=9.0.0`; the repo currently runs `eslint@8.57.1` with **legacy `.eslintrc` config** (`.eslintrc.cjs`, `apps/web/.eslintrc.json` — confirmed, no `eslint.config.*` flat-config file exists anywhere). This migration therefore also forces an **ESLint 8→9 flat-config rewrite**, a separate breaking change with its own migration effort, not merely a version-number bump. |
| Test impact | Web has minimal existing test coverage (3 spec files per the prior assessment, unchanged) — low regression-detection surface; most risk is discovered via manual smoke-testing of the built app, not automated tests |
| Estimated engineering effort | Medium-High — Next major bump itself is usually mechanical, but the forced ESLint flat-config migration adds a distinct, separately-scoped effort; estimate 2-4 days including the lint-config rewrite |
| Migration sequencing | Next.js bump and ESLint flat-config migration should be scoped as two explicit steps within one task (or two small tasks), since they are logically separable even though the Next bump forces the ESLint one |
| Rollback strategy | `git revert`; no data/schema involvement; purely a build-tooling and framework-version change |
| Deferrable until after staging? | **Yes.** `next`'s and `postcss`'s vulnerabilities are runtime (web server) and build-time respectively, but nothing in this codebase's actual usage has been shown to be exploited, and no external users exist yet. Deferrable with the same reasoning as Program A. |

### Independence of the two programs

Programs A and B share **no forced coupling**: NestJS lives entirely in `apps/api`, Next.js entirely in `apps/web`; they are separate npm workspaces with independent `package.json` files and no cross-package version constraint found linking them. **Each is independently decidable and independently deferrable.** Nothing in this repository's evidence requires bundling them into one mandatory combined task.

### A third, smaller, independently-actionable finding: `bcrypt` 5→6

Distinct from both programs above: `bcrypt@6.0.0` is a clean, isolated major bump (`apps/api` only, one direct dependency) that **fully eliminates** the critical `tar` vulnerability and the high `@mapbox/node-pre-gyp` vulnerability by removing the entire native-build-tooling dependency chain (confirmed: `bcrypt@6.0.0`'s only two dependencies are `node-addon-api`/`node-gyp-build`, no `tar` anywhere in its tree). This is unrelated to NestJS or Next and does not require either migration program to proceed first. It is surfaced here as fresh evidence, not as a third mandatory "Program" the user did not ask for — see Phase 10 for it as a candidate.

---

## Phase 6 — Environment readiness matrix

Legend: **READY** · **READY WITH CONDITIONS** · **NOT READY** · **N/A**

| Environment | App build | App security | Dependency security | Data layer | Backup/recovery | Deployment automation | Observability | Secrets | Networking | Domain/TLS | Operational ownership | Rollback | **Overall** |
|---|---|---|---|---|---|---|---|---|---|---|---|---|---|
| **Local development** | READY | READY | READY WITH CONDITIONS¹ | READY | N/A | N/A | N/A | READY | N/A | N/A | N/A | N/A | **READY** |
| **CI** | READY | READY | READY WITH CONDITIONS¹ | READY (ephemeral service containers) | N/A | READY (build-test/e2e jobs live-reproduced) | N/A | READY (CI secrets, placeholder) | N/A | N/A | N/A | N/A | **READY** |
| **Internal integration** | READY | READY | READY WITH CONDITIONS¹ | READY | NOT READY² | READY WITH CONDITIONS³ | NOT READY | READY WITH CONDITIONS⁴ | N/A | N/A | NOT READY⁵ | NOT READY | **READY WITH CONDITIONS** |
| **Staging** | READY | READY | READY WITH CONDITIONS¹ | READY WITH CONDITIONS⁶ | NOT READY² | READY WITH CONDITIONS⁷ | NOT READY | READY WITH CONDITIONS⁴ | NOT READY⁸ | NOT READY⁸ | NOT READY⁵ | NOT READY | **READY WITH CONDITIONS** |
| **Restricted beta** | READY | READY WITH CONDITIONS⁹ | READY WITH CONDITIONS¹ | READY WITH CONDITIONS⁶ | NOT READY² | NOT READY⁷ | NOT READY | NOT READY⁴ | NOT READY⁸ | NOT READY⁸ | NOT READY⁵ | NOT READY | **NOT READY** |
| **Public production** | READY | NOT READY⁹ | NOT READY¹⁰ | NOT READY² | NOT READY² | NOT READY⁷ | NOT READY | NOT READY⁴ | NOT READY⁸ | NOT READY⁸ | NOT READY⁵ | NOT READY | **NOT READY** |
| **Full product vision** | NOT READY¹¹ | NOT READY⁹ | NOT READY¹⁰ | NOT READY² | NOT READY² | NOT READY⁷ | NOT READY | NOT READY⁴ | NOT READY⁸ | NOT READY⁸ | NOT READY⁵ | NOT READY | **NOT READY** |

**Conditions:**
1. Dependency security is "with conditions" everywhere the app merely *runs*, because the 18 open findings are, per Phase 4, not demonstrated to be exploitable in this codebase's actual usage today — acceptable for non-public environments, but the condition is: this judgment must be revisited once the app is internet-facing.
2. No backup/recovery capability exists at all beyond local-directory WAL archiving (verified live, PLACE-026) — there has never been a restore drill, and there is no offsite copy of anything. This is a hard NOT READY wherever real, non-recreatable data would exist.
3. Internal integration can reuse the existing local prod-shaped Compose stack as-is; "conditions" = someone must actually stand it up on a shared machine, which is a repository-supported but not yet exercised step.
4. Secrets are `.env`-file based, acceptable for CI/local/internal use with discipline; not acceptable once multiple people or environments need coordinated secret rotation (staging+) without a manual process risk.
5. No named operational owner, on-call process, or incident procedure exists anywhere in the repository at any environment level beyond local/CI.
6. Data layer is "with conditions" at staging/beta specifically because migrations and WAL mechanics are proven, but the actual Postgres/Redis instances at that environment do not exist yet — this row describes what the *code* would do once *given* real instances, not that real instances already exist.
7. Deployment automation exists and is proven **locally** (Docker build+boot+health, live in this session); it becomes NOT READY at beta/public because no external target exists for it to deploy *to*, and the CI push-to-GHCR step has never executed against a real remote.
8. No domain, DNS, TLS certificate, or reverse-proxy topology exists anywhere in this repository or has been provisioned externally.
9. App security (runtime) is strong (RBAC, deny-by-default, rate limiting, CORS allow-list, fail-fast config — all live-verified) but the DB-credential insecure-default (R-06) remains open, and no WAF/reverse-proxy layer exists to add defense-in-depth once truly public.
10. Dependency security becomes a hard NOT READY at public/full-vision scope because the standing recommendation (Phase 4) is that the major-version migrations and the `bcrypt` bump should be completed before real, adversarial public traffic arrives — not because of demonstrated exploitation today, but because "recommended before public launch" becomes load-bearing exactly at that threshold.
11. "Full product vision" fails at the application-build level itself because four major planned surfaces (Community, Reviews, Notifications, Contributions) and the ADR-008 verification workflow do not exist in code at all (R-07/R-08, unchanged) — this is a product-scope gap, not a quality gap in what has been built.

---

## Phase 7 — External prerequisites

None of the following can be completed from the repository alone. No account, credential, or infrastructure item below has been fabricated, assumed, or simulated anywhere in this or any prior session.

| Item | Required for | Owner decision needed? | Credential/account needed? | Repository work still required? | Responsible role | Verification evidence required |
|---|---|---|---|---|---|---|
| Production VPS/hosting target | Staging, beta, public | Yes (which provider, size) | Yes | Minor (env values only) | Owner (procurement) + Engineering (provisioning scripts) | SSH access proof, resource confirmation |
| Staging environment (the actual machine) | Staging | Yes | Yes (or reuse local capacity — owner's call) | None beyond what exists | Owner + Engineering | `docker compose -f docker-compose.prod.yml up` succeeding on the target host |
| Container registry (real push target) | Beta, public (for repeatable deploys) | Yes (GHCR vs. other) | Depends on choice (GHCR uses existing `GITHUB_TOKEN` once a remote exists) | None — CI job already written | Owner | A real `docker push` succeeding from a live Actions run |
| Repository remote | Staging, beta, public (blocks the entire CI/CD path) | Yes | Yes (GitHub org/account) | None | Owner | `git remote -v` showing a real URL; first CI run completing |
| Production domain | Public, full vision | Yes | Yes (registrar) | None | Owner | DNS resolution to the correct target |
| DNS | Public, full vision | Yes | Bundled with domain | Minor (CORS_ALLOWED_ORIGINS value) | Owner | Resolution + propagation check |
| TLS certificates | Public, full vision | Yes (Let's Encrypt vs. Cloudflare vs. other) | Depends on choice | Reverse-proxy config (not yet written — `infrastructure/nginx/` is empty) | Owner + Engineering | HTTPS handshake against the real domain |
| Production Postgres | Staging, beta, public | Yes (managed vs. self-hosted, sizing) | Yes if managed | None — schema/migrations already portable | Owner + Engineering | Migrations applying cleanly against the real instance |
| Production Redis | Staging, beta, public | Yes | Yes if managed | None | Owner + Engineering | Live `PING` against the real instance |
| Object storage (real R2/S3, or hosted MinIO) | Public (media at scale) | Yes | Yes | **Significant** — no upload/service code exists yet regardless of which storage backend is chosen (Phase 3, item 34) | Owner (choice) + Engineering (feature build) | A real file round-trip (upload→retrieve) |
| Offsite WAL/backup destination | Staging (recommended), beta, public (mandatory) | Yes | Yes | Minor (`wal-archive.sh` already supports swapping the destination command, per its own header comment) | Owner + Engineering | A real offsite object appearing after `pg_switch_wal()` |
| Monitoring provider | Beta (recommended), public (mandatory) | Yes (Prometheus/Grafana self-hosted vs. a SaaS APM) | Yes | Significant — zero instrumentation code exists | Owner (choice) + Engineering (build) | A real dashboard showing live request metrics |
| Alert recipients | Beta (recommended), public (mandatory) | Yes | N/A (a phone/email/Slack target) | Bundled with monitoring build | Owner | A real test alert reaching a real person |
| Owner-supplied secrets (production JWT secrets, DB passwords) | Staging, beta, public | Yes (values) | N/A | None — the fail-fast validation already rejects missing/weak values | Owner | Successful boot with the real production values, none logged |
| Production CORS origins | Staging (recommended), beta, public (mandatory) | Yes (the real domain(s)) | N/A | None — `CORS_ALLOWED_ORIGINS` is already wired and fail-fast (PLACE-028) | Owner | Live preflight/allow check against the real origin |
| Reverse-proxy topology | Public (recommended before it, mandatory at it) | Yes (nginx vs. Cloudflare vs. other) | Depends | `infrastructure/nginx/` config does not exist yet; `TRUST_PROXY_HOPS` is ready to receive a real value once chosen | Owner (choice) + Engineering (build) | Correct client-IP resolution through the real proxy |
| Backup retention requirements | Beta (recommended), public (mandatory) | Yes (how long, how many copies) | N/A | None — a policy decision, not code | Owner | A documented retention policy matched by actual stored backups |
| Data-restoration target | Public (mandatory) | Yes | Yes (a place to restore *to* for drills) | None | Owner + Engineering | A successful, timed restore drill |
| Release maintenance window | Public (recommended) | Yes | N/A | None — a scheduling decision | Owner | A documented, followed release calendar |

---

## Phase 8 — Updated release gates

### Gate A — Staging deployment

| Requirement | Status |
|---|---|
| Mandatory prerequisites | A real target host (external) |
| Security thresholds | No demonstrated exploitable path in current dependency set (Phase 4) — **PASS**, repository-side |
| Test thresholds | 223 unit + 51 e2e green, zero regression — **PASS** |
| Infrastructure requirements | A host to run `docker-compose.prod.yml` on — **EXTERNAL, not present** |
| Operational requirements | None strictly mandatory for staging (internal-only traffic) |
| Rollback requirements | `git revert` + redeploy — mechanically sufficient for staging's risk level |
| Evidence required | This reassessment's Phase 2 live verification (already satisfied, repository-side) |
| Approval authority | Owner |
| **Current pass/fail** | **Repository-side: PASS. Overall: BLOCKED on an external target host only** — this is the *only* hard blocker for Gate A. |

### Gate B — Restricted beta

| Requirement | Status |
|---|---|
| Mandatory prerequisites | Gate A complete; real Postgres/Redis; a named set of beta users; minimum-viable monitoring |
| Security thresholds | DB-credential fail-fast (R-06) should close first; CORS/rate-limiting already satisfied |
| Test thresholds | Same as Gate A — already satisfied |
| Infrastructure requirements | Real DB/Redis instances (external); object storage only if media upload is in scope for beta (currently unbuilt) |
| Operational requirements | At minimum, a way to know the service is down (monitoring — currently absent) |
| Rollback requirements | Same as Gate A, plus a tested restore path if any real user data is collected |
| Evidence required | A live monitoring dashboard; a completed backup-restore drill if data is collected |
| Approval authority | Owner |
| **Current pass/fail** | **FAIL** — repository work (R-06) plus external provisioning (monitoring, real DB/Redis) both outstanding |

### Gate C — Public production launch

| Requirement | Status |
|---|---|
| Mandatory prerequisites | Gates A+B complete; domain+TLS; real backup/DR with a tested restore; monitoring+alerting; release runbook |
| Security thresholds | Recommend Program A, Program B, and the `bcrypt` bump all complete (Phase 4/5); R-06 closed; secrets rotation process defined |
| Test thresholds | Same suite, plus load/performance testing (currently absent anywhere in the repo) |
| Infrastructure requirements | Everything in Phase 7, fully provisioned |
| Operational requirements | Named operational owner, on-call/alerting, documented incident process |
| Rollback requirements | A rehearsed rollback, not just a theoretical `git revert` |
| Evidence required | A completed DR drill; a live monitoring dashboard with real alerts firing correctly; a documented, exercised runbook |
| Approval authority | Owner |
| **Current pass/fail** | **FAIL** — the majority of blockers here are external-provisioning and product-scope decisions, not repository defects |

**Separating repository blockers from external-provisioning blockers, explicitly:**
- **Repository blockers remaining:** R-06 (DB credential defaults), R-05/logging-monitoring code (zero instrumentation exists to wire once a provider is chosen), the object-storage feature (no upload code exists), the ADR-008 verification workflow (if claimed as a feature), the four unbuilt product modules (if full-vision is claimed), the two major-version migration programs plus the `bcrypt` bump (recommended, not release-blocking at staging/beta).
- **External-provisioning blockers remaining:** everything in Phase 7 — a host, a domain, TLS, a monitoring provider, offsite backup, a repository remote, real Postgres/Redis instances, and owner-supplied production secrets.

---

## Phase 9 — Updated readiness score

| Dimension | Score (0-100) | Basis |
|---|---|---|
| Application correctness | 90 | 223 unit + 51 e2e, all green, deterministic and mutation-checked in several places (PLACE-004/015/022/023), architecture-enforcement tests present |
| Build reproducibility | 85 | CI/Docker builds are genuinely clean from a fresh checkout every time; a local-machine-only incremental-cache hazard was found and documented this session (not shipped-artifact-affecting), holding this back from higher |
| Deployment readiness | 45 | A complete, live-verified local Docker/Compose pipeline exists; zero real external deployment has ever occurred; CI's deploy-adjacent steps (GHCR push) have never executed for real |
| Runtime security | 65 | RBAC/AuthN excellent and heavily tested; rate limiting + CORS allow-list now live and fail-fast (PLACE-028, a real, verified improvement); DB-credential insecure-default (R-06) still open; no reverse-proxy/WAF layer exists yet |
| Dependency security | 40 | 18 open production findings, all currently non-exploitable-in-this-codebase by evidence, but two major-migration programs plus one clean isolated fix remain genuinely undone; count *increased* by one high-severity finding since PLACE-027 due to external advisory-database drift |
| Data reliability | 40 | Migrations clean and repeatable; WAL archiving mechanism live-verified; no offsite destination, no restore drill ever performed |
| Observability | 10 | Only request-level access logs and a health endpoint exist; zero metrics, tracing, dashboards, or alerting anywhere |
| Operational readiness | 15 | No staging environment, no runbook, no rollback rehearsal, no named operational owner or on-call process |
| Release governance | 95 | Every one of 28 PLACE tasks has a task file, execution report, and evidence index citing exact commands and outputs; strict schema discipline; owner-approval gating consistently followed |

**Current overall readiness score: 54 / 100** (simple unweighted mean of the nine dimensions above, rounded).

**Previous readiness score:** the prior assessment (`PRODUCTION-READINESS-ASSESSMENT-2026-07-24.md`, Phase 9) did not publish one unified 0-100 number — it gave three qualitative sub-scores: *Code quality 8.5/10 (≈85)*, *Operational readiness 2/10 (≈20)*, *Security posture 5/10 (≈50)*, with an overall qualitative verdict of **E. NOT READY**. These three categories do not map one-to-one onto this reassessment's nine (in particular, the prior "security posture" blended runtime security and dependency security into one number, which this reassessment deliberately splits — see below). A directly comparable single prior number does not exist; presenting one here would overstate precision the prior document didn't have.

**Score change (by the closest matching categories, not a strict apples-to-apples average):**
- *Code quality (≈85) → application correctness (90) + build reproducibility (85), avg ≈87.5*: **+2.5**, from more tests and repeated live verification since.
- *Operational readiness (≈20) → deployment readiness (45) + observability (10) + operational readiness (15), avg ≈23.3*: **+3.3**, entirely from PLACE-026's deployment pipeline now existing (observability and operational-process readiness are unchanged at effectively zero).
- *Security posture (≈50), split into runtime security (65) and dependency security (40)*: this is the category most changed by PLACE-028's real work. Runtime security specifically improved substantially (rate limiting and CORS were the prior assessment's two of four hard production blockers, R-03/R-04, both now resolved and live-verified) — the prior blended "50" would understate this if left unsplit. Dependency security alone is slightly *worse* by raw count (17→18, +1 high) due to advisory-database drift unrelated to this session's work, not because anything regressed in this repository.

**Reasons for improvement:** PLACE-026 delivered a real, live-verified local deployment pipeline where none existed; PLACE-028 closed two of the prior assessment's four hard production blockers (rate limiting, CORS) with fresh, repeatable live proof, not just code presence.

**Reasons preventing a higher score:** zero observability/monitoring/alerting exists at all; zero external infrastructure has ever been provisioned (no host, domain, TLS, offsite backup, or monitoring target); the DB-credential insecure-default (R-06) remains open since the first assessment; dependency security has not been substantively remediated (only the safe subset from PLACE-027) and, by raw count, drifted slightly worse from external causes; no release runbook or rollback rehearsal exists; four major product surfaces remain entirely unbuilt if full product vision is the claimed scope.

---

## Phase 10 — Candidate next actions

Exactly four candidates, none auto-assigned to PLACE-029.

### Candidate 1 — Bcrypt major upgrade + DB-credential fail-fast hardening
- **Problem solved:** closes the single critical-severity dependency finding (`tar`, via a clean `bcrypt` 5→6 bump that removes the whole `node-pre-gyp`/`tar` chain) and closes R-06 (insecure silent DB-credential defaults), the one open High-risk finding that has been open since the very first assessment.
- **Scope:** `apps/api/package.json` (`bcrypt` version bump only — no other dependency touched), `apps/api/src/core/config/env.validation.ts` (DB credentials `required()`, `NODE_ENV`-conditional if a dev default is still wanted).
- **Dependencies:** none.
- **Release gate affected:** improves Gate C readiness (dependency security, runtime security); does not block Gate A/B today.
- **Risk:** Low — isolated, single-package major bump with no ecosystem coupling; DB-credential change needs care to not break local dev defaults.
- **Effort:** Small (hours to low single-digit days including full regression re-run).
- **Measurable acceptance criteria:** `npm audit --omit=dev` shows 0 critical; DB credentials fail fast in production when unset/weak, matching the existing JWT-secret pattern; full 223/51 regression green.
- **Requires an Owner Decision?** No — this is a narrow, low-risk safety fix consistent with prior owner-approved scope (PLACE-027's own narrower-than-recommended precedent).
- **Eligible for PLACE-029?** Yes.

### Candidate 2 — Program A: NestJS 10 → 11 ecosystem migration
- **Problem solved:** closes 9 of the 18 open production dependency findings (all `@nestjs/*`-rooted, including `@nestjs/platform-express`/`body-parser`/`express`/`multer`/`qs` — the actual live HTTP stack).
- **Scope:** 9 direct `@nestjs/*` packages (Phase 5), full regression re-run, investigation of any NestJS 11 behavioral changes the existing suite surfaces.
- **Dependencies:** none blocking (throttler and TypeORM already confirmed compatible, Phase 5).
- **Release gate affected:** Gate C (dependency security, runtime security).
- **Risk:** Medium — an all-or-nothing 9-package bump; the existing 274-test suite is the primary regression detector.
- **Effort:** Medium (1-3 days, Phase 5 estimate).
- **Measurable acceptance criteria:** all 9 packages on their 11.x line; `npm audit --omit=dev` shows the corresponding findings closed; full regression suite green with identical or explicitly-reviewed-different totals; Docker build+boot re-verified live.
- **Requires an Owner Decision?** Yes — this is exactly the migration decision PLACE-027 explicitly deferred to a separate owner approval; still undecided.
- **Eligible for PLACE-029?** Yes, contingent on that Owner Decision being made first.

### Candidate 3 — Program B: Next.js 14 → 16 + ESLint flat-config migration
- **Problem solved:** closes `next`/`postcss` (2 of 18 open findings); modernizes the frontend build/lint toolchain ahead of any future feature work.
- **Scope:** `next`, `eslint-config-next` version bumps; a full ESLint 8→9 flat-config rewrite (`.eslintrc.cjs` → `eslint.config.js`, `apps/web/.eslintrc.json` → flat equivalent) — a distinct, separately-scoped effort within the same task.
- **Dependencies:** none blocking (React 18 stays, all other new peers confirmed optional, Phase 5).
- **Release gate affected:** Gate C (dependency security); improves frontend tooling health generally.
- **Risk:** Medium — the forced ESLint flat-config rewrite is the main source of surprise scope; low existing frontend test coverage means more manual smoke-testing is needed.
- **Effort:** Medium-High (2-4 days, Phase 5 estimate).
- **Measurable acceptance criteria:** `next` on 16.x; ESLint on 9.x with a working flat config; `npm audit --omit=dev` shows `next`/`postcss` closed; full regression suite green; a manual smoke-test pass across the app's main routes (build has minimal automated frontend coverage today).
- **Requires an Owner Decision?** Yes — same reasoning as Candidate 2 (PLACE-027's deferred-migration boundary).
- **Eligible for PLACE-029?** Yes, contingent on that Owner Decision.

### Candidate 4 — Minimum-viable observability (logging correlation + a single external monitoring signal)
- **Problem solved:** addresses the single lowest-scoring dimension in this reassessment (Observability, 10/100) and the R-05 finding open since the first assessment — currently, a production incident would be invisible until a user reports it.
- **Scope:** wire the already-built-but-dead `AppLoggerService` as the actual Nest logger (closing TD-03 for free), add request-correlation IDs, and integrate one external, owner-chosen monitoring/alerting signal (even a simple uptime check plus error-rate alert would materially change this dimension).
- **Dependencies:** an owner-chosen monitoring provider (external prerequisite, Phase 7) — the logging-correlation half of this candidate needs no external dependency and could proceed alone if the owner wants to split it.
- **Release gate affected:** Gate B (restricted beta) and Gate C (public launch) both currently fail partly on this dimension.
- **Risk:** Low for the logging half; Low-Medium for the monitoring-integration half, dependent entirely on which provider is chosen.
- **Effort:** Small (logging correlation, hours-days) + variable (monitoring integration, depends on provider choice).
- **Measurable acceptance criteria:** `AppLoggerService` is the active Nest logger with correlation IDs visible across a single request's log lines; at least one real external signal (uptime or error-rate) is live and has been proven to fire a real alert.
- **Requires an Owner Decision?** Yes for the monitoring-provider choice; No for the logging-correlation portion alone.
- **Eligible for PLACE-029?** Yes, and could be split into a repository-only sub-scope (logging) that needs no Owner Decision, versus the monitoring-integration sub-scope that does.

---

## Phase 11 — Final recommendation

1. **Is the repository ready for staging now?** From the repository's own side: yes — the code, tests, Docker images, and Compose configuration all pass fresh, live verification in this session. The only blocker is that no external target host exists to deploy the already-working pipeline *to*.
2. **What exact conditions remain before staging?** A real target host must be provisioned externally (Phase 7); once it exists, `docker-compose.prod.yml` can be pointed at it with production-appropriate secret values — no further repository work is required for staging specifically.
3. **Is it ready for restricted beta?** No. R-06 (DB-credential insecure defaults) should close first, and at minimum an uptime/error-rate signal should exist before real beta users are exposed to an otherwise-invisible outage.
4. **Is it ready for public production?** No. Multiple external-provisioning items (domain, TLS, offsite backup, monitoring, a rehearsed rollback) and the two migration programs (recommended, not code-broken today) remain outstanding.
5. **Does the NestJS migration need to occur before staging?** No — confirmed by this reassessment's own dependency-risk analysis (Phase 4): every affected finding is install-time-only, build-time-only, or has no demonstrated user-controlled exploitation path in this codebase today.
6. **Does the Next.js migration need to occur before staging?** No, for the same reason.
7. **Which risk is now the highest priority?** Observability (10/100, the lowest score of any dimension) — combined with the fact that zero backup/recovery capability exists beyond a local WAL directory, an incident at staging or beyond would currently be both invisible and unrecoverable.
8. **Which candidate should be considered first for PLACE-029?** Candidate 1 (bcrypt upgrade + DB-credential fail-fast) — it requires no Owner Decision, is low-risk and small, and closes the single remaining critical-severity finding plus the oldest-standing High-risk finding (R-06) in one narrow task.
9. **What Owner decisions are required before that task?** None — Candidate 1 needs only an explicit authorization to proceed, not a scoping decision, since it follows the same narrow, low-risk pattern the owner has already approved in PLACE-027.
10. **What external resources must the Owner supply?** For staging specifically: a target host. Beyond staging: a domain, DNS, TLS certificates, a chosen monitoring provider and alert recipients, an offsite backup destination, a container registry decision (or continued use of GHCR once a remote exists), a repository remote, and production-grade secret values (JWT secrets, DB credentials, CORS origins) — none of which this or any prior session has fabricated or assumed.

### Final verdict by deployment level

| Level | Verdict |
|---|---|
| Local development | **READY** |
| CI | **READY** |
| Internal integration | **READY WITH CONDITIONS** |
| Staging | **READY WITH CONDITIONS** |
| Restricted beta | **NOT READY** |
| Public production | **NOT READY** |
| Full product vision | **NOT READY** |

---

*This reassessment modified no runtime code, no dependency, no schema, no migration, and no test assertion. It produced exactly one new governance document (this report) and no PLACE-029. All Docker images, containers, and volumes created for live verification during this session were removed after use; the development stack (`phuquoc-postgres`/`-redis`/`-minio`) was confirmed healthy and unmodified throughout.*
