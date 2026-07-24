# PLACE-030 — Observability Assessment (Before/After)

- **Date:** 2026-07-24
- **Scope:** Logging and correlation-ID posture, resulting from the PLACE-029 Candidate Selection report's Candidate D logging sub-scope.
- **Baseline source:** Live repository inspection at PLACE-030's start (this session), cross-checked against `PRODUCTION-READINESS-REASSESSMENT-V2-2026-07-24.md`, which scored **Observability at 10/100** — the single lowest-scoring dimension of the whole reassessment.

---

## Before vs. after

| Dimension | Before | After |
|---|---|---|
| Centralized logger wired into the runtime | ❌ `AppLoggerService` built, never used (`app.useLogger` never called) — plain `Logger` static class used everywhere | ✅ `app.useLogger(await app.resolve(AppLoggerService))`; every `Logger` call site (framework-internal and application) routes through it |
| Correlation/request ID | ❌ None — no header, no per-request tracking, `ApiMeta.requestId` declared in the wire contract but never populated | ✅ Every request gets an ID (client-supplied if valid, else generated); present in the `X-Request-Id` response header and `meta.requestId` in every response body |
| Request-lifecycle logging | ⚠️ One plain-string line per request (`method url → status (Nms)`), no correlation ID, no structure | ✅ One structured JSON object per request (`{correlationId, method, path, statusCode, durationMs}`) — same one-log-per-request discipline preserved |
| Exception logging | ⚠️ 5xx-only (already correct), plain string + stack, no correlation ID | ✅ 5xx-only (unchanged gate), structured object (`correlationId, method, path, statusCode, errorType, message`) + stack, correlation ID ties it to the exact response the client received |
| Quiet business errors (400/401/403/404/429) | ✅ Already quiet (pre-existing, correct) | ✅ Unchanged — verified live, zero log noise for a real 401 |
| Sensitive-data redaction coverage | ⚠️ Existed but incomplete — only camelCase keys (`accessToken`, `passwordHash`, ...); this repo's actual wire format is snake_case (`access_token`, `password_hash`), so those would **not** have been redacted if ever logged. Case-sensitive matching (`Password` ≠ `password`). No cookie/DB/Redis-credential keys. | ✅ Snake_case variants added; case-insensitive matching; cookie/DB-credential/Redis-credential keys added. Live-proven: a real password and two real JWT tokens, generated during an actual register+login flow, do not appear anywhere in the container's log output. |
| Body/header logging | ✅ Never logged by any call site (already correct) | ✅ Unchanged — structurally impossible to leak via these call sites, by construction |
| Runtime correctness of the wiring itself | N/A (never wired, so never tested in a running process) | ✅ Two real runtime bugs found and fixed via live Docker verification (see below) — neither was, or could have been, caught by the unit or e2e suite, since neither exercises `main.ts`'s actual `bootstrap()` |

---

## Runtime bugs found and fixed during this task

Both bugs existed **latently** in the codebase before PLACE-030 (the second one specifically in `AppLoggerService`'s own design, present since it was first written) but were unreachable/inert because the service was never wired. Wiring it — the entire point of this task — is what surfaced them. This is presented as a genuine finding, not concealed or routed around, per this task's explicit instruction.

1. **`app.get()` on a `Scope.TRANSIENT` provider throws.** `AppLoggerService` is `Scope.TRANSIENT`; NestJS requires `app.resolve()` for scoped providers. Fixed: `app.resolve(AppLoggerService)` (async) everywhere in `main.ts`.
2. **Infinite recursion in `AppLoggerService` once it became the global override target.** Its internal `delegate` was `new Logger()` — the overridable static-delegating wrapper class. Once `Logger.staticInstanceRef` pointed at the `AppLoggerService` instance itself (via `app.useLogger()`), the delegate's own `.log()` call routed straight back into `AppLoggerService.log()`, forever. Fixed: delegate changed to `new ConsoleLogger()` — the concrete, non-overridable implementation class — identical visual output, no recursion.

Both fixes were verified by re-running the **full** affected verification (typecheck → full unit → full e2e → clean build → Docker rebuild → Docker reboot) from scratch, not merely re-checking the failing step in isolation.

---

## Residual risk / limitations (carried forward honestly)

- The correlation-ID response header is not yet exposed to browser-side JavaScript cross-origin (`Access-Control-Expose-Headers` not set) — deliberately deferred, see the main report's "Unresolved limitations."
- Raw exception messages and stack traces for unexpected (`>=500`) errors are not deep-redacted beyond the structured object's own keys — a theoretical residual risk, no instance found in this codebase's actual error paths.
- No metrics, tracing, dashboards, or alerting exist yet — this task closes the **logging** sub-scope of Candidate D only. The **monitoring-provider** sub-scope (an external signal + alert channel) remains a separate Owner decision (`OD2-6`), not started here.

---

## Net effect

The single lowest-scoring dimension identified in the production-readiness reassessment (Observability, 10/100) now has: a wired centralized logger, per-request correlation-ID tracing across response header + response body + logs, structured (not plain-string) request/exception logs, and materially strengthened sensitive-data redaction — all delivered without any framework migration, external dependency, or product-functionality change, and with zero regression to the 9 pre-existing e2e specs or any prior PLACE task's behavior.
