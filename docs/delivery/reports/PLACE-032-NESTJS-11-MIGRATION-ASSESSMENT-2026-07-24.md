# PLACE-032 — NestJS 11 Migration Assessment (Before/After)

- **Date:** 2026-07-24
- **Scope:** Standalone technical assessment of the NestJS 10 → 11 migration's actual effect, separate from the narrative completion report.

---

## Dependency versions before and after

See `PLACE-032-nestjs-11-migration-report.md` §"Dependency versions" for the full table. Summary: 10 packages bumped to their approved NestJS-11-line versions (`@nestjs/common/core/platform-express/testing/cli/schematics` → `11.1.28`-family; `@nestjs/config` → `4.0.4`; `@nestjs/jwt` → `11.0.2`; `@nestjs/typeorm` → `11.0.3`; `@nestjs/terminus` → `11.1.1`), plus `@nestjs/throttler` naturally settling at an in-range `6.5.0`. Every other declared dependency range in `apps/api/package.json` is byte-identical to before. `apps/web/package.json` has zero diff.

## Package-lock impact

The lockfile diff is large (full regeneration) but not because of scope creep: it was forced by a genuine installation defect (see below), not by any additional package.json change. Verified line-by-line by category: (1) the approved packages' own transitive trees changed as expected; (2) `ioredis`/`pg`/`joi` resolved to newer patch versions **within their pre-existing, untouched `package.json` ranges** — ordinary, harmless drift from a from-scratch resolution, not a new upgrade; (3) `@nestjs/cli`'s own internal build-tooling dependencies (Angular DevKit, inquirer) updated as a direct consequence of `@nestjs/cli` itself moving to `11.0.24` — none of this is reachable by the running application, it is devDependency-only tooling.

## Express 5 exposure results

**Zero code change required or made.** Confirmed via:
- `npm view @nestjs/platform-express@11.1.28 dependencies.express` → `5.2.1`, establishing that Express 5 is genuinely the live runtime dependency, not a theoretical concern.
- A full grep of every controller for wildcard routes (`@Get('*')`-style) → zero matches.
- A full grep for `NestModule`/`MiddlewareConsumer` usage → zero matches (the PLACE-030 correlation-ID middleware uses plain `app.use()`, sidestepping Express-5's middleware-ordering changes entirely).
- A full inspection of every `@Query()`-bound DTO across `places`, `search`, `geo`, and `sources` modules → all flat-scalar fields, zero array/nested-object shapes that would be affected by Express 5's `simple` query parser.
- Live proof: the full e2e suite (59/59, unchanged) exercises every one of these DTOs against the real Express 5 adapter with identical results to the Express 4 baseline.

## Config v4 verification

`@nestjs/config@4.0.4`'s headline change ("internal config now takes precedence over env vars on key collision") was reasoned inert before the migration (this repo's `configuration.ts` factory produces nested dotted keys like `database.host`, never colliding with the raw `DB_HOST`-style env-var names actually validated by Joi) and **live-reconfirmed** after: three separate fail-fast boots (missing `DB_PASSWORD`, empty `DB_PASSWORD`, missing `CORS_ALLOWED_ORIGINS`) all crashed with the exact same named Joi error as the NestJS 10 baseline, before any database connection was attempted. One cosmetic-only difference was observed and is documented in the completion report — NestJS 11's own stack-trace formatting for these bootstrap errors changed visually, with no change to the thrown error text or the fail-fast outcome.

## Health-indicator decision

`redis.health.ts` extends the now-deprecated `HealthIndicator` class and throws `HealthCheckError` — both marked deprecated (not removed) in `@nestjs/terminus@11.1.1`. Verified compile-clean (`tsc`, `eslint`) and runtime-correct (unit spec + e2e spec against real Redis, both passing unchanged) without any code modification. Left as-is per the task's explicit decision rule; the deprecation is recorded as a bounded, low-urgency follow-up rather than addressed here, keeping this migration's blast radius at zero application-source lines changed.

## Authentication results

No Passport dependency exists before or after (confirmed via `npm ls` both times and source grep). The hand-rolled `JwtAuthGuard`/`PermissionsGuard` pair, and both their `Reflector.getAllAndOverride()` calls, are unchanged and fully exercised by the unchanged `auth.e2e-spec.ts` (register/login/refresh/logout) and `authz-enforcement.e2e-spec.ts` (protected-route/permission enforcement) suites — both part of the 59/59 e2e total that matched the baseline exactly. Live-verified independently on the built Docker image: register, correct-password login, wrong-password login, and an unauthenticated protected-route request all returned their expected status codes.

## Observability results

Every PLACE-030 guarantee re-verified live on the NestJS 11 image: `AppLoggerService` remains the active runtime logger (confirmed by the identical visual log format — a `Scope.TRANSIENT`-resolution failure or a `ConsoleLogger`-delegate recursion bug, the two real defects PLACE-030 itself found and fixed, would have caused an immediate boot crash or a stack overflow respectively; neither occurred). Correlation-ID propagation was explicitly re-verified with a separate header-vs-body string comparison (not just visual inspection), confirming an exact match. Structured `[HTTP]` log lines appeared for every request with correct correlation IDs. The 401 login attempts produced zero `ERROR`-level log lines, confirming the quiet-4xx guarantee. A full log-history grep for the real test password found zero matches.

## Audit before/after

| Scope | Before | After | Change |
|---|---|---|---|
| Production | 18→15 (PLACE-029) → **15** | **2** | **−13** |
| Incl. dev | 30 | **5** | **−25** |

13 of 15 remaining production findings closed, every one of them `@nestjs/*`-rooted or in that transitive chain (`body-parser`, `express` 4.x, `qs`, `uuid`, `lodash`, `multer`, `file-type`). The 2 remaining (`next`, `postcss`) are entirely Next.js-rooted and were never in scope for this task.

## Tests

Unit: 251/251 (34 suites), identical before and after. E2e: 59/59 (10 suites), identical before and after. Zero test added, zero test skipped, zero test weakened — the entire migration is proven safe by the *existing* test suite continuing to pass unchanged, which is itself strong evidence that no observable behavior changed anywhere the suite has coverage.

## Docker runtime results

Full production-image build, boot, and live verification against real dev Postgres/Redis succeeded on the first attempt after the dependency-installation defect was fixed. See the completion report's Docker/runtime results table for the complete checklist — every item passed.

## Rollback rehearsal

A full N11 → N10 → N11 cycle was executed and verified, including an explicit data-continuity proof (a user created under NestJS 11 successfully authenticated against the NestJS 10 baseline image after rollback, and again against NestJS 11 after forward recovery) — the database and Redis state, being external to the containers, is fully interoperable across the framework-version boundary in both directions.

## Remaining deprecations

- `redis.health.ts`'s `HealthIndicator`/`HealthCheckError` pattern — functional today, will need a `HealthIndicatorService`-based rewrite before a future NestJS major version removes the deprecated classes outright.

## Unresolved limitations

- The 2 remaining production dependency findings (`next`, `postcss`) require the separate Next.js 14→16 migration (Candidate C).
- The `package-lock.json` diff, while fully audited and explained, is large; anyone diffing it by eye should expect the `ioredis`/`pg`/`joi` patch-level drift noted above and not mistake it for an undisclosed scope change.
- The cosmetic NestJS-11 stack-trace formatting change (noted in the completion report) means raw log output for bootstrap-time fatal errors will look slightly different from pre-migration references, though the semantic content is identical.

## Future migration recommendations

- Schedule the `redis.health.ts` → `HealthIndicatorService` rewrite as a small, low-urgency follow-up whenever other health-module work is next touched — no urgency, since the deprecated pattern works correctly today.
- The Next.js 14→16 migration (Candidate C) remains independently decidable and would close the last 2 production dependency findings; it requires its own Owner timing decision, exactly as this migration did.
- No other NestJS-11-driven follow-up work was identified — the migration's actual blast radius matched the read-only assessment's prediction almost exactly, with the one addition being the installation-defect diagnosis-and-fix documented in the completion report.
