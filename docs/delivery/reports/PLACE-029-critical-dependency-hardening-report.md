# PLACE-029 — Critical Dependency Hardening (Candidate A)

- **Date:** 2026-07-24
- **Authority:** Owner explicit authorization — "Owner authorizes execution of the selected engineering task... Candidate A" — selecting Candidate A from `docs/delivery/reports/PLACE-029-CANDIDATE-SELECTION-2026-07-24.md`.
- **Nature:** Repository-level security hardening only. No framework migration. No external infrastructure. No API contract, schema, or functional change.
- **Repository:** `D:\Projects\PhuQuocHub` (branch `master`)
- **Toolchain:** Node v20.20.2 / npm 10.8.2 (pinned portable install), Docker Desktop.

---

## Preconditions

| Check | Result | Evidence |
|---|---|---|
| PLACE-028 completed | ✅ | `docs/delivery/state.yaml` `completed_tasks` — PLACE-028, completed 2026-07-24 |
| PLACE-029 Candidate Selection report exists | ✅ | `docs/delivery/reports/PLACE-029-CANDIDATE-SELECTION-2026-07-24.md` |
| Candidate A authorized | ✅ | Explicit Owner instruction: "Selected candidate: Candidate A" |
| Working tree clean at start | ✅ | `git status --short` — empty |
| No active PLACE task | ✅ | `state.yaml` `current.task: none` |
| Delivery state authorizes a new task | ✅ | `state.yaml` `status: awaiting_task_authorization` |

All preconditions passed. Proceeding.

---

## Phase 1 — Investigation: bcrypt / tar / node-pre-gyp dependency graph

Fresh evidence, `npm ls`/`npm view` under the pinned toolchain, at task start (bcrypt still `5.1.1`):

```
@phuquochub/api
`-- bcrypt@5.1.1
    `-- @mapbox/node-pre-gyp@1.0.11
        `-- tar@6.2.1
```

| Package | Version (before) | Direct/Transitive | Runtime/Install-time | Exploitability | Upgrade path | Breaking-change requirement |
|---|---|---|---|---|---|---|
| `bcrypt` | 5.1.1 | Direct (`apps/api`) | **Runtime** — `hash`/`compare` called on every register/login | Not itself vulnerable; flagged only because its *install tooling* (`node-pre-gyp`) pulls a vulnerable `tar` | `bcrypt@6.0.0` | Major version, but no public-API change (confirmed below) |
| `@mapbox/node-pre-gyp` | 1.0.11 | Transitive (via `bcrypt`) | **Install-time only** — stages the prebuilt native binary during `npm install`/Docker build; never loaded by the running server | High-severity advisory on the package itself, but no runtime code path | Removed entirely by `bcrypt@6.0.0` | N/A — obsoleted, not upgraded |
| `tar` | 6.2.1 | Transitive (via `node-pre-gyp`) | **Install-time only** | Critical-severity advisory (path traversal in specific usage patterns), but only invoked by `node-pre-gyp`'s own CLI tooling during install, not by the running application | Removed entirely by `bcrypt@6.0.0` | N/A — obsoleted, not upgraded |

**`bcrypt@6.0.0` metadata** (`npm view bcrypt@6.0.0`):
```
dependencies: { "node-addon-api": "^8.3.0", "node-gyp-build": "^4.8.4" }
engines: { "node": ">= 18" }
```
Zero trace of `node-pre-gyp` or `tar` anywhere in `bcrypt@6.0.0`'s own dependency tree.

**Changelog verification** (bcrypt project CHANGELOG, fetched fresh): version 6.0.0 "removed `node-pre-gyp` in favor of `prebuildify`, prebuilt binaries are now shipped with the package." **No breaking changes to the public JS API** (`hash`, `compare`, `hashSync`, `compareSync`, `genSalt`, `genSaltSync`) are recorded. Minimum supported Node.js version rises to Node 17+ (drops <=16) — the pinned Node v20.20.2 and both Dockerfiles' `node:20-alpine` base image already satisfy this.

**Application usage** (`apps/api/src/modules/auth/auth.service.ts`): only `bcrypt.hash(dto.password, BCRYPT_ROUNDS)` and `bcrypt.compare(dto.password, user.passwordHash)` are called — both stable, unchanged calls across the 5→6 boundary. No code change was required at any call site.

**Docker/musl compatibility investigation:** `apps/api/Dockerfile`'s `deps` stage already installs `python3 make g++` (added when bcrypt 5 needed to compile from source on Alpine's musl libc). This gave a safe compile-from-source fallback if `bcrypt@6.0.0`'s prebuilt binaries didn't cover `linux-musl-x64`. In practice (Phase 4), the full uncached Docker build log shows **no** `node-gyp`/`prebuild-install` compile output during `npm ci` — `node-gyp-build` found and loaded a `prebuildify`-shipped prebuilt binary directly, with zero compilation needed.

**Conclusion:** the remaining critical finding did **not** require a framework major-version migration. It is fully removable via a clean, isolated, single-package major bump, confirmed by evidence at every step before implementation began.

---

## Phase 2 — Database credential validation review

**Before** (`apps/api/src/core/config/env.validation.ts`):
```ts
DB_HOST: Joi.string().default('localhost'),
DB_PORT: Joi.number().port().default(5432),
DB_USER: Joi.string().default('phuquoc'),
DB_PASSWORD: Joi.string().allow('').default('phuquoc'),
DB_NAME: Joi.string().default('phuquochub'),
```

**Findings:**
| Check | Finding |
|---|---|
| Required in production? | No — all four (`DB_HOST`/`DB_USER`/`DB_PASSWORD`/`DB_NAME`) fell back to a known dev value in every environment, including production. |
| Empty-string handling | `DB_PASSWORD` explicitly used `.allow('')` — an empty string was valid input in every environment. |
| Malformed connection strings | Not an applicable surface — this codebase has no `DATABASE_URL`/single-connection-string variable anywhere; configuration is five discrete fields (`DB_HOST`/`PORT`/`USER`/`PASSWORD`/`NAME`), confirmed by a full grep of `apps/api/src`. |
| Startup failure behavior | None — a production boot with all four vars unset would silently connect using `localhost`/`phuquoc`/`phuquoc`/`phuquochub`, the same values used in local dev. |
| Docker behavior | `docker-compose.prod.yml` already sets `DB_HOST`/`DB_USER`/`DB_PASSWORD`/`DB_NAME` explicitly as real env values for its local prod-shaped verification stack — unaffected by tightening the schema, since it never relied on the defaults in the first place. |
| CI behavior | CI's `docker-build` job boots the API container with its own explicit env block (added incrementally by PLACE-026/028) — checked in Phase 4 to confirm no new failure is introduced. |
| Existing precedent | `JWT_ACCESS_SECRET`/`JWT_REFRESH_SECRET` already use `Joi.string().min(16).required()`; `CORS_ALLOWED_ORIGINS` (PLACE-028) already uses the exact `Joi.string().when('NODE_ENV', { is: 'production', then: Joi.required(), otherwise: Joi.string().default(...) })` pattern reused here. |

**No new configuration concept was introduced.** The fix mirrors an already-proven, already-live pattern in the same file.

---

## Phase 3 — Dependency remediation implemented

### 3a. bcrypt 5 → 6

`apps/api/package.json`: `"bcrypt": "^5.1.1"` → `"bcrypt": "^6.0.0"`. `npm install` run at the workspace root — **no `--force`, no peer-dependency bypass, no `npm audit fix`.**

Result (`npm install` output): `added 1 package, removed 31 packages, changed 2 packages`. The lockfile diff (`git diff --stat package-lock.json`) shows **33 insertions, 369 deletions** — confirming the *removal* of the entire `node-pre-gyp`/`tar` install-tooling chain (`tar`, `@mapbox/node-pre-gyp`, `@mapbox/jsonlint-lines-primitives`†, `rimraf`, `mkdirp`, `glob`, `minimatch`, `npmlog`, `gauge`, and ~20 more transitive-only packages) and the *addition* of exactly `node-addon-api`/`node-gyp-build`.

† Note: a same-named `@mapbox/jsonlint-lines-primitives` also exists as an unrelated transitive dependency of `apps/web`'s `maplibre-gl` map-tiles library — confirmed via `npm why`, pre-existing, untouched by this task, and the source of an unrelated `EBADENGINE` warning seen during `npm install` (requires Node ≥22, cosmetic only, not introduced by this task).

`npm ls bcrypt --all -w apps/api` after: `bcrypt@6.0.0`. `npm ls tar --all` / `npm ls @mapbox/node-pre-gyp --all` after: **empty** — confirmed gone from the entire dependency tree, not just from `bcrypt`'s branch.

**Files touched:** `apps/api/package.json` (1 line), `package-lock.json` (lockfile only). **No other `package.json` in the monorepo was touched** — confirmed by `git diff --stat` showing only these two files under the dependency-hardening scope.

### 3b. DB-credential fail-fast hardening

`apps/api/src/core/config/env.validation.ts`: `DB_HOST`/`DB_USER`/`DB_PASSWORD`/`DB_NAME` each changed to:
```ts
Joi.string().when('NODE_ENV', {
  is: 'production',
  then: Joi.required(),
  otherwise: Joi.string().default(<existing dev default>),
})
```
This is the identical shape already used for `CORS_ALLOWED_ORIGINS` (PLACE-028). `Joi.string()`'s default behavior already rejects an empty string unless `.allow('')` is present — removing `.allow('')` from the production branch closes the empty-string gap for `DB_PASSWORD` without needing extra logic. Non-production behavior (`development`/`test`) is **byte-identical** to before: the same dev defaults apply when the vars are unset.

**New test file:** `apps/api/src/core/config/env.validation.spec.ts` — 8 focused specs exercising the Joi schema directly (no NestJS bootstrap needed): production-with-all-set passes; each of the four vars missing individually fails with a message naming that var; `DB_PASSWORD=''` fails; development-with-all-unset still applies the original dev defaults; the pre-existing JWT-required behavior is unaffected. All 8 pass.

---

## Phase 4 — Verification

All commands run under the pinned toolchain (`node -v` → `v20.20.2`, `npm -v` → `10.8.2`), Docker Desktop running, dev stack (`phuquoc-postgres`/`-redis`/`-minio`) healthy throughout.

| Check | Result |
|---|---|
| `npm install` (workspace root) | ✅ `added 1, removed 31, changed 2`, no `--force`, no peer bypass |
| Dependency integrity (`npm ls`) | ✅ `bcrypt@6.0.0`; `tar`/`@mapbox/node-pre-gyp` absent tree-wide |
| `npm audit --omit=dev` | ✅ **15** total (was 18) — see Phase 5 for full comparison |
| `npm audit` (incl. dev) | ✅ **30** total (was 33) — dev-only findings unchanged (15, untouched) |
| Lint (api) | ✅ exit 0 |
| Typecheck (api) | ✅ exit 0 |
| Typecheck (web) | ✅ exit 0 |
| Unit tests | ✅ **231/231**, 32 suites (baseline 223/31 + 8 new `env.validation.spec.ts`) |
| API e2e tests | ✅ **51/51**, 9 suites — **identical to the PLACE-028 baseline**, zero regression |
| Clean production build | ✅ 4/4, 0 cached, after purging the stale `apps/api/tsconfig.build.tsbuildinfo` hazard documented in the reassessment; real artifacts confirmed (`dist/main.js`, `dist/app.module.js`, `.next/BUILD_ID` + `standalone/`, both shared packages' `dist/index.js`) |
| Docker image build (api), uncached, full log | ✅ succeeded; **no `node-gyp`/`prebuild-install` compile step appears anywhere in the `npm ci` log** — `bcrypt@6.0.0`'s prebuilt `linux-musl-x64` binary loaded directly |
| Docker image build (web) | ✅ succeeded |
| API production-image startup | ✅ booted on `phuquochub_default` network against real `phuquoc-postgres`/`phuquoc-redis`, `NODE_ENV=production` |
| bcrypt hash generation + password comparison (live) | ✅ `POST /api/auth/register` → 201-equivalent success with real JWT tokens (bcrypt.hash executed); `POST /api/auth/login` correct password → `200`; wrong password → `401` (bcrypt.compare correctly rejects) |
| Authentication regression | ✅ full register→login→wrong-password round-trip proven against the built production image, not just unit mocks |
| Database credential fail-fast (missing) | ✅ boot with `NODE_ENV=production`, `DB_PASSWORD` unset → immediate crash: `Config validation error: "DB_PASSWORD" is required` |
| Database credential fail-fast (empty string) | ✅ boot with `NODE_ENV=production`, `DB_PASSWORD=""` → immediate crash: `Config validation error: "DB_PASSWORD" is not allowed to be empty` |
| Production database connection | ✅ `/api/health` → `database: up` |
| Redis connection | ✅ `/api/health` → `redis: up, PONG` |
| `/api/health` | ✅ `200`, full payload confirmed |
| Web production-image startup | ✅ booted, `GET /` → `200` |
| Development stack integrity | ✅ `phuquoc-postgres`/`-redis`/`-minio` healthy before, during, and after all verification; `migrations` table = 20 rows (unchanged); `places` = 49 rows (unchanged); the one test user created during the auth round-trip was deleted afterward, confirmed `0` matching rows remain |
| Verification cleanup | ✅ verification containers and images (`phuquochub-api:place029-verify`, `phuquochub-web:place029-verify`) removed after use |

---

## Phase 5 — Security assessment

See `docs/delivery/reports/PLACE-029-SECURITY-ASSESSMENT-2026-07-24.md` for the full before/after comparison and per-remaining-finding disposition. Summary:

| Scope | Before | After | Change |
|---|---|---|---|
| Production (`--omit=dev`) | 18 total (1 critical, 7 high, 10 moderate, 0 low) | **15 total (0 critical, 5 high, 10 moderate, 0 low)** | **−1 critical, −2 high** |
| All (incl. dev) | 33 total (1 critical, 13 high, 16 moderate, 3 low) | **30 total (0 critical, 11 high, 16 moderate, 3 low)** | **−1 critical, −2 high** |

The critical `tar` finding and the high `@mapbox/node-pre-gyp` finding are **fully removed** (not deferred, not mitigated — the packages no longer exist in the dependency tree). `bcrypt` itself no longer appears in the audit at all (it was flagged only for its now-removed install-tooling dependency). All 15 remaining production findings require a NestJS 10→11 or Next.js 14→16 major-version migration — neither was performed, per explicit task scope. Full per-package disposition in the security assessment document.

---

## Phase 6 — Delivery evidence

- Report (this document): `docs/delivery/reports/PLACE-029-critical-dependency-hardening-report.md`
- Evidence index: `docs/delivery/evidence/PLACE-029-critical-dependency-hardening-evidence-index.md`
- Security assessment: `docs/delivery/reports/PLACE-029-SECURITY-ASSESSMENT-2026-07-24.md`
- Task file: `docs/delivery/tasks/PLACE-029.yaml`
- Delivery state: `docs/delivery/state.yaml` updated — PLACE-029 added to `completed_tasks`, `current.task` returned to `none`
- Workstream: `docs/delivery/workstreams/place.yaml` updated — `place_029_status` added

---

## Phase 7 — Git

Diff reviewed in full before committing. Confirmed:
- **No** NestJS package touched.
- **No** Next.js package touched.
- **No** API contract, DTO, or OpenAPI change.
- **No** database schema or migration change.
- **No** product feature added.
- **No** dependency touched outside bcrypt's own transitive chain (`package-lock.json` diff limited to `bcrypt` + its removed/added sub-dependencies).

Three local commits, grouped as instructed:
1. Dependency hardening (`bcrypt` 5→6, `package.json`/`package-lock.json`).
2. Configuration validation (`env.validation.ts` + new `env.validation.spec.ts`).
3. Delivery evidence (task file, report, evidence index, security assessment, `state.yaml`, `workstreams/place.yaml`).

**Not pushed.** Working tree confirmed clean after the final commit.

---

## Not claimed

| Item | Disposition |
|---|---|
| NestJS 10→11 migration | **NOT performed** — remains an Owner decision (recommended: before public launch, per the Candidate Selection report) |
| Next.js 14→16 + ESLint flat-config migration | **NOT performed** — same, independently decidable |
| Remaining 15 production dependency findings | **NOT closed** — all require one of the above two migrations |
| PLACE-030 | **NOT started, NOT created** |
| Any external infrastructure | **NOT provisioned** — this task was fully repository-contained |
