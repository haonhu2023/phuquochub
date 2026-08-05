# M0.3 — RESOURCE-SCOPED AUTHORIZATION: OWN-SCOPE HARDENING

**Date:** 2026-08-05
**Authority:** [ADR-019](../../99-decisions/ADR-019-resource-scoped-authorization.md) (Accepted), M0.1 (PDP Foundation), M0.2 (PEP + Resolvers + Managed Rollout)
**Status:** **COMPLETE**
**Repository:** `D:\Projects\PhuQuocHub` (branch `master`)

M0.3 closes the last gap ADR-019 itself named: the two-phase, fail-closed, resource-identity-aware evaluation M0.2 wired for `.Managed` permissions is now wired for `.Own` permissions too. All 3 live `.Own` handlers (D16 inventory) are decorated with `@AuthorizationContext({ resource: { from: 'principal' } }, PRINCIPAL_RESOLVER)`, `AuthorizationBootstrapValidator` (D9) now scans `.Managed` **and** `.Own`, the M0.2 staged exception for `.Own` is fully removed, and a red-then-green proof demonstrates the architectural gap this closes on live Postgres.

Per ADR-019 D15, this changes behavior only in the direction of *tightening*: no existing legitimate request that acted on its own resource is denied; the only paths this closes are ones ADR-019 itself flagged as unverified-by-construction, not unverified-by-luck.

## Own-handler inventory (verified by grep, before any code changed)

Grep for every `@RequirePermissions(...)` call site whose argument ends in `.Own` across `apps/api/src` (excluding spec/migration files, which are not live handlers):

| # | Controller | Route | Permission | `:id` param? | Resolver used |
|---|---|---|---|---|---|
| 1 | `MediaController.presign` | `POST /media/presign` | `Media.Upload.Own` | No | `PRINCIPAL_RESOLVER` |
| 2 | `MediaController.register` | `POST /media` | `Media.Upload.Own` | No | `PRINCIPAL_RESOLVER` |
| 3 | `UsersController.updateMe` | `PATCH /users/me` | `User.Edit.Own` | No | `PRINCIPAL_RESOLVER` |

No other live `.Own` permission exists in the codebase today — confirmed by exhaustive grep, not assumption. All 3 are principal-only routes (the acted-upon resource is always the caller themselves; none accepts a route `:id`), so all 3 use `{ from: 'principal' }` with the new `PRINCIPAL_RESOLVER` — no route required the "different owner identity" branch of Phase 5.

## Files added

| File | Purpose |
|---|---|
| `apps/api/src/modules/authz/resolvers/principal.resolver.ts` | `PRINCIPAL_RESOLVER` token + `PrincipalResolver` — zero-query resolver returning `{ resourceType: <from metadata>, resourceId: userId, businessId: null, ownerId: userId }`. Registered in `RbacModule` alongside `IDENTITY_PLACE_RESOLVER` (ADR-019 D5: "nằm sẵn trong authz module"). |
| `apps/api/src/modules/authz/resolvers/principal.resolver.spec.ts` | 4 unit tests. |
| `apps/api/test/authz-own-scope-hardening.e2e-spec.ts` | 8 tests against real Postgres — live-route coverage for all 3 handlers + the architectural-gap proof (temporary fixture endpoint + temporary bootstrap-failure fixture, both scoped to this test file only, never mounted on the real app). |

## Files modified

| File | Change |
|---|---|
| `apps/api/src/modules/authz/guards/permissions.guard.ts` | `needsContext` now `permission.endsWith('.Managed') \|\| permission.endsWith('.Own')` (was `.Managed`-only). Comment rewritten to describe M0.3 scope instead of the M0.2 staging rationale. |
| `apps/api/src/modules/authz/authorization.service.ts` | Comment-only: clarified that the no-`contextProvider` compatibility path is an invariant of `can()`/`canWithGrants()` itself (for *any* future caller that doesn't pass context), not a residual carve-out for `.Own` specifically — since `PermissionsGuard` now supplies context for `.Own` on every real request. No behavior change. |
| `apps/api/src/modules/authz/bootstrap/authorization-bootstrap.validator.ts` | `MANAGED_SUFFIX = '.Managed'` replaced with `SCOPED_SUFFIXES = ['.Managed', '.Own']`; the M0.2-staged Own exclusion is deleted. D9 now enforced for both suffixes, exactly per the ADR's unqualified text. |
| `apps/api/src/modules/rbac/rbac.module.ts` | Registers `PRINCIPAL_RESOLVER` (provider + export) alongside `IDENTITY_PLACE_RESOLVER`. |
| `apps/api/src/modules/users/users.controller.ts` | `@AuthorizationContext({ resourceType: 'user', resource: { from: 'principal' }, resolver: PRINCIPAL_RESOLVER })` on `PATCH /users/me`. |
| `apps/api/src/modules/media/media.controller.ts` | Same decorator (`resourceType: 'media'`) on `POST /media/presign` and `POST /media`. |
| `apps/api/src/modules/authz/guards/permissions.guard.spec.ts` | Replaced the M0.2 regression test (Own bypasses context) with M0.3 tests: Own without context now denies; Own with principal context invokes the resolver; matching/mismatched owner allow/deny; Own never satisfies Managed. |
| `apps/api/src/modules/authz/bootstrap/authorization-bootstrap.validator.spec.ts` | Replaced the "M0.2 excludes Own" test with two M0.3 tests: Own with valid context boots; Own without context throws. Multi-violation test extended to include an Own violation. |
| `apps/api/src/modules/authz/authorization.service.spec.ts` | Added `canWithGrants` cases for Own matching/mismatched owner, Own-not-satisfying-Managed, and Any short-circuiting an Own requirement. |

`authorization.util.ts`, `scoped-authorization.util.ts`, `scoped-grant.ts`, `request-scoped-grant-cache.ts` — **untouched**, zero lines changed (same as M0.1/M0.2). No service body was modified. `IdentityPlaceResolver`, `ContactAuthzResolver`, `PriceAuthzResolver`, and all 8 `.Managed` handler decorations from M0.2 — **untouched**.

## PRINCIPAL_RESOLVER behavior (ADR-019 D5/D15/D16)

```ts
export const PRINCIPAL_RESOLVER = Symbol('PRINCIPAL_RESOLVER');

@Injectable()
export class PrincipalResolver implements AuthorizationContextResolver {
  async resolve(input: AuthorizationContextResolverInput): Promise<AuthorizationContext | null> {
    return {
      resourceType: input.resourceType,
      resourceId: input.userId,
      businessId: null,
      ownerId: input.userId,
    };
  }
}
```

- Zero database queries — the caller's identity (already authenticated by `JwtAuthGuard`, carried as `input.userId`) *is* the answer; no lookup needed, mirroring `IdentityPlaceResolver`'s "the id already is the answer" shape for the Managed case.
- Never returns `null` — principal resolution cannot fail for an authenticated request (unlike `ContactAuthzResolver`/`PriceAuthzResolver`, which can miss).
- Side-effect-free, makes no policy decision — only identity resolution, per the `AuthorizationContextResolver` contract.
- Must be declared explicitly via `resolver: PRINCIPAL_RESOLVER` on every route that uses it — unlike `IDENTITY_PLACE_RESOLVER`, it is **not** the implicit default (the decorator's default only applies to the "id is the businessId" identity case, which principal routes are not).

## Guard flow (updated)

`PermissionsGuard.canActivate` is otherwise unchanged from M0.2 (D11 request-scoped grant memoization, D2 lazy context provider construction, `ModuleRef`-based resolver lookup, uniform 403). The one line that changed:

```ts
const needsContext = permission.endsWith('.Managed') || permission.endsWith('.Own');
```

Consequence: for the 3 real `.Own` handlers, every request now resolves a real `AuthorizationContext` (via `PRINCIPAL_RESOLVER`, zero queries) and runs it through `evaluateScopedAccess`/`matchesScopedContext` (D2/D6) — the same PDP core M0.1 built and unit-tested, now actually invoked for `.Own` for the first time. `matchesScopedContext`'s Own branch (`ctx.ownerId !== null && ctx.ownerId === userId`) was already correct and already unit-tested in M0.1 — M0.3 did not need to touch it; the gap was purely that the guard never routed `.Own` traffic through it.

## Bootstrap validation (D9, staged exception removed)

`AuthorizationBootstrapValidator` now filters `SCOPED_SUFFIXES = ['.Managed', '.Own']` instead of `.Managed` alone — every controller handler discovered via `DiscoveryService`/`MetadataScanner` whose required permission ends in either suffix must resolve valid `@AuthorizationContext` metadata (handler or class) and a registered resolver token, or startup fails with a message naming controller, handler, route, and permission. This applies D9 exactly as written (no milestone carve-out), closing the interpretation M0.2 explicitly staged and documented as temporary.

Grep-confirmed: zero live `.Managed` or `.Own` handler is missing `@AuthorizationContext` metadata (all 8 Managed handlers from M0.2 plus all 3 Own handlers from M0.3 — 11 total).

## Red-before / green-after evidence (live Postgres)

The 3 real `.Own` routes are principal-only (no `:id` param) — there is no HTTP-reachable way to make one of them act on another user's resource today, so there is no live exploit to reproduce on them directly. Per the task's guidance for this situation, the gap was proven architecturally, using two throwaway fixtures scoped to `test/authz-own-scope-hardening.e2e-spec.ts` only (never mounted on the real app):

1. **Forged/alternate owner identity** — a temporary controller (`PATCH /__m03-fixture-own/:id`) built in the exact shape ADR-019 D15 warns about verbatim ("route Own đầu tiên được xây kèm tham số `:id` tường minh"), using a resolver that reads `ownerId` from the route param instead of `PRINCIPAL_RESOLVER`. Proves `matchesScopedContext`'s Own check is actually reached and actually denies impersonation, independent of which specific resolver a future Own route uses.
2. **Bootstrap-validator omission** — a second temporary controller declaring `.Own` with no `@AuthorizationContext` at all, compiled into a real `Test.createTestingModule({ imports: [AppModule, ...] })` and booted with `app.init()` (the same mechanism `NestFactory.create` uses, not a mock).

Using `git stash push -- <9 tracked M0.3 files>` to temporarily revert only the tracked M0.3 source/spec changes (the 3 new files — `principal.resolver.ts`, its spec, and the e2e file itself — are untracked and unaffected), the same e2e file was run against the M0.2 baseline, then against the restored M0.3 code:

**RED (M0.2 baseline — `.Own` never received a context provider, D9 never scanned `.Own`):**

```
● acting on ANOTHER user's id -> 403
  Expected: 403
  Received: 200

● a .Own handler with NO @AuthorizationContext fails app.init()
  expect(received).rejects.toThrow()
  Received promise resolved instead of rejected
```

6/8 tests passed under the baseline — exactly the ones that don't touch the gap (both real-route happy paths for a member acting on their own resource, the no-grant-denied cases, and the wildcard-unaffected case). The 2 failures are exactly Finding-A-shaped: an attacker successfully "edited" another user's identity through the temporary `:id`-shaped route (200 instead of 403), and a misconfigured Own route silently booted instead of failing fast.

**GREEN (M0.3 restored via `git stash pop`):** 8/8 pass — forged ownership denied (403), missing-context Own handler fails `app.init()` with the correct identifying message, and both real-route/happy-path/no-grant/wildcard cases are unaffected.

`git stash list` confirmed empty after `pop`; `git status --short` matched the pre-stash state exactly.

## Live Docker validation

Beyond the e2e suite (which already runs the real `AppModule` against the real Docker Postgres container, not a mock), a separate standalone check reproduced the same bootstrap failure through the actual compiled entrypoint, not just `Test.createTestingModule`:

1. A temporary controller (`M03LiveCheckTempController`, `.Own` permission, no `@AuthorizationContext`) was added to `apps/api/src/modules/` and wired into `UsersModule.controllers` temporarily.
2. `npx nest build && node dist/main.js`, pointed at the live `docker compose` Postgres (`localhost:5432`, same credentials as `.env`), was run directly (no test framework involved).
3. Result: the process crashed immediately with

   ```
   Error: ADR-019 D9: bootstrap validation thất bại — 1 handler Managed/Own thiếu ngữ cảnh phân quyền hợp lệ:
     - M03LiveCheckTempController.act [/__m03-live-check-temp/:id] — permission "User.Edit.Own": thiếu @AuthorizationContext metadata (handler lẫn class)
   ```
4. Temporary controller file and the `UsersModule` wiring were deleted immediately after; `dist/` was removed.
5. Confirmed zero residue: `git status --short` matches the M0.3 change set exactly (no leftover temp files); a direct query against the live database (`SELECT count(*) FROM users WHERE email LIKE 'e2e_m03%' OR ...`) returned 0 orphaned e2e rows across both the main e2e run and this standalone check.

Live coverage of the 3 real `.Own` endpoints (`test/authz-own-scope-hardening.e2e-spec.ts`, real Postgres + real MinIO for the media round trip):

| Check | Result |
|---|---|
| Member updates own profile (`PATCH /users/me`) | 200, persisted to exactly that row |
| User with no grants (`PATCH /users/me`) | 403 |
| `super_administrator` wildcard (`PATCH /users/me`) | 200 — Any/wildcard fast path unaffected |
| Member presigns + PUTs to live MinIO + registers media | 201, `media.uploaded_by` = exactly the caller's id |
| User with no `Media.Upload.Own` grant (`POST /media/presign`) | 403 |

## Unit tests

| Suite | Count |
|---|---|
| `principal.resolver.spec.ts` (new) | 4 |
| `permissions.guard.spec.ts` (added/replaced M0.3 cases) | +5 net (1 replaced, 5 added) |
| `authorization-bootstrap.validator.spec.ts` (added/replaced M0.3 cases) | +2 net (1 replaced, 2 added) |
| `authorization.service.spec.ts` (added `canWithGrants` Own cases) | +3 |
| **New/updated total** | **14** |

Full backend unit suite: **113 suites / 1262 tests PASS** (all green both before and after the red-then-green stash cycle — confirmed identical file content post-`stash pop`).

## E2E / live validation

| Suite | Result |
|---|---|
| `authz-own-scope-hardening.e2e-spec.ts` (new, real Postgres + MinIO) | 8/8 PASS |
| Red-then-green stash cycle (same file, M0.2 baseline vs. M0.3) | RED 6/8, GREEN 8/8 — exactly as predicted |
| Live standalone bootstrap-failure check (compiled `dist/main.js`, temporary, deleted after) | Confirmed crash with correct identifying message |
| DB residue after all e2e + standalone runs | **Zero** — verified by direct query |

## Full regression (2026-08-05)

| Check | Result |
|---|---|
| Backend unit | **113 suites / 1262 tests PASS** |
| Backend e2e (all 23 suites, real Postgres + MinIO) | **23 suites / 198 tests PASS** |
| Backend typecheck | PASS |
| Backend lint | PASS, `--max-warnings=0` |
| Backend build | PASS |
| Monorepo build | **4/4 PASS** |
| Monorepo typecheck | **6/6 PASS** |
| Monorepo lint | **6/6 PASS** |
| `git diff --check` | clean |
| Secret scan | clean |
| `git status --short` | exactly the M0.3 change set (9 modified, 3 new), no residue |

## Limitations

- `PRINCIPAL_RESOLVER` covers the "resource is the caller" shape only — a future Own-scoped route where the resource is owned by someone *other* than the caller (e.g., an Own-scoped action on a draft created by a different user) needs a dedicated resolver, per the decorator contract's existing "different owner identity" branch (Phase 5). No such route exists today.
- As with M0.2's Managed rollout, the 403-vs-404 tradeoff (D10) applies identically to `.Own` now: a caller with only an Own grant gets a uniform 403 rather than 404 for any context-resolution failure, to avoid an existence oracle.
- This report does not add, and ADR-019 does not require, a database `CHECK` constraint (D6/D13 — deferred, unrelated to Own).

## ADR-019 completion status

With M0.3 complete, **all 3 milestones defined in ADR-019 D15 (M0.1, M0.2, M0.3) are now implemented**. D9 (bootstrap validation) is enforced for both `.Managed` and `.Own` with no milestone-scoped exceptions remaining — the M0.2 staging note is now historical (kept in this report and in ADR-019's Implementation Status section for the record, not deleted). No further milestone is defined under the ADR-019 "M0" umbrella; ADR-019 D15's own text describes M0.3 as able to "go independently" once M0.1/M0.2 ship, which it now has. The ADR's own reopening conditions (a new scope dimension, resource-scoped deny, cross-request permission caching) remain the only documented triggers for revisiting this design — none were touched here.

This report does not modify ADR-015.
