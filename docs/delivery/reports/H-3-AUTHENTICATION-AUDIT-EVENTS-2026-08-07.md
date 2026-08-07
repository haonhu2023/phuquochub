# H-3 — AUTHENTICATION AUDIT EVENTS

## Status

**Complete.** Closes finding **H-3** of the read-only Production Readiness Review (full-repository
audit, 2026-08-06 — never written to a file in this repository, same as noted in the H-1 report):

> "Auth currently emits no audit events, despite ADR-016 explicitly requiring identity/auth events."

This is the exact gap ADR-016 §Context names as its opening example: `user.registered`/
`auth.login.success` are listed alongside `place.status_changed`/`moderation.decided`/
`business.claim_approved` from the day ADR-016 was accepted (2026-07-13), but auth was the one
domain in that list that had never emitted a single `AuditService.record()` call.

Only authentication audit coverage was implemented. Not touched: H-4 (refresh throttle), H-5
(token-family reuse detection), a ban/deactivate endpoint, password reset/change, notifications, or
any new RBAC permission.

## Event codes

| Event | `result` | Emitted from | `entityId`/`actorId` |
|---|---|---|---|
| `user.registered` | success | `AuthService.register()` | new user's id (both) |
| `auth.login.success` | success | `AuthService.login()` | matched user's id (both) |
| `auth.login.failure` | failure | `AuthService.login()` (3 branches) | `entityId` = matched user's id or `null`; `actorId` always `null` |
| `auth.refresh.success` | success | `AuthService.refresh()` | `tokens.userId` (both) |
| `auth.refresh.failure` | failure | `AuthService.refresh()` | from `RefreshTokenError.userId` when derivable, else `null` (both) |
| `auth.logout` | success | `AuthService.logout()` | authenticated principal's `sub` (both) |
| `auth.logout_all` | success | `AuthService.logoutAll()`, only after both H-1 revocation steps succeed | `userId` param (both) |

## Files changed

**Product code:**
- `apps/api/src/modules/auth/token.service.ts` — new `RefreshTokenError` (still `UnauthorizedException`, 401 unchanged) carrying `reason: 'invalid_token' | 'revoked' | 'user_inactive'` and `userId` (only ever set from a signature-verified payload); `IssuedTokens` gained a `userId` field.
- `apps/api/src/modules/auth/auth.service.ts` — injects `AuditService`; every method emits through a single `emitAudit()` helper; new `auditLoginFailure()` and `normalizeEmailForAudit()`.
- `apps/api/src/modules/auth/auth.controller.ts` — `logout()` now threads the authenticated `user.sub` through as `actorId` (was previously fetched but discarded).

**Tests:**
- `apps/api/src/modules/auth/token.service.spec.ts` — `RefreshTokenError` reason/userId per failure branch; `issueTokens`'s full-shape assertion updated.
- `apps/api/src/modules/auth/auth.service.spec.ts` — one `describe` block per required scenario, plus a `describe('H-3 — audit không đổi hành vi response')` block for rules 1 and 6.
- `apps/api/test/auth-audit.e2e-spec.ts` (new) — all 7 events proven against live Postgres via real HTTP, including two tests that inject a genuine failure into the running app's own `AuditService` instance.

**Docs:** `docs/api/openapi.yaml` (`POST /auth/logout-all`), `docs/99-decisions/ADR-016-audit-log-model.md`, `docs/delivery/state.yaml`, this report.

## Audit payload / privacy behavior

**Rule 1 — nothing sensitive ever enters an `AuditEvent`.** No context object built in `auth.service.ts` ever includes a password, access token, refresh token, JWT payload, or Redis key. This was verified two ways, not just asserted: unit tests JSON-stringify the actual `audit.record` call arguments and assert the real password/token values used in that test are absent; the e2e file does the same across `before`/`after`/`context` for every event, using the real tokens/passwords the test itself generated. `AuditService.redact()` (pre-existing, unchanged) is a second line of defense — but the point being proven here is that these fields are never put in front of it in the first place.

**Rule 2 — login failures don't leak account existence externally, while remaining internally useful.** `login()`'s "user not found" and "wrong password" branches already threw the identical `UnauthorizedException` with the identical message before this milestone — unchanged. What's new is that both paths now also call `auditLoginFailure()`, which records a normalized email (trim + lowercase — not a hash; `AuditService` has no other "privacy-safe identifier" transform to use) and a `reason` (`user_not_found` / `invalid_password` / `account_inactive`) in `context`, readable only through `System.Audit.View`, not the API response. `entityId` is set to the real user's id when the email matched an account (even on wrong password) and `null` when it didn't — this distinction is investigatively useful and doesn't affect the client-visible response, which is what rule 2 actually constrains. A dedicated test captures both responses and asserts `status`, `error.code`, and `error.message` are identical between the "unknown email" and "bad password" cases.

## Success-path behavior (rule 4)

Every success event is emitted only after the underlying operation has fully completed: `register()` audits after the user row, role grant, *and* token issuance all succeeded; `login()` after token issuance; `refresh()` after `rotate()` returns; `logout()` after `revoke()` (which is unconditionally successful/idempotent by its own existing contract); `logoutAll()` **only** after both H-1 revocation steps succeed — if either throws, `logoutAll()` propagates the error and emits nothing, because claiming success at that point would be false. A unit test (`register: email trùng`) confirms the inverse: no audit call happens when the operation never got that far.

## Failure-path behavior (rule 5)

`login()`'s three failure branches and `refresh()`'s catch block call `emitAudit()` and then throw (or rethrow) the **same, unmodified** exception. For `refresh()` specifically, the caught error is rethrown by reference (`throw err`), so it is provably the identical object the caller receives — not a reconstruction that could subtly diverge. `RefreshTokenError` extends `UnauthorizedException` rather than introducing a new exception hierarchy, so `AllExceptionsFilter` (which only needs `instanceof HttpException` + `getStatus()`/`getResponse()`) maps it to 401 with the same body shape it always produced; this was confirmed by reading the filter, not assumed.

## Unit tests

**129 suites / 1547 tests** (from 129/1527 — **+20 tests**, no new suite files; both existing auth spec files extended).

Notable coverage beyond the required list:
- `RefreshTokenError.userId` is asserted `null` specifically for the "signature/format broken" branch, and non-null for "revoked" and "user_inactive" — pinning the "never trust an unverified payload" rule at the type level, not just in a comment.
- Two tests prove `emitAudit()`'s swallow behavior end-to-end: audit configured to reject, then asserting the *login response itself* is unaffected (success case) and the *thrown exception* is unaffected (failure case) — not just that the promise didn't reject.
- A combined register+login test scans every recorded `audit.record` call for the literal plaintext password used in that same test.

## E2E / live validation

**New `auth-audit.e2e-spec.ts`: 11/11 passing** against live Postgres, all via real HTTP through the full Nest stack (guards, pipes, interceptors, filter).

`/auth/register` and `/auth/login` are throttled at 10 req/60s (separate buckets, confirmed from the H-1 file's own established pattern and reused here) — this file makes a small, bounded number of real calls to those two routes (well under the limit) specifically to prove the event codes are written end-to-end from HTTP entry to database row, and uses the SQL-insert + `TokenService`-mint pattern for refresh/logout/logout-all, which are not throttled.

Two tests go further than the unit level can: they call `app.get(AuditService)` on the **running** application and `jest.spyOn(...).mockRejectedValueOnce(...)` on its real `record()` method for exactly one call, then drive a real HTTP login through the full stack. This proves rules 5/6 against the actual DI-wired service, not a test double standing in for it — mirroring the technique the H-1 e2e suite used to prove fail-closed behavior against a live Redis client.

Zero residue: all fixtures tracked by real id/email pattern and deleted in `afterAll`; confirmed via direct SQL after the full e2e run (`e2e_h3_*` users: 0, matching audit rows: 0).

**One pre-existing flake observed, unrelated to this change.** A full-suite run failed once on `media-orphan-cleanup.e2e-spec.ts` (`sampleCandidates` not containing a just-seeded row) — a file this milestone never touches. Re-running that file alone passed 10/10, and re-running the entire e2e suite passed 30/30 (274/274) immediately after. Given zero file overlap and a clean pass both in isolation and on immediate re-run, this reads as a pre-existing order/timing sensitivity in that file, not a regression introduced here. Not investigated further — out of scope for an auth-only milestone — but recorded rather than silently ignored.

## Full regression

| Gate | Result |
|---|---|
| Focused auth unit (`src/modules/auth`, `src/modules/authz`) | 12 suites / 147 tests — pass |
| Focused auth e2e (`auth`, `auth-audit`, `auth-token-revocation`, `authz-*`) | 7 suites / 57 tests — pass |
| BE unit (full) | **129 suites / 1547 tests** — pass |
| BE e2e (full, `--runInBand`) | **30 suites / 274 tests** — pass (on the clean run; see flake note above) |
| `tsc --noEmit` | clean |
| `eslint "src/**/*.ts" --max-warnings=0` | clean |
| New e2e file linted individually | clean |
| `nest build` | clean |
| Monorepo `turbo run typecheck lint build` | **12/12** |
| `git diff --check` | clean |
| Secret scan over the diff | no findings |
| New migrations | **none** |
| DB residue after full e2e run | zero (`e2e_h3_%` users: 0, matching audit rows: 0) |

## OpenAPI `logout-all` update

`docs/api/openapi.yaml` gained `POST /auth/logout-all` (`operationId: authLogoutAll`), matching the route's actual behavior: authenticated (no `security: []` override, unlike the public auth routes), no request body, `200`/`401`/`503` — the `503` documents the real `ServiceUnavailableException` `AuthRevocationService.revokeAllForUser()` throws on a Redis failure (H-1 behavior, now finally reflected in the spec). Validated by parsing the file and reading back the new path's response keys and `operationId`.

Scope discipline: the pre-existing `/auth/logout` block was deliberately **not** touched (it's missing a `401` it arguably should have), because that's exactly the kind of general drift M-4 already tracks and this milestone was told not to touch it.

## Remaining H-4/H-5 work

Untouched by design, as instructed:

- **H-4** — `POST /auth/refresh` still has no auth-specific throttle; it falls under the global 100 req/60s limit like every other unthrottled route.
- **H-5** — no refresh-token family/lineage tracking or reuse detection exists. A stolen-and-replayed refresh token is still only caught reactively (the second use fails with `reason=revoked`, now at least audited) rather than triggering a family-wide revocation.
- No `User.Ban`/deactivate endpoint and no password reset/change flow exist, so `auth.login.failure`'s `account_inactive` reason and any future password-change audit trigger remain reachable only via out-of-band SQL, exactly as recorded in the H-1 section of ADR-016.
- `AuditEvent.ip`/`.userAgent` remain unpopulated everywhere in the repository, not just in Auth — pre-existing, out of scope.
