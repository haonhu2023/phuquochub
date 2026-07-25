# PLACE-032 — NestJS 10 → 11 Migration

- **Date:** 2026-07-24
- **Authority:** Owner explicit authorization — "PLACE-032 — Execute NestJS 10 to NestJS 11 Migration", timing decision: execute now, before staging.
- **Basis:** The PLACE-032 read-only migration-readiness assessment (same session) — recommendation `APPROVE PLACE-032 EXECUTION`, overall risk 2/10, zero peer conflicts confirmed via `npm install --dry-run`.
- **Nature:** Framework dependency migration. No apps/web change, no broad dependency modernization, no authentication redesign, no schema change.
- **Repository:** `D:\Projects\PhuQuocHub` (branch `master`)
- **Toolchain:** Node v20.20.2 / npm 10.8.2 (pinned), Docker Desktop.

---

## Preconditions

| Check | Result |
|---|---|
| PLACE-031 completed | ✅ `state.yaml` `completed_tasks` |
| PLACE-030 completed | ✅ |
| PLACE-029 completed | ✅ |
| Working tree clean at start | ✅ |
| `current.task: none` at start | ✅ |
| No `PLACE-032.yaml` existed before this task | ✅ |
| Node v20.20.2 pinned | ✅ |
| Docker running, dev stack healthy | ✅ |
| Owner timing decision | ✅ execute now, before staging |

---

## Dependency versions: before → after

| Package | Before | After |
|---|---|---|
| `@nestjs/common` | 10.4.22 | **11.1.28** |
| `@nestjs/core` | 10.4.22 | **11.1.28** |
| `@nestjs/platform-express` | 10.4.22 | **11.1.28** |
| `@nestjs/config` | 3.3.0 | **4.0.4** |
| `@nestjs/jwt` | 10.2.0 | **11.0.2** |
| `@nestjs/typeorm` | 10.0.2 | **11.0.3** |
| `@nestjs/terminus` | 10.3.0 | **11.1.1** |
| `@nestjs/testing` (dev) | 10.4.22 | **11.1.28** |
| `@nestjs/cli` (dev) | 10.4.9 | **11.0.24** |
| `@nestjs/schematics` (dev) | 10.2.3 | **11.1.0** |
| `@nestjs/throttler` | 6.4.0 | 6.5.0 (in-range minor, auto-resolved) |
| `typeorm`, `reflect-metadata`, `rxjs`, `class-validator`, `class-transformer`, `bcrypt`, `typeorm-naming-strategies` | unchanged | **unchanged** |
| `ioredis`, `pg`, `joi` | prior resolved patch | newer in-range patch (declared ranges in `package.json` untouched — see "A real defect found and fixed" below for why the lockfile needed full regeneration) |
| `jest`, `supertest`, `typescript`, Node.js version | unchanged | **unchanged** |
| All `apps/web` dependencies | unchanged | **unchanged** — zero file touched |

---

## Package and lockfile changes

`apps/api/package.json`: exactly the 10 approved version-range bumps, nothing else — confirmed via `git diff`. `package-lock.json`: fully regenerated (necessitated by the defect below), containing only the transitive graphs of the approved packages plus harmless in-range patch drift for unrelated packages (`ioredis`/`pg`/`joi`) whose `package.json` ranges were never touched. `apps/web/package.json`: **zero diff**.

## Source-code compatibility changes

**None.** `apps/api/src/modules/health/indicators/redis.health.ts` (the one file identified as possibly requiring adaptation) was inspected after the bump: it typechecks cleanly, lints cleanly, and its unit spec (`health.controller.spec.ts`) and e2e spec (`health.e2e-spec.ts`, against real Redis) both pass unchanged. Per the task's explicit decision rule ("if it compiles and behaves correctly, do not refactor it merely to remove a deprecation"), it was left untouched. The deprecation (`HealthIndicator`/`HealthCheckError` → `HealthIndicatorService`) is recorded as a bounded follow-up, not fixed here.

---

## A real defect found and fixed

Live verification — not the read-only assessment's dry-run — caught a genuine installation defect:

**Symptom:** after the first `npm install` applying the 10 approved version bumps, `npm ls @nestjs/common --all` showed **two physical copies** of `@nestjs/common` in the tree: `11.1.28` at the top level (used by `core`/`platform-express`/`terminus`/`testing`/`typeorm`) and a **separate nested `10.4.22`** used by `@nestjs/config`, `@nestjs/jwt`, and `@nestjs/throttler`. Confirmed via `require.resolve()` from within `@nestjs/throttler`'s own resolution context — it was genuinely loading the old `10.4.22` module, not a display artifact of `npm ls`.

**Root cause:** `@nestjs/throttler@6.4.0`'s `peerDependencies` accept a broad range (`^7‖^8‖^9‖^10‖^11`) with no `dependencies` entry pinning a specific copy. npm's default *incremental* install (reusing the pre-existing lockfile wherever a resolution still nominally satisfies declared ranges) kept the old nested `10.4.22` subtree for `config`/`jwt`/`throttler` rather than re-flattening it against the new top-level `11.1.28`, since `10.4.22` still technically satisfied their broad peer ranges.

**Diagnosis:** attempting `npm dedupe` (the standard non-destructive fix for exactly this class of problem) failed with an `ERESOLVE` error — not because of a genuine version incompatibility (the conflicting `rxjs` peer range, `^7.1.0`, was identical on both sides), but because `dedupe`'s stricter resolver couldn't cleanly collapse the already-mixed tree in one pass.

**Fix:** a full clean reinstall — `rm -rf node_modules apps/api/node_modules package-lock.json && npm install` — forcing npm to re-resolve the entire tree from `package.json` alone rather than incrementally patching a lockfile that already encoded the mixed-version state. This is the smallest available fix for a corrupted-lockfile-driven defect; there is no way to correctly deduplicate an already-corrupted lockfile without regenerating it.

**Verification after the fix:** `npm ls @nestjs/common --all` shows a single `11.1.28` throughout, `require.resolve()` from `@nestjs/throttler`'s context confirms it now loads `11.1.28`, and `@nestjs/throttler` itself naturally settled at `6.5.0` (an in-range minor bump, explicitly permitted by the task's own instructions). The resulting `package.json` diff remained exactly the 10 approved lines — the defect was in *how* the approved change got installed, not *what* was declared.

**A secondary, transient failure** during the same recovery: the first fresh-install attempt hit `npm error ENOTEMPTY` on a leftover directory from an interrupted prior install attempt (a Windows filesystem timing artifact, not a dependency issue) — resolved by fully removing `node_modules` again before retrying.

---

## Express 5 impact

`@nestjs/platform-express@11.1.28` pulls `express@5.2.1` directly (confirmed via `npm view`). Live-verified via the full e2e suite (59/59, unchanged): every `@Query()`-bound DTO across `places`, `search`, `geo`, and `sources` — all flat-scalar, none array/nested-object shaped — parsed identically; zero wildcard routes exist anywhere in the controller set; zero `NestModule`/`MiddlewareConsumer` usage exists (the correlation-ID middleware from PLACE-030 is plain `app.use()`, sidestepping the Express-5 middleware-ordering changes entirely). **No code change was required or made.**

## Config v4 impact

`@nestjs/config@4.0.4`'s "internal config now takes precedence over env vars" change was reasoned inert pre-migration (this repo's `configuration.ts` reads exclusively from `process.env` into nested dotted keys never queried by their raw env-var names) and **live-confirmed** afterward: booting with `DB_PASSWORD` missing → `Config validation error: "DB_PASSWORD" is required`; with `DB_PASSWORD=""` → `"DB_PASSWORD" is not allowed to be empty`; with `CORS_ALLOWED_ORIGINS` missing → `"CORS_ALLOWED_ORIGINS" is required`. All three PLACE-028/029 fail-fast guarantees are byte-identical in behavior. One **cosmetic-only** difference observed: NestJS 11's own stack-trace formatting for these bootstrap errors changed (the `Error:` prefix now appears inline with dimmed file paths, rather than as a separate plain line) — the thrown error text and fail-fast behavior are unchanged; this is a framework-internal `ConsoleLogger`/`ExceptionHandler` formatting change, not a regression.

## Authentication results

No Passport dependency exists or was introduced (confirmed both before and after via `npm ls`/grep). `@nestjs/jwt@11.0.2`'s public `sign`/`verifyAsync` API is unchanged. Live-proven on the NestJS 11 Docker image: register → `201`; login with correct password → `200`; login with wrong password → `401`; an unauthenticated request to a protected route → `401`. The full `auth.e2e-spec.ts` + `authz-enforcement.e2e-spec.ts` suites (part of the unchanged 59/59 e2e total) exercise `JwtAuthGuard`, `PermissionsGuard`, and both `Reflector.getAllAndOverride()` call sites end-to-end.

## Health-indicator decision

`redis.health.ts` extends the now-deprecated `HealthIndicator`/throws `HealthCheckError` — confirmed via direct read before the bump. Post-bump: `tsc --noEmit` exit 0, `eslint` exit 0, `health.controller.spec.ts` (2/2) and `health.e2e-spec.ts` (1/1, real Redis) both pass. **Decision: left unchanged**, per the task's explicit rule not to refactor a working, merely-deprecated pattern during a framework migration. Recorded as a bounded follow-up (see Unresolved limitations).

---

## Audit before/after

| Scope | Before | After |
|---|---|---|
| Production (`--omit=dev`) | 15 total (0 critical, 5 high, 10 moderate, 0 low) | **2 total (0 critical, 2 high, 0 moderate, 0 low)** |
| All (incl. dev) | 30 total | **5 total** |

**13 production findings closed** — every `@nestjs/*`-rooted finding and its transitive chain (`body-parser`, `express` 4.x, `qs`, `uuid`, `lodash`, `multer`, `file-type`, plus the direct `@nestjs/*` packages themselves). The **2 remaining production findings** (`next`, direct, high; `postcss`, transitive, high) are entirely Next.js-rooted — explicitly out of scope for this task, unchanged in count and character. No dependency was force-upgraded to reduce this count; every closure is a direct, demonstrable consequence of the approved package bumps alone.

---

## Unit and E2E totals

| Check | Before (baseline, this session) | After |
|---|---|---|
| Lint (api) | exit 0 | exit 0 |
| Typecheck (api) | exit 0 | exit 0 |
| Typecheck (web) | exit 0 | exit 0 |
| Unit tests | 251/251, 34 suites | **251/251, 34 suites** — identical |
| E2e tests | 59/59, 10 suites | **59/59, 10 suites** — identical |

Zero test skipped, zero test weakened, zero test added (no application code changed that would require new coverage).

## Build results

Clean `turbo run build --force` (after purging `apps/api/tsconfig.build.tsbuildinfo`): **4/4 tasks, 0 cached**, both before and after — identical.

## Docker/runtime results

Full live verification on the freshly-built `phuquochub-api:nestjs11` image against the real dev Postgres/Redis, `NODE_ENV=production`:

| Check | Result |
|---|---|
| Boot | Clean, identical visual log format to the NestJS 10 baseline |
| `/api/health` | `200`, `database:up`, `redis:up` |
| Register → login (correct) → login (wrong) | `201` → `200` → `401` |
| Protected route without token | `401` |
| Correlation ID | Header and `meta.requestId` confirmed byte-identical (explicit before/after string comparison) |
| Structured logs | `[HTTP] {"correlationId":...}` present for every request, correct IDs throughout |
| Quiet 4xx | Zero `ERROR`-level log lines for the 401s |
| Secret leakage | Full log grep for the real test password — zero matches |
| Rate limiting | 8× `401` then `429` on repeated bad-password login attempts — unchanged from PLACE-028 behavior |
| `DB_PASSWORD` missing/empty fail-fast | Both crash immediately with the expected named error |
| `CORS_ALLOWED_ORIGINS` missing fail-fast | Crashes immediately with the expected named error |
| Web image | Rebuilt (no dependency changed), booted, `GET /` → `200` |

## Rollback rehearsal

Full N11 → N10 → N11 cycle, reusing PLACE-031's exact mechanism:

1. `phuquochub-api:nestjs11` booted and verified (above).
2. A clearly-identifiable temp user (`place032-n11@example.test`) created via live register.
3. N11 stopped; `phuquochub-api:nestjs10-baseline` (retained from Phase 1) redeployed.
4. Health re-verified: `200`, `database:up`, `redis:up`.
5. **Data continuity confirmed:** the user created under N11 logged in successfully against N10 — proving bcrypt hash format and the users table are fully interoperable across the framework-version boundary.
6. Auth behavior re-confirmed: wrong password still `401`.
7. `migrations`/`places` row counts confirmed unchanged (`20`/`49`) throughout.
8. **Forward recovery:** N10 stopped, N11 redeployed once more — health `200`, the same user's login `200` — proving the migration is safely reversible in both directions.

---

## Preserved PLACE-029/030/031 guarantees

| Guarantee | Result |
|---|---|
| bcrypt register/login round-trip | ✅ live-proven on N11 |
| Correct-password login succeeds | ✅ |
| Wrong-password login returns 401 | ✅ |
| Missing production `DB_PASSWORD` fails fast | ✅ |
| Empty production `DB_PASSWORD` fails fast | ✅ |
| No credential leakage | ✅ full log grep, zero matches |
| `AppLoggerService` remains the active runtime logger | ✅ identical visual log format confirms `ConsoleLogger` delegate still active, no recursion |
| `app.resolve()` behavior remains correct | ✅ boot succeeded (a `Scope.TRANSIENT` resolution failure would have crashed boot immediately, as it did during PLACE-030's own discovery of this exact mechanism) |
| Correlation ID propagation intact | ✅ header/body match confirmed explicitly |
| Structured request/exception logs intact | ✅ |
| Expected 4xx responses remain quiet | ✅ |
| Sensitive values remain redacted / absent | ✅ |
| Immutable image-tag rollback remains possible | ✅ full rehearsal succeeded |
| Database state external to containers | ✅ data continuity proven bidirectionally |

---

## Data-integrity and cleanup results

`migrations`=20, `places`=49 confirmed identical before this task, immediately after the rollback, and after the final forward-recovery redeploy. The one temp verification user was deleted (`DELETE 1`). All verification containers and both migration-specific images (`nestjs11`, `nestjs10-baseline`) removed. Zero migration file, zero schema file changed — confirmed via `git status` scoped to `apps/api/src/core/database/migrations/`.

---

## Unresolved limitations

- **`redis.health.ts` still uses the deprecated `HealthIndicator`/`HealthCheckError` pattern.** It works correctly (compile- and runtime-verified) but will need migrating to `HealthIndicatorService` before a future NestJS major version removes the deprecated classes entirely. Recorded here as a bounded, low-urgency follow-up — not addressed in this task per its own scope-discipline rule.
- **A cosmetic stack-trace formatting change** in NestJS 11's bootstrap-error output (dimmed paths, inline `Error:` prefix) — no functional impact, noted for anyone comparing raw log output byte-for-byte against pre-migration references.
- **The `package-lock.json` diff is large** (full regeneration, necessitated by the defect above) — reviewed in full; contains only the approved packages' transitive graphs plus harmless in-range patch drift for `ioredis`/`pg`/`joi` (their `package.json` ranges were never touched).

## Rollback approach

Application-level: `git revert` of the dependency-migration commit restores NestJS 10 exactly (`apps/api/package.json` + `package-lock.json`), with zero schema/data involvement (no `redis.health.ts` change was made, so no second commit exists to revert). Deployment-level: identical to the rehearsal above — the pre-migration image tag pattern is proven to work in both directions.

## Recommended next candidate

Per the original PLACE-029 candidate-selection report, **Candidate C (Next.js 14 → 16 + ESLint flat-config migration)** is the remaining framework-migration candidate — independently decidable from this one, requires its own Owner timing decision, and closes the 2 remaining production dependency findings (`next`, `postcss`). Alternatively, **Candidate D's monitoring-provider sub-scope** remains available once the Owner names a provider (`OD2-6`).
