# PLACE-030 — Production Observability Foundation (Candidate D, logging sub-scope)

- **Date:** 2026-07-24
- **Authority:** Owner explicit authorization — "PLACE-030 — Production Observability Foundation... Implement the logging sub-scope of Candidate D."
- **Nature:** Repository-level observability hardening only. No framework migration, no external infrastructure, no product-functionality change.
- **Repository:** `D:\Projects\PhuQuocHub` (branch `master`)
- **Toolchain:** Node v20.20.2 / npm 10.8.2 (pinned), Docker Desktop.

---

## Preconditions

| Check | Result |
|---|---|
| PLACE-029 completed | ✅ `state.yaml` `completed_tasks` |
| Working tree clean at start | ✅ |
| `current.task: none` at start | ✅ |
| No `PLACE-030.yaml` existed before this task | ✅ |
| No conflicting observability task active | ✅ |

---

## Original observability gaps (found during preflight, evidence-based)

1. **`AppLoggerService` built but never wired (TD-03).** `grep -rn useLogger apps/api/src` → zero hits before this task. A well-designed logger (redaction, `Scope.TRANSIENT` per-consumer context) existed and was completely dead code.
2. **No correlation/request-ID mechanism anywhere.** `grep -i "correlation|X-Request-Id|requestId|traceId"` across `apps/api/src` → zero hits for any HTTP-level implementation.
3. **A pre-existing, unpopulated wire-contract field.** `ApiMeta.requestId?: string` already existed in `packages/shared-types/src/api-response.ts` and `docs/api/openapi.yaml` (line 1714) but was never set by any code path.
4. **No middleware existed** — `apps/api/src/common/middleware/` was `.gitkeep`-only.
5. **No header naming convention existed** in this repository for a correlation ID — `X-Request-Id` was adopted as the industry-standard default, recorded explicitly as a fresh decision rather than an assumed pre-existing one.

What was **already correct** and preserved unchanged: `AllExceptionsFilter` already gated `.error()` logging on `status >= 500` only — expected business errors (400/401/403/404/429) were already quiet. `LoggingInterceptor` already logged exactly one line per request (no duplicate-log risk). Neither request nor response bodies were ever logged.

---

## Architectural approach selected

**Correlation ID:** per-request state stored directly on the Express `Request` object (via a small `RequestWithCorrelationId` interface, matching the codebase's existing convention for `request.user` in `CurrentUser` decorator — a typed cast, not a global `declare module` augmentation). **Not** `AsyncLocalStorage`: every place that needs the correlation ID (the request-lifecycle log, the exception log, the response `meta`) already has direct access to the request object via `ExecutionContext`/`ArgumentsHost` — no deep, request-detached service ever needs it, so `AsyncLocalStorage` would have been unjustified complexity. **Not** mutable module-level global state — each request gets its own `req` object from Node/Express, so there is no shared, overwritable state between concurrent requests.

**Logger wiring:** `app.useLogger(await app.resolve(AppLoggerService))` in `main.ts`, with `bufferLogs: true`. This is the officially-documented NestJS mechanism for attaching a custom `LoggerService`, and — because `AppLoggerService` is `Scope.TRANSIENT` — required `app.resolve()` (async), not `app.get()` (see "A real bug found and fixed" below). Once attached, NestJS's `Logger.overrideLogger()` mechanism means every `new Logger(x)` call anywhere in the app (framework-internal and application code alike) transparently routes through `AppLoggerService`, without needing to touch every call site individually.

**Interceptor/filter integration:** `LoggingInterceptor` and `AllExceptionsFilter` now accept an **optional** `LoggerService` constructor parameter, defaulting to `new AppLoggerService()`. This was a deliberate, evidence-driven choice: `grep` found `new AllExceptionsFilter()`/`new TransformInterceptor()` called with zero arguments in **9 separate pre-existing e2e spec files**. A required constructor parameter would have forced editing all 9. The optional-default pattern means **none of those 9 files needed any change**, and all 9 continue to pass unmodified.

---

## A real bug found and fixed (live-verification value)

Live Docker verification — not any unit or e2e test — caught **two genuine runtime bugs** that static checks could not have found, because neither the unit suite nor the e2e suite ever invokes `main.ts`'s actual `bootstrap()` function:

1. **`app.get(AppLoggerService)` threw at runtime**: `AppLoggerService` is `Scope.TRANSIENT`; NestJS requires `app.resolve()` (async) for scoped providers, not `app.get()`. Fixed by switching to `await app.resolve(AppLoggerService)` everywhere it's used in `main.ts`.
2. **Infinite recursion / stack overflow after fixing #1**: `AppLoggerService`'s internal `delegate` was `new Logger()`. Once `app.useLogger()` made `Logger.staticInstanceRef` point at the `AppLoggerService` instance itself, the delegate's `.log()` call (which internally re-delegates through `Logger.staticInstanceRef` per NestJS's own source, `node_modules/@nestjs/common/services/logger.service.js`) looped straight back into `AppLoggerService.log()` — forever. Fixed by changing the delegate from `Logger` (the overridable static-delegating wrapper) to `ConsoleLogger` (the concrete, non-overridable implementation class that `Logger`'s default instance is itself backed by) — identical visual output, no recursion.

Both were diagnosed from the exact stack trace/error message produced by the real container boot, fixed with the minimal targeted change, and the **entire affected verification (typecheck, full unit, full e2e, then Docker rebuild+reboot) was re-run from scratch** after each fix, per the task's explicit instruction not to conceal or route around a failure.

---

## Correlation-ID lifecycle

1. `correlationIdMiddleware` (registered first, before any other global wiring, applying to every method including `OPTIONS`) reads the `X-Request-Id` header.
2. If present and matching `^[A-Za-z0-9._-]{1,128}$`, it is reused unchanged. Otherwise (missing, or containing anything outside that safe charset — e.g. CR/LF or excessive length), a fresh `crypto.randomUUID()` is generated. No new npm dependency was added — `crypto.randomUUID()` is a Node built-in.
3. The ID is attached to `req.correlationId` and immediately echoed as the `X-Request-Id` response header.
4. `LoggingInterceptor` reads it and includes it in the single structured request-lifecycle log line (`{correlationId, method, path, statusCode, durationMs}`).
5. `TransformInterceptor` includes it as `meta.requestId` in every success response body.
6. `AllExceptionsFilter` includes it in `meta.requestId` for every response body (success or error) and, additionally, in the structured error-log object for genuinely unexpected (`>=500`) exceptions only.
7. The same ID is therefore identical across: the response header, the response body, the request-lifecycle log, and (when applicable) the exception log — live-proven (see Runtime verification below).

---

## Redaction rules

`AppLoggerService.REDACTED_KEYS` expanded and matching made **case-insensitive** (previously exact-case only):
- Added the **snake_case** wire-format variants actually used by this repo's contract (`access_token`, `refresh_token`, `password_hash`) — the pre-existing key list only had camelCase forms, which would never have matched this codebase's actual JSON field names had an object ever been logged.
- Added `cookie`/`cookies`/`setCookie`/`set-cookie`, `dbPassword`/`db_password`, `redisPassword`/`redis_password`, `connectionString`/`connection_string`.

**Structural protection, unchanged and reinforced:** `LoggingInterceptor` and `AllExceptionsFilter` never construct a log object containing the request/response body, headers, or DTO — only `correlationId`/`method`/`path`/`statusCode`/`durationMs` (and, for exceptions, `errorType`/`message`/stack). This means secrets cannot leak through these two call sites **by construction**, independent of the redaction utility — verified live (see below) with a real password and real JWT tokens during an actual register→login flow.

---

## Tests added

| File | Count | Proves |
|---|---|---|
| `apps/api/src/common/middleware/correlation-id.middleware.spec.ts` (new) | 7 | ID generation, valid-ID passthrough, invalid/oversized-ID rejection+regeneration, per-request uniqueness (not global state), `getCorrelationId` read-back + safe fallback |
| `apps/api/src/common/filters/all-exceptions.filter.spec.ts` (new — none existed before) | 5 | 500-path logs correlationId/method/path/errorType/stack; 400/401 stay quiet; `meta.requestId` always populated; default-constructible |
| `apps/api/src/common/interceptors/logging.interceptor.spec.ts` (rewritten) | 5 | structured log object incl. correlationId; error-path logging; RPC contexts skipped; exactly one log per request; default-constructible |
| `apps/api/src/common/interceptors/transform.interceptor.spec.ts` (updated) | 5 (2 new) | `meta.requestId` populated from the request; safe `'unknown'` fallback |
| `apps/api/src/core/logger/app-logger.service.spec.ts` (updated) | 7 (4 new) | snake_case key redaction, cookie/DB/Redis-credential key redaction, case-insensitive matching, nested-object redaction |
| `apps/api/test/observability.e2e-spec.ts` (new) | 8 | full-stack (middleware→interceptor→filter) correlation-ID generation/propagation, request-log correlation match, **unexpected-500 correlation-ID+log proof (via a test-only throwing module that exists only in this spec file, never registered in production `app.module.ts`)**, real-password/real-token absence from all log calls across a genuine register+login flow, quiet-401 preserved, health/auth behavior preserved |

**Total new/changed tests: 32** (7+5+5+2+4+8 net-new, plus the rewritten baseline assertions).

---

## Verification totals

| Check | Before this task | After this task |
|---|---|---|
| Lint (api) | exit 0 | exit 0 |
| Typecheck (api) | exit 0 | exit 0 |
| Typecheck (web) | exit 0 | exit 0 (unaffected — no web file touched) |
| Unit tests | 231/231, 32 suites | **251/251, 34 suites** (+20 tests, +2 suites) |
| E2e tests | 51/51, 9 suites | **59/59, 10 suites** (+8 tests, +1 suite) — **all 9 pre-existing e2e files pass unmodified** |
| Clean production build | 4/4, 0 cached | 4/4, 0 cached, real artifacts confirmed |

---

## Runtime evidence (live Docker verification)

All against the real dev `phuquoc-postgres`/`phuquoc-redis`, `NODE_ENV=production`:

- **Boot:** clean, `Nest application successfully started`, `Redis connected` — identical visual log format to before PLACE-030 (confirming the `ConsoleLogger` delegate fix preserved output shape).
- **Correlation ID, generated:** `GET /api/health` with no incoming header → `X-Request-Id: 6410c13d-91c2-49de-8b69-39cc3d65f71c` response header, `meta.requestId` in the body **exactly matching**.
- **Correlation ID, propagated:** `GET /api/health -H "X-Request-Id: my-custom-trace-777"` → response header `X-Request-Id: my-custom-trace-777` (unchanged).
- **Request-lifecycle logs, real container output:**
  ```
  [HTTP] {"correlationId":"6410c13d-...","method":"GET","path":"/api/health","statusCode":200,"durationMs":20}
  [HTTP] {"correlationId":"my-custom-trace-777","method":"GET","path":"/api/health","statusCode":200,"durationMs":19}
  [HTTP] {"correlationId":"corr-register-001","method":"POST","path":"/api/auth/register","statusCode":201,"durationMs":169}
  [HTTP] {"correlationId":"corr-login-ok","method":"POST","path":"/api/auth/login","statusCode":200,"durationMs":90}
  [HTTP] {"correlationId":"corr-login-bad","method":"POST","path":"/api/auth/login","statusCode":"ERR","durationMs":85}
  ```
- **Auth round-trip (bcrypt unaffected):** register → `201`, `meta.requestId` == the supplied `X-Request-Id`; login correct password → `200`; login wrong password → `401`.
- **Quiet business errors preserved:** the `401` login above produced **zero** `ERROR`/`AllExceptionsFilter` log lines in the container output.
- **No secret leakage:** `docker logs` (full container history) grepped for the real test password and both issued JWT tokens — **zero matches**.
- **DB-credential fail-fast unaffected by this task's `main.ts` changes:** booting with `DB_PASSWORD` unset → `Config validation error: "DB_PASSWORD" is required`; booting with `DB_PASSWORD=""` → `Config validation error: "DB_PASSWORD" is not allowed to be empty`. Both crash before any DB connection attempt, identical to PLACE-029.
- **Web image:** rebuilt (per repository convention of verifying both images together), booted, `GET /` → `200` — confirms zero cross-application impact (no `apps/web` file was touched).
- **Dev-stack integrity:** `phuquoc-postgres`/`-redis`/`-minio` healthy throughout; `migrations` = 20 (unchanged); `places` = 49 (unchanged); all live-verification test users deleted afterward (`0` matching rows confirmed); verification containers and images removed.

**Not live-verified in Docker (by design, not oversight):** the unexpected-500 exception-logging path. No production route exists that raises an unhandled, non-`HttpException` error, and this task deliberately did not add one (a debug/throw route in the shipped image would itself be a security-hygiene concern and is excluded by "no new business features" / "no unrelated cleanup"). This path is instead proven at the **e2e level** (`observability.e2e-spec.ts`, full HTTP stack via supertest) using a controller that exists **only inside the test file's own compiled test module** — never registered in `app.module.ts`, never present in the Docker image. This is a deliberate, documented scope boundary, not an unverified claim.

---

## Unresolved limitations

- **CORS `allowedHeaders`/`exposedHeaders` were not updated** to include `X-Request-Id`. The header is present on every raw HTTP response regardless (CORS only gates browser-JS visibility of the header, not its presence on the wire), so this does not affect the correlation-ID feature's actual function — but a browser-side JS client will not be able to *read* the header via `fetch()`/`XHR` cross-origin without this addition. Deliberately out of scope to avoid reopening the PLACE-028-hardened CORS surface without a concrete requirement forcing it.
- **Stack traces and raw exception messages are logged verbatim** for unexpected (`>=500`) errors, beyond the structured object's own keys. This is consistent with the pre-existing design and `coding-standard.md §5`'s "log đầy đủ context" principle, but means a raw error message that happened to embed a secret (e.g., a driver-level error string containing a credential) would not be redacted by the current mechanism. No such case was found in this codebase's actual error paths, but it is a theoretical residual risk worth naming.
- **The monitoring-provider sub-scope of Candidate D was not touched** — no external/paid observability vendor integration, no dashboard, no alert channel. That remains a separate Owner decision (`OD2-6`), explicitly out of scope for this task.
- **DB/Redis startup logging was reviewed but not changed** — no credential leakage or clarity gap was found requiring a fix.

---

## Rollback approach

Every change is additive: a new middleware file, optional constructor parameters with safe defaults (no existing call site broke), new response-body/log fields, and an expanded (never narrowed) redaction key set. `git revert` of the observability-runtime commit fully restores the pre-task bootstrap/interceptor/filter/logger behavior. No schema, migration, or API contract removal is involved — `ApiMeta.requestId` already existed as an optional field in the contract before this task; this task populates it, it does not add it.

---

## Not claimed

| Item | Disposition |
|---|---|
| NestJS/Next.js migration | NOT performed |
| Any broad dependency upgrade | NOT performed — zero `package.json` touched |
| Database schema change | NOT made |
| New business feature or API contract redesign | NOT made — `requestId` already existed in the contract, unpopulated |
| Replacing `AppLoggerService` | NOT done — repaired/completed, not replaced |
| Paid external observability vendor integration | NOT performed — Candidate D's monitoring sub-scope remains a separate Owner decision |
| Any of the 9 pre-existing e2e spec files that construct `AllExceptionsFilter`/`TransformInterceptor` with no arguments | NOT modified |
| PLACE-031 | NOT started, NOT created |
