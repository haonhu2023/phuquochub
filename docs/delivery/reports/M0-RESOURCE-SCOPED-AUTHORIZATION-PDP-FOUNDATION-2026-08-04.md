# M0.1 — RESOURCE-SCOPED AUTHORIZATION: PDP FOUNDATION

**Date:** 2026-08-04
**Authority:** [ADR-019](../../99-decisions/ADR-019-resource-scoped-authorization.md) (Accepted), [ADR-007](../../99-decisions/ADR-007-rbac-model.md) Addendum
**Status:** **COMPLETE — dark ship**
**Repository:** `D:\Projects\PhuQuocHub` (branch `master`)

M0.1 delivers the PDP-side foundation for resource-scoped authorization: the `AuthorizationContext`/resolver contracts, the one-query `ScopedGrant` recursive CTE, an `AuthorizationService` extension that can evaluate `Managed`/`Own` grants against a real resource identity, and a request-scoped memoization primitive — all **shipped dark**. No guard, controller, or service call site was changed to actually supply a resource context. Every existing route's permission decision is unchanged, verified against the full backend test suite and a live Docker stack, not assumed.

---

## Scope discipline

Explicitly **not** built in M0.1, per ADR-019 D15 and this milestone's own authority:

- `PermissionsGuard` changes, the `@AuthorizationContext` decorator implementation, or any bootstrap route validation (D9) — all M0.2.
- Any concrete resolver (`IDENTITY_PLACE_RESOLVER`, `PRINCIPAL_RESOLVER`, or feature-module resolvers for Places/Contacts/Prices) — M0.2. Only the resolver *interface* (D5) exists; no implementation, no DI token, no consumer.
- `Own`-scope enforcement rollout — explicitly M0.3.
- Any migration — none needed; `user_roles.business_id`/`scope_type`, `role_parents`, `role_permissions` already carry everything this milestone requires (ADR-019 D13).
- Any ADR-015 code.

## A regression caught and fixed during implementation (worth recording precisely)

The first implementation made `AuthorizationService.can()`'s two-argument form (no context) route through the new two-phase, fail-closed evaluation unconditionally. Because nobody currently holds a `Managed`-scope grant, this was a safe no-op for `Managed` — but **`Own`-scope grants are genuinely live today**: `Media.Upload.Own` (granted to `member`, gating `POST /media/presign` and `POST /media`) and `User.Edit.Own` (`PATCH /users/me`) are real, working checks that pass today via pure rank comparison, with no resource identity involved at all (by structural convention — these routes never take an arbitrary `:id`).

Running the full e2e suite caught this immediately: 20 real test failures across `media.e2e-spec.ts`, `review-media-auto-publish.e2e-spec.ts`, and `media-orphan-cleanup.e2e-spec.ts` — every one of them exercising `Media.Upload.Own`. This is exactly the class of regression M0.1's "dark ship, zero behavior change" guarantee exists to prevent.

**Fix:** `can()` without a `contextProvider` now reproduces the pre-ADR-019 rank-only decision (`isAllowed`, from the untouched `authorization.util.ts`) for **every** permission — `Managed` and `Own` alike — not just scope-less/Any ones. The new two-phase, fail-closed evaluation (`evaluateScopedAccess`) activates **only** when a caller explicitly supplies a `contextProvider`. No real caller does that in M0.1; M0.2's guard and D14's service-layer escape hatch will be the first ones to, and at that point `Own`-scope enforcement is a **deliberate M0.3 decision**, not a side effect of this milestone. This is recorded here rather than silently fixed, since it's a genuine example of an instruction ("must not accidentally allow a Managed/Own grant without context") conflicting with the higher-priority, repeatedly-stated constraint ("no existing permission decision may change") — resolved in favor of the latter, with the reasoning kept in the code (`authorization.service.ts`'s file-level comment) and here.

## Files added

| File | Purpose |
|---|---|
| `apps/api/src/modules/authz/authorization-context.ts` | ADR-019 D3/D4/D5 pure contracts: `AuthorizationContext`, `AuthorizationContextProvider`, `AuthorizationContextResolverInput`, `AuthorizationContextResolver`, `AUTHZ_CONTEXT_KEY`. No decorator function, no resolver implementation. |
| `apps/api/src/modules/authz/scoped-grant.ts` | `ScopedGrant` interface (D12). |
| `apps/api/src/modules/authz/scoped-authorization.util.ts` | Pure logic: `grantScopeOf`, `matchesScopedContext`, `evaluateScopedAccess` — the two-phase algorithm (D2) and decision matrix (D6). Reuses `grantSatisfies` from `authorization.util.ts` unmodified. |
| `apps/api/src/modules/authz/scoped-authorization.util.spec.ts` | 27 unit tests. |
| `apps/api/src/modules/authz/request-scoped-grant-cache.ts` | `RequestScopedGrantCache` — the D11 memoization foundation. Not wired into any guard/service yet. |
| `apps/api/src/modules/authz/request-scoped-grant-cache.spec.ts` | 9 unit tests. |
| `apps/api/src/modules/rbac/repositories/user-roles.repository.spec.ts` | 8 unit tests for `getScopedGrants` (first-ever spec file for this repository). |
| `apps/api/test/authz-scoped-grants.e2e-spec.ts` | 5 tests against real Postgres — the focused integration proof the recursive CTE's diamond-DAG termination needs. |

## Files modified

| File | Change |
|---|---|
| `apps/api/src/modules/rbac/repositories/user-roles.repository.ts` | Added `getScopedGrants(userId)` — the D12 recursive CTE. |
| `apps/api/src/modules/authz/authorization.service.ts` | Constructor simplified to a single `UserRolesRepository` dependency (`RolesRepository` no longer needed — its `expandWithAncestors`/`getPermissionsForRoles` remain in place, untouched, simply no longer called from here). `getEffectivePermissions()` reimplemented on `getScopedGrants()`. `can()` gains an optional `contextProvider` parameter and the compatibility-path fix described above. |
| `apps/api/src/modules/authz/authorization.service.spec.ts` | Updated to mock `UserRolesRepository.getScopedGrants` instead of the retired 3-call chain; added scoped-context test cases. |

`authorization.util.ts` (`grantSatisfies`/`isAllowed`) — **untouched**, zero lines changed, per ADR-019 D6.

## `ScopedGrant` query (ADR-019 D12)

One recursive CTE replaces the old 3-query chain (`findActiveRoleIds` → `expandWithAncestors` → `getPermissionsForRoles`), which discarded `scope_type`/`business_id` at the very first step:

- `seed`: anchors on every active (`revoked_at IS NULL`) `user_roles` row for the user — uses the existing `idx_user_roles_user` index, no new index required.
- `expanded`: walks `role_parents` with `UNION` (not `UNION ALL`) — the same cycle/diamond-safe pattern already proven in `RolesRepository.expandWithAncestors`, extended to carry the **originating** `user_role_id`/`scope_type`/`business_id` through every step of the DAG walk, so an inherited permission never loses track of which scoped grant it came from.
- Joins `role_permissions`/`permissions`, orders deterministically, and is deduplicated twice: once in SQL (`SELECT DISTINCT`, needed for correct recursion termination) and once in application code (`ScopedGrant`'s final shape drops `user_role_id`, so two different origin rows producing an identical effective grant collapse into one entry).

**Proven against real Postgres, not just mocks** (`authz-scoped-grants.e2e-spec.ts`): the diamond case reuses the **actual seeded** role graph (`moderator` → `{contributor, local_guide}` → `member`) rather than inventing new roles — confirmed `Business.Claim` (granted to `member`) resolves to exactly one entry for the `moderator` assignment despite two DAG paths reaching it. Also proven live: two `user_roles` rows scoped to two different `business_id`s retain two separate `ScopedGrant` entries; a revoked role contributes nothing; results are deterministic across repeated calls.

## `AuthorizationService` behavior

- `can(userId, permission, contextProvider?)`:
  - **No `contextProvider`** (every real caller today — `PermissionsGuard`, `ModerationService.decide()`): rank-only matching via `isAllowed`, identical to pre-ADR-019 behavior for every permission type.
  - **`contextProvider` supplied** (no real caller yet): two-phase evaluation (`evaluateScopedAccess`) — `Any`/wildcard/scope-less grants short-circuit without ever invoking the provider (lazy, per D2); `Managed`/`Own` grants are matched against the resolved `AuthorizationContext`'s `businessId`/`ownerId`; a `Managed` grant with `businessId = null` cannot degrade into a blanket allow; explicit `deny` still wins unconditionally, context-free.
- `getEffectivePermissions(userId)`: same public shape (`{allow, deny}`), reimplemented on `getScopedGrants()`.

## Compatibility guarantees

- Zero behavior change for every currently-issued permission check — proven by the full backend unit suite (106/106 suites, 1203/1203 tests) and the full e2e suite (21/21 suites, 177/177 tests) passing unmodified against this code, including the three suites that specifically exercise `Media.Upload.Own`.
- `authorization.util.ts` untouched.
- `RolesRepository.expandWithAncestors`/`getPermissionsForRoles` untouched and still independently tested by their own (pre-existing) callers/paths — simply no longer invoked from `AuthorizationService`.
- `ModerationService.decide()` — the one existing service-layer authorization call outside the guard — passes scope-less permissions (`Media.Moderate`/`Review.Moderate`) and is provably unaffected (its own spec suite, 205 tests, unchanged and passing).

## Request-scoped memoization contract (ADR-019 D11)

`RequestScopedGrantCache` — a plain class, no Nest DI scope annotation, no module-level or static state. Constructed with a loader function; `.load(userId)` memoizes **per instance**. The lifecycle contract ("one instance per request") is the caller's responsibility to uphold — that wiring is M0.2's job (likely a `Scope.REQUEST` provider or per-request instantiation in the guard). Proven in isolation (9 tests): concurrent `load()` calls share the exact same in-flight `Promise` object; two separate instances (simulating two requests) never share state; a rejected load is evicted from that instance's cache so a later call in the same request can retry rather than being permanently poisoned — a failure never becomes a global cache entry, since there is no global cache to poison in the first place.

## Tests

| Suite | Count |
|---|---|
| `scoped-authorization.util.spec.ts` | 27 |
| `user-roles.repository.spec.ts` | 8 |
| `authorization.service.spec.ts` (updated) | 9 |
| `request-scoped-grant-cache.spec.ts` | 9 |
| `authz-scoped-grants.e2e-spec.ts` (real Postgres) | 5 |
| **New/updated total** | **58** |

## Full regression (2026-08-04)

| Check | Result |
|---|---|
| Backend unit | **106 suites / 1203 tests PASS** |
| Backend e2e (all 21 suites, real Postgres) | **21 suites / 177 tests PASS** — including the 3 suites that caught the Own-scope regression, now green |
| Backend typecheck | PASS |
| Backend lint | PASS, `--max-warnings=0` |
| Backend build | PASS |
| Monorepo build | **4/4 PASS** |
| Monorepo typecheck | **6/6 PASS** |
| Monorepo lint | **6/6 PASS** |
| `git diff --check` | clean |
| Secret scan | clean |

## Zero live behavior change — how this was actually verified, not just asserted

1. Full backend unit suite run before and after every change.
2. Full backend e2e suite run against the real Docker stack (Postgres/Redis/MinIO) — this is what caught the Own-scope regression in the first place, and confirms its fix.
3. No route, controller, guard, or module wiring file was touched. `grep` confirms zero references to `AuthorizationContext`/`ScopedGrant`/`getScopedGrants` outside the `authz`/`rbac` modules and their own tests.

## Remaining work for M0.2 (NOT started)

- `@AuthorizationContext` decorator implementation and `AUTHZ_CONTEXT_KEY` metadata reading in `PermissionsGuard`.
- Concrete resolvers: `IDENTITY_PLACE_RESOLVER` (zero-query, route param *is* the business id), `CONTACT_AUTHZ_RESOLVER`, `PRICE_AUTHZ_RESOLVER`, plus `PRINCIPAL_RESOLVER` for the future M0.3 work.
- Bootstrap-time validation (D9) — scan every controller handler, fail startup on a `.Managed`/`.Own` permission with no resolvable context metadata.
- Wiring `RequestScopedGrantCache` into the actual request lifecycle (likely via `Scope.REQUEST` or per-request instantiation in the guard).
- Decorating all 8 verified `Managed` handlers (ADR-019 D16) with `@AuthorizationContext`.
- Live, red-then-green e2e proof that a `Managed` grant scoped to place A cannot act on place B — this is where the actual security gap closes; M0.1 only builds the machinery.

M0.2 (and M0.1, now complete) must land before ADR-015 M3 grants any real `business_owner`/`business_manager` role.
