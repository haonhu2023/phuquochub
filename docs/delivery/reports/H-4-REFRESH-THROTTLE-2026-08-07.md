# H-4 — REFRESH THROTTLE

## Status

**Complete.** Closes finding **H-4** of the read-only Production Readiness Review (full-repository
audit, 2026-08-06 — never written to a file in this repository, same as H-1/H-3):

> "The refresh endpoint currently lacks a dedicated throttle and therefore allows excessive refresh
> attempts."

Only refresh throttling was implemented. No change to token rotation (`TokenService.rotate()`), no
change to revocation (H-1, `AuthRevocationService`), and no change to audit event *content* (H-3) —
the one audit-adjacent guarantee this milestone had to preserve (a throttled request must never be
reported as `auth.refresh.success`) turned out to require **zero** code change, because it already
followed from how NestJS executes guards before handlers (see §6).

## Throttle configuration

`POST /auth/refresh` now carries `@Throttle(AUTH_THROTTLE)` — the exact same constant already
applied to `register`/`login`, reading the same environment variables
(`RATE_LIMIT_AUTH_TTL`/`RATE_LIMIT_AUTH_LIMIT`, default 10 req/60s). No new environment variable, no
new throttle tier, no second rate-limiter package — this is the repository's existing
`@nestjs/throttler` infrastructure, applied to one more route.

Sharing the *config object* does not mean sharing a *counter*. Confirmed by reading
`node_modules/@nestjs/throttler@6.5.0`'s `ThrottlerGuard.generateKey()` directly rather than
assuming: the throttle key hashes `ClassName-HandlerName-ThrottlerName` together with the tracker
(`req.ip` by default). `login`, `register`, and `refresh` therefore get three independent buckets
even though all three reuse the identical `AUTH_THROTTLE` values. `logout` and `logout-all` were left
untouched — both already require authentication (not `@Public()`), so they fall under the global
100 req/60s limit exactly as before, per the "unless already configured" instruction.

## Files changed

- **`apps/api/src/modules/auth/auth.controller.ts`** — added `@Throttle(AUTH_THROTTLE)` to the
  `refresh` route. This is the entire product-code diff for this milestone.
- **`apps/api/test/auth-refresh-throttle.e2e-spec.ts`** (new) — all required behavior proven live.
- **`docs/api/openapi.yaml`** — `429` added to `/auth/refresh`'s responses, matching `login`/
  `register`; a short description explains the shared-config/independent-bucket relationship.
- **`docs/architecture/deployment.md`** — new dated addendum (see §10).
- **`docs/delivery/state.yaml`**, this report.

## Success behavior

Proven with a genuine rotation chain, not a single call: one refresh token is minted, then used,
re-minted, and reused five times in sequence (each response's `refresh_token` feeds the next
request) — all five return `200` with a fresh `access_token`. This is below the default limit of 10,
so nothing throttle-related interferes with normal operation, and it's the same rotation behavior
H-1 already established (single-use, chained) — unchanged.

## Throttle behavior

`10` requests with a deliberately invalid refresh token each return `401` (the route still functions
normally up to the limit — the guard only intervenes once the count is exceeded); the `11th` request
returns `429` with the identical envelope shape `security-hardening.e2e-spec.ts` already asserts for
`/auth/login`'s own throttle (`success: false`, standard error envelope) — no new response format was
invented, satisfying the "existing throttle response format" requirement by construction.

Two further behaviors were proven, both live, not simulated:

- **Window reset**: after being blocked, the test waits out the real default 60-second TTL (no
  mocked clock — `ThrottlerStorage` is a real in-memory store with real wall-clock expiry) plus a
  1-second buffer, then confirms the next request is no longer `429` (it returns `401` again, i.e.
  the route works normally, just no longer throttled).
- **Per-client isolation**: a dedicated app instance is booted with `app.set('trust proxy', 1)`
  (mirroring `main.ts`'s real conditional exactly), so `X-Forwarded-For` is honored the way it would
  be behind the real Caddy reverse proxy described in `deployment.md`. Client A is throttled after 10
  requests; client B, identified by a different `X-Forwarded-For` value, is confirmed unaffected on
  its very first request. This is a genuine IP-keyed isolation proof, not merely a route-isolation
  proof — supertest requests against a single in-process server would otherwise all share one
  loopback address, which the `trust proxy` + header technique works around faithfully rather than
  by mocking the tracker function.

## Audit interaction

No `AuditEvent` field, redaction rule, or emission call was touched. The guarantee ("throttled
requests are not reported as refresh success") holds because `ThrottlerGuard` is a global `APP_GUARD`
that runs, like every guard, strictly before the route handler body — and `AuthService.refresh()` is
only ever invoked from inside that handler body. A request `ThrottlerGuard` rejects with `429` never
reaches `AuthService.refresh()`, so it is structurally incapable of emitting `auth.refresh.success` or
`auth.refresh.failure`. This was verified, not just reasoned about: the throttle-exceeding test
snapshots `audit_logs` counts before and after sending 10 valid-reaching-handler requests plus 1
blocked request, and asserts the `auth.refresh.failure` count increased by exactly `10` (not `11`)
and the `auth.refresh.success` count increased by exactly `0`.

Separately, the "revoked refresh still behaves exactly as H-1" test confirms the *content* of H-3's
audit trail is unaffected by this milestone: reusing an already-rotated token still produces a
`401` with the exact H-1 message ("Refresh token đã bị thu hồi hoặc không hợp lệ") and still emits
`auth.refresh.failure` with `context.reason: 'revoked'`, unchanged.

## Tests

**New `auth-refresh-throttle.e2e-spec.ts`: 5/5 passing**, ~85s (dominated by the one genuine
60-second window-reset wait; the other four tests are fast). All 7 required behaviors are covered,
several combined naturally where one HTTP sequence proves more than one property:

| Requirement | Test |
|---|---|
| refresh succeeds under limit | "dưới giới hạn (5/10)" |
| successful refresh still audits `auth.refresh.success` | same test — asserts the row count |
| revoked refresh still behaves exactly as H-1 | "token đã bị thu hồi" |
| exceeding limit returns throttle response | "10 request đầu … request thứ 11 → 429" |
| throttled refresh does not emit `auth.refresh.success` | same test — before/after audit delta |
| waiting for the window allows refresh again | "cửa sổ giới hạn tự đặt lại" |
| another client/IP is unaffected | "client khác (IP khác) không bị ảnh hưởng" |

**Design choice worth recording**: each of the four `describe` blocks boots its **own** Nest
application instance rather than sharing one. `ThrottlerModule.forRootAsync`'s in-memory storage is
scoped to the DI container it's registered in — confirmed by `RateLimitModule`'s own existing
comment ("in-memory, một instance") — so a shared instance would let one test group's exhausted
counter leak into the next group's assertions depending on execution order. Separate instances make
every test's starting throttle state deterministic regardless of ordering, at the cost of ~4 extra
app bootstraps (a few seconds total).

No new unit tests were added. `AuthController` has no existing unit spec (a "thin controller"
convention already established in this codebase — logic lives in services, which are unit-tested;
controllers are proven live in e2e), and this milestone's only code change is a decorator with no
new branching logic to unit-test. `security-hardening.e2e-spec.ts`'s pre-existing
`/api/auth/login` throttle test was re-run as part of regression and continues to pass unchanged.

## Live validation

Focused H-4 e2e: **5/5**, ~85s. Focused auth regression (`auth`, `auth-audit`,
`auth-token-revocation`, `authz-*`, `security-hardening`): **9 suites / 69 tests**, all pass —
notably `auth-token-revocation.e2e-spec.ts` (H-1, 2 real `/auth/refresh` calls) and
`auth-audit.e2e-spec.ts` (H-3, 4 real `/auth/refresh` calls) both stayed comfortably under the new
limit and needed no changes. Zero residue confirmed by SQL for `e2e_h4_%` after every run; zero
lingering `node` processes after every run (the teardown-hang fix from the previous milestone applies
here too — this new file's `afterAll` blocks follow the same try/finally pattern from the first line).

## Full regression

| Gate | Result |
|---|---|
| Focused auth unit | 12 suites / 147 tests — pass (unchanged) |
| Focused auth e2e (incl. `security-hardening`) | 9 suites / 69 tests — pass |
| BE unit (full) | **129 suites / 1547 tests** — pass (unchanged — no new unit tests) |
| BE e2e (full, `--runInBand`) | **31 suites / 279 tests** — pass (+1 suite, +5 tests) |
| `tsc --noEmit` | clean |
| `eslint "src/**/*.ts" --max-warnings=0` | clean |
| New e2e file linted individually | clean |
| `nest build` | clean |
| Monorepo `turbo run typecheck lint build` | **12/12** |
| `git diff --check` | clean |
| Secret scan over the diff | no findings |
| New migrations | **none** |
| DB residue after full e2e run | zero |

## Documentation

- **`docs/api/openapi.yaml`** — `429` added to `/auth/refresh`, kept synchronized with `login`/
  `register`.
- **ADR implementation status** — not applicable. No dedicated ADR governs rate limiting; the
  decision (`PLACE-028`, OD2-12) has always lived in `docs/architecture/deployment.md`, which is the
  document updated here (a new dated addendum, leaving the original PLACE-028 paragraph verbatim as
  historical record rather than silently editing it — same convention used throughout this session).
- **`docs/delivery/state.yaml`** — H-4 summary pushed to the top of the `current.task` chain, H-3's
  summary demoted verbatim beneath it.
- This report.

## Remaining H-5 work

Untouched, as instructed. H-5 (no refresh-token family/lineage tracking or reuse detection) remains
fully open: a stolen-and-replayed refresh token is still only caught reactively on its second use
(`reason=revoked`, audited since H-3), not proactively via family-wide revocation. Throttling reduces
the *rate* at which a compromised or buggy client can hammer the endpoint but does nothing to detect
or respond to a genuine token-theft replay pattern — that is the problem H-5 exists to solve.
