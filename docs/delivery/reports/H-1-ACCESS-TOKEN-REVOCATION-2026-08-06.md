# H-1 — ACCESS TOKEN REVOCATION (Production Hardening)

## Status

**Complete.** Narrow hardening milestone closing finding **H-1** of the
[PRODUCTION READINESS REVIEW](./PRODUCTION-READINESS-REVIEW-2026-08-06.md):

> "Access tokens cannot be revoked; deactivated or banned users retain API access until
> `JWT_ACCESS_TTL` expires."

No new database schema, no migration, no change to the JWT format, no change to refresh rotation
semantics, no change to the permission model / PDP / PEP / ADR-019 / role semantics.

## Phase 1 — read, and the contradiction found before writing code

Read in full: `JwtAuthGuard`, `PermissionsGuard`, `TokenService`, `AuthService`, `AuthController`,
`AuthModule`, `UsersRepository`, `UsersService`, `UsersController`, `User` entity, `RedisModule`/
`RedisService`, `auth.e2e-spec.ts`, ADR-016, ADR-007, `deployment.md`, `moderation.md` §UC-M,
`SeedRbac`, and the live `users` table.

Phase 1 surfaced a genuine contradiction, reported to the Owner **before** any code was written:
**two of the four triggers named in the brief have no call site in this repository.**

| Evidence | Finding |
|---|---|
| `grep -rn "isActive\s*=\|isActive:"` over `apps/api/src` returns exactly one non-test write: `isActive: true` at registration (`auth.service.ts:56`) | **Nothing ever deactivates a user.** `is_active=false` is reachable only by out-of-band SQL. |
| `SeedRbac:39` creates `User.Ban`; `:80` grants it to `administrator`; no `@RequirePermissions('User.Ban')` exists in any controller | **`User.Ban` is a seeded permission with zero enforcement points.** |
| `moderation.md` §UC-M line 64 says the flow updates "`users` (trạng thái warn/mute/ban)"; live `\d users` has only `is_active` and `is_service_account` | **Spec names ban state the schema cannot hold.** |
| `grep -rni "changePassword\|resetPassword\|newPassword"` returns nothing | **No password-change or reset flow exists.** |

The only reachable trigger of the four was therefore **role change** — which is also the live bug
worth fixing: revoke a moderator's role and they keep moderator authority for up to
`JWT_ACCESS_TTL`.

**Owner decisions received:** D1-**A** (mechanism + the three existing triggers; no ban/deactivation
endpoint, no password flows; expose the primitive for future flows), D2 **fail closed**, D3
`UsersService` changes authorized with the security-side-effect rule.

## Phase 2 — design

**Redis revocation epoch, enforced in `JwtAuthGuard`.**

- `authrev:{userId}` → revocation timestamp in epoch **seconds**; TTL = `jwt.accessTtl`.
- Guard, after signature verification: one `GET`. Absent → valid. Present and `iat < revokedAtSec` → 401.
- **JWT format unchanged.** `iat` already exists in every access token (`@nestjs/jwt` →
  `jsonwebtoken` adds it unless `noTimestamp`; `AuthModule` sets only `expiresIn`). Tokens issued
  before this milestone keep working — no token migration, no coordinated deploy.
- **Key TTL = access TTL** is the load-bearing property: after that window every token issued before
  the epoch is independently expired, so the key stops carrying information and can vanish. Storage
  is O(recently-revoked users), self-cleaning, no sweeper job.
- **Cost: one Redis `GET` per authenticated request. Zero DB lookups.** `@Public()` routes return
  before it.

**Module placement.** `AuthRevocationModule` lives in `core/` and is `@Global()`, following the
`AuditModule` precedent exactly. This is not stylistic: the three consumers sit in three different
modules (`JwtAuthGuard` and `AuthService` in `AuthModule`, `UsersService` in `UsersModule`) and
`AuthModule` already imports `UsersModule` — putting the service in `AuthModule` would force
`UsersModule` to import it back, creating a **module cycle**. `core/` + `@Global()` avoids the cycle
without `forwardRef`. The module imports nothing: `RedisService` and `ConfigService` are already global.

## Phase 3 — implementation

**New — `apps/api/src/core/auth-revocation/auth-revocation.service.ts`**

- `revokeAllForUser(userId): Promise<number>` — the primitive Owner D1-A requires future
  deactivate/ban/password flows to call. Writes the epoch with `EX = jwt.accessTtl`. On Redis
  failure: logs `error` and throws `ServiceUnavailableException` — **never silent** (Owner's
  security-side-effect rule).
- `assertNotRevoked(userId, iat)` — the guard path. Throws `UnauthorizedException` when revoked.
  **Fail closed** on Redis failure, corrupt epoch value, or a token missing `iat`.
- **Log-level discipline (D2):** only infrastructure/control failures log at `error`. An ordinary
  revoked token throws without an error log — otherwise every logout-all would flood the error
  channel and dilute real signal. Both branches are unit-tested with a spy asserting the log
  *is* and *is not* called.

**Changed — `JwtAuthGuard`** (`modules/authz/guards/jwt-auth.guard.ts`). Signature verification moved
out of the bare `try/catch` into a typed `payload`, then `assertNotRevoked` is called **outside** that
catch — deliberately, so its distinct message ("session revoked" vs "token invalid/expired") and its
fail-closed 401 are not collapsed into one generic error. Principal is attached only after both checks
pass.

**Changed — `TokenService`** (`modules/auth/token.service.ts`). Added the per-user refresh index
`refresh:user:{userId}` (a Redis SET of `jti`s) that logout-all needs — previously Redis held only
`refresh:{jti} → userId`, with no way to enumerate a user's tokens. `issueTokens` writes both keys plus
the index TTL in one `MULTI`; `rotate` and `revoke` `SREM` the consumed `jti` in the same `MULTI` as
their `DEL`. New `revokeAllRefreshForUser(userId)` reads the index, deletes every `refresh:{jti}` and
the index itself, and returns the count. **Rotation semantics are untouched** — still single-use, still
`jti`-checked, still `isActive`-checked. This is index bookkeeping only, and explicitly **not**
family/reuse detection (that is H-5).

**New — `POST /auth/logout-all`** (`auth.controller.ts` + `AuthService.logoutAll`). Authenticated (no
`@Public()`), takes no body, and `userId` comes **only** from the JWT — so it cannot log anyone else
out. Order is deliberate: refresh tokens first, epoch second. If the second step fails, refresh is
already gone so the user cannot mint new access tokens; the reverse order would leave refresh intact
and let the user mint a fresh valid access token, i.e. logout-all failing **silently**. Three unit
tests pin the order and both failure directions.

**Changed — `UsersService`** (Owner D3). After a successful `assignRole()` / `revokeRole()`, calls
`revokeAllForUser(targetUserId)`. Order is DB → audit → revoke, so the privileged action always leaves
an audit trail even when Redis fails.

### Cross-system atomicity — recorded honestly

The `user_roles` mutation is in Postgres; the revocation epoch is in Redis. **There is no shared
transaction.** If Redis fails, `revokeAllForUser` throws (surfacing 503 to the caller) but the role
change **has already committed** and the audit row **has already been written**. Resulting state:
role changed, old tokens not yet revoked (alive until TTL). We chose to surface the failure rather
than swallow it, so an operator knows to retry. A stronger solution (outbox / retry queue) needs
infrastructure this repository does not have and is out of scope for H-1. A unit test asserts exactly
this: the error propagates **and** `userRolesRepo.revoke` and `audit.record` were both still called.

## Phase 4 — tests

**Unit: 129 suites / 1527 tests** (from 127 / 1496 — **+2 suites, +31 tests**), all passing.

- `core/auth-revocation/auth-revocation.service.spec.ts` (new, 13 tests) — epoch written in seconds
  with TTL from config (not hardcoded); Redis write failure throws + logs; absent key passes; token
  before epoch 401s; token after epoch passes; token in the **same second** passes; revoked token does
  **not** log error; Redis read failure fails closed **and** logs; corrupt epoch fails closed; missing
  `iat` fails closed; exactly one `GET` per check.
- `modules/authz/guards/jwt-auth.guard.spec.ts` (new, 7 tests) — `@Public()` performs **neither**
  verification nor a revocation check; missing header short-circuits; valid token passes the correct
  `sub`+`iat` through; **a revoked-but-well-signed token leaves `request.user` undefined** (so the
  downstream `PermissionsGuard` cannot mistake it for authenticated); invalid signature skips the
  Redis round-trip.
- `token.service.spec.ts` — mock upgraded to record `MULTI` command sequences; existing assertions
  rewritten against them; 4 new tests for `revokeAllRefreshForUser` including the empty-index path
  (no wasted `MULTI`), orphaned `jti`s, and error propagation.
- `users.service.spec.ts` — 6 new tests: assign/revoke revoke the **target** (not the actor); audit
  precedes revoke; Redis failure propagates while DB mutation + audit already happened; both
  validation-failure paths revoke nothing.
- `auth.service.spec.ts` — 3 new tests for `logoutAll` ordering and both failure directions.

**E2E: new `test/auth-token-revocation.e2e-spec.ts`, 13/13 passing** against live Postgres + Redis.

Covers every scenario the Owner required: active token 200; epoch invalidates an older token; a token
issued after revocation still works; role assign invalidates the target's token (and *not* the
admin's); role revoke invalidates it; logout-all kills all three devices' access **and** refresh
tokens and empties the index; logout-all requires authentication; another user's tokens survive;
simulated deactivation (`is_active=false` by SQL **plus** an explicit `revokeAllForUser`) 401s; Redis
failure fails closed; `@Public()` routes are unaffected; the epoch key carries a positive TTL ≤
`jwt.accessTtl`.

The fail-closed test simulates a **real** outage at exactly the point the guard reads — spying on the
live ioredis client's `get` and throwing only for `authrev:` keys, then asserting the token works
again after restore, so the failure mode is proven not merely asserted.

Two test-design notes worth recording:

1. **The first draft was wrong and was rewritten.** It built fixtures through `POST /auth/register`
   and `/auth/login`, which are `@Throttle`d at 10 req/60s; ~26 such calls would have hit 429 mid-suite.
   Rewritten to the pattern already established in `authz-scoped-pep-rollout.e2e-spec.ts` and
   `business-claims.e2e-spec.ts`: INSERT users by SQL and mint tokens through the app's own
   `JwtService`/`TokenService` (so the Redis refresh index is populated exactly as in the real flow).
   Only `/auth/logout-all` and `/auth/refresh` are exercised over HTTP, neither of which is
   auth-throttled.
2. **One test documents a limitation rather than a success.** `is_active=false` by SQL **alone**
   (without calling the primitive) does **not** invalidate an access token, because the guard reads
   only the Redis epoch and never the database — which is the "no unnecessary DB lookup" requirement
   working as specified. The test asserts that 200, plus that `POST /auth/refresh` still 401s because
   `rotate()` checks `isActive`. It is an honest record of current behavior, not a passing grade.

A real bug in the suite's own `afterAll` was found and fixed during this phase:
`entity_id::text = ANY($1)` against a `uuid[]` raised `operator does not exist: text = uuid` and left
the suite reporting "failed to run" even though the test itself passed. `audit_logs.entity_id` is
`uuid`; the cast was removed.

## Phase 5 — validation

| Gate | Result |
|---|---|
| `tsc --noEmit` | clean |
| `eslint "src/**/*.ts" --max-warnings=0` | clean |
| New e2e file linted individually | clean |
| BE unit | **129 suites / 1527 tests** — all passing |
| BE e2e (`--runInBand`, live Postgres + Redis) | **29 suites / 263 tests** — all passing |
| `nest build` | clean |
| Monorepo `turbo run typecheck lint build` | **12/12 successful** |
| New migrations | **none** |
| `git diff --check` | clean |

## Phase 6 — documentation

- `docs/99-decisions/ADR-016-audit-log-model.md` — new "Tình trạng triển khai — H-1" section appended;
  prior content untouched. ADR-016 is the right home because §Bối cảnh (lines 12/16) names identity/
  privilege actions as its motivating gap; this milestone makes the already-audited role change
  actually take effect on live sessions. It states explicitly that H-1 adds **no** auth audit events
  (that is H-3, still open).
- `docs/delivery/state.yaml` — H-1 summary pushed to the top of the `current.task` comment chain; the
  Claim→Source→Verification Correction summary demoted verbatim beneath it.
- This report.

## Remaining intentional limitations

1. **No deactivate/ban endpoint** — `User.Ban` remains a seeded permission with no enforcement point.
   Any such future flow **must** call `revokeAllForUser()`.
2. **Out-of-band SQL deactivation is not enforced immediately** — it emits no revocation signal, so
   the token survives until TTL. Login and refresh are still blocked (both check `isActive`).
3. **No password-change/reset flow exists**, so that trigger has no call site either.
4. **≤1 second miss window** from `iat`'s second-level resolution (deliberate; see design).
5. **No cross-system atomicity** between the Postgres role mutation and the Redis epoch; failure is
   surfaced, not compensated.
6. **H-3 (auth audit events), H-4 (`/auth/refresh` throttle), H-5 (refresh reuse detection) remain
   open** — untouched by design.
7. **`POST /auth/logout-all` is not yet in `docs/api/openapi.yaml`.** The spec already documents ~136
   operations against 101 implemented routes (audit finding M-4); adding one route to that drift was
   judged out of scope for a hardening milestone whose brief listed ADR-016, the delivery report and
   `state.yaml` as the documentation targets. Recorded here so it is not lost.
