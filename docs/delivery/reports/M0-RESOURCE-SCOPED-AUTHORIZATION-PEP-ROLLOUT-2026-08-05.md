# M0.2 — RESOURCE-SCOPED AUTHORIZATION: PEP + RESOLVERS + ROLLOUT

**Date:** 2026-08-05
**Authority:** [ADR-019](../../99-decisions/ADR-019-resource-scoped-authorization.md) (Accepted), current M0.1 implementation, ADR-007 addendum
**Status:** **COMPLETE**
**Repository:** `D:\Projects\PhuQuocHub` (branch `master`)

M0.2 closes the actual security gap that M0.1 built the machinery for: `PermissionsGuard` now resolves a real resource identity for every `.Managed`-scoped permission check and denies cross-business access. All 8 verified live `Managed` handlers (ADR-019 D16) are decorated, request-scoped grant memoization is wired into the real request lifecycle, bootstrap-time validation fails the app before it can serve a misconfigured route, and a red-then-green e2e proof demonstrates the vulnerability closing on live Postgres.

---

## D9 vs M0.3 staging — the contradiction, and how it was resolved

ADR-019 D9 (Owner D2, mandatory) states bootstrap validation must fail startup for **any** handler whose permission scope is `Managed` **or** `Own` lacking valid `@AuthorizationContext` metadata — its text carries no milestone carve-out. But M0.2's own scope explicitly excludes Own-scope rollout (that's M0.3), and the live `.Own` routes today (`Media.Upload.Own` gating `POST /media/presign`/`POST /media`, `User.Edit.Own` gating `PATCH /users/me`) have no such metadata and are safe only by structural convention (no arbitrary `:id` param) — exactly as ADR-019 D15 describes M0.3's job to be. Applying D9 literally would make the application fail to boot the instant M0.2 ships, directly contradicting the requirement that existing Own routes must not break.

This was surfaced to the owner before any bootstrap-validation code was written (not resolved silently). **Decision: `AuthorizationBootstrapValidator` enforces D9 for M0.2 scoped strictly to permissions with the `.Managed` suffix.** Permissions with `.Own`, `.Any`, or no scope suffix are explicitly exempted from this bootstrap check until M0.3 implements Own-scope context resolution. This is recorded here and in ADR-019's Implementation Status section as a **scoped interpretation of D9**, not as if ADR-019 originally said "Managed-only" without qualification — the ADR text is unchanged (per the standing rule that implementation-status notes never rewrite D1–D16/Owner decisions).

The same Managed-only scoping was independently required at **request time** too (see "Regression caught and fixed" below) — for the same underlying reason.

## Files added

| File | Purpose |
|---|---|
| `apps/api/src/modules/authz/decorators/authorization-context.decorator.ts` | `AuthzResourceSource`, `AuthorizationContextOptions`, `@AuthorizationContext(...)` (D4). Reuses `AUTHZ_CONTEXT_KEY` already declared in M0.1's `authorization-context.ts`. |
| `apps/api/src/modules/authz/decorators/authorization-context.decorator.spec.ts` | 5 unit tests. |
| `apps/api/src/modules/authz/resolvers/identity-place.resolver.ts` | `IDENTITY_PLACE_RESOLVER` token + `IdentityPlaceResolver` — zero-query identity resolver, registered in `RbacModule`. |
| `apps/api/src/modules/authz/resolvers/identity-place.resolver.spec.ts` | 3 unit tests. |
| `apps/api/src/modules/contacts/resolvers/contact-authz.resolver.ts` | `CONTACT_AUTHZ_RESOLVER` token + `ContactAuthzResolver` — contact id → owning place id (`owner_type='place'`), registered in `ContactsModule`. |
| `apps/api/src/modules/contacts/resolvers/contact-authz.resolver.spec.ts` | 4 unit tests. |
| `apps/api/src/modules/prices/resolvers/price-authz.resolver.ts` | `PRICE_AUTHZ_RESOLVER` token + `PriceAuthzResolver` — price id → owning place id (`entity_type='place'`), registered in `PricesModule`. |
| `apps/api/src/modules/prices/resolvers/price-authz.resolver.spec.ts` | 4 unit tests. |
| `apps/api/src/modules/authz/bootstrap/authorization-bootstrap.validator.ts` | `AuthorizationBootstrapValidator` (D9, Managed-only per above) — scans every controller via `DiscoveryService`/`MetadataScanner` at `onApplicationBootstrap()`. |
| `apps/api/src/modules/authz/bootstrap/authorization-bootstrap.validator.spec.ts` | 8 unit tests. |
| `apps/api/src/modules/authz/guards/permissions.guard.spec.ts` | 16 unit tests (first-ever spec for this guard). |
| `apps/api/test/authz-scoped-pep-rollout.e2e-spec.ts` | 13 tests against real Postgres — the full cross-business authorization matrix across all 8 handlers. |

## Files modified

| File | Change |
|---|---|
| `apps/api/src/modules/authz/authorization.service.ts` | Added `canWithGrants(grants, userId, permission, contextProvider?)` — the same decision logic as `can()`, parameterized on externally-loaded grants so the guard can load `ScopedGrant[]` once per request and reuse it across every `@RequirePermissions(...)` entry (D11). `can()` now delegates to it after fetching grants; its signature and behavior are unchanged. |
| `apps/api/src/modules/authz/authorization.service.spec.ts` | Added 4 tests for `canWithGrants`. |
| `apps/api/src/modules/authz/guards/permissions.guard.ts` | Full PEP rewrite: request-scoped `RequestScopedGrantCache` instance per `canActivate` call, lazy context-provider construction, `ModuleRef`-based resolver lookup, uniform 403 on every failure branch. |
| `apps/api/src/modules/rbac/rbac.module.ts` | Registers `IDENTITY_PLACE_RESOLVER` (shared, zero-query) and `AuthorizationBootstrapValidator`; imports `DiscoveryModule`. |
| `apps/api/src/modules/contacts/contacts.module.ts` | Registers `CONTACT_AUTHZ_RESOLVER`. |
| `apps/api/src/modules/prices/prices.module.ts` | Registers `PRICE_AUTHZ_RESOLVER`. |
| `apps/api/src/modules/places/places.controller.ts` | `@AuthorizationContext` on `PATCH /places/:id` (identity resolver). |
| `apps/api/src/modules/hotels/hotels.controller.ts` | `@AuthorizationContext` on `PATCH /hotels/:id/rooms` (identity resolver). |
| `apps/api/src/modules/restaurants/restaurants.controller.ts` | `@AuthorizationContext` on `PATCH /restaurants/:id/menu` (identity resolver). |
| `apps/api/src/modules/contacts/contacts.controller.ts` | `@AuthorizationContext` on `POST /places/:id/contacts` (identity), `PATCH`/`DELETE /contacts/:id` (contact resolver). Stale comment ("hiện guard mức permission") replaced. |
| `apps/api/src/modules/prices/prices.controller.ts` | `@AuthorizationContext` on `POST /places/:id/prices` (identity), `PATCH /prices/:id` (price resolver). |

`authorization.util.ts`, `scoped-authorization.util.ts`, `scoped-grant.ts`, `request-scoped-grant-cache.ts` — **untouched**, zero lines changed. No service body was modified (all 5 service files — `PlacesService`, `HotelsService`, `RestaurantsService`, `ContactsService`, `PricesService` — remain exactly as M0.1 left them).

## Decorator API (ADR-019 D4)

```ts
export type AuthzResourceSource =
  | { readonly from: 'param'; readonly name: string }
  | { readonly from: 'principal' };

export interface AuthorizationContextOptions {
  readonly resourceType: string;
  readonly resource: AuthzResourceSource;
  readonly resolver?: symbol; // omitted => IDENTITY_PLACE_RESOLVER
}

export const AuthorizationContext: (opts: AuthorizationContextOptions) => MethodDecorator & ClassDecorator;
```

Implemented as `SetMetadata(AUTHZ_CONTEXT_KEY, opts)` — identical mechanism to `RequirePermissions`, so it inherits the exact same `reflector.getAllAndOverride` merge semantics (handler overrides class). No role names, no policy logic — pure metadata declaration.

## Resolver behavior

- **`IdentityPlaceResolver`** — zero database queries; returns `{ resourceType, resourceId, businessId: resourceId, ownerId: null }` unconditionally (identity route params *are* the place id, per ADR-015 Model A). Used implicitly whenever `@AuthorizationContext` omits `resolver`.
- **`ContactAuthzResolver`** — one indexed `ContactsRepository.findById` lookup. Returns `null` (→ guard deny) when the contact doesn't exist, is soft-deleted (`findById` already filters `deletedAt IS NULL`), or `owner_type !== 'place'`. Pure, no side effects, no policy decision — only identity resolution.
- **`PriceAuthzResolver`** — same shape against `PricesRepository.findById`/`entity_type`.

## Guard flow (`PermissionsGuard`)

1. Read `@RequirePermissions` metadata; scope-less → pass immediately (unchanged).
2. Build a `RequestScopedGrantCache` **local to this `canActivate` call** — since Nest invokes `canActivate` exactly once per request, a local variable *is* request-scoped without needing a `Scope.REQUEST` provider. Load `ScopedGrant[]` once via it.
3. Build one lazy context-provider closure (memoized per resolver-token/resourceType/resourceId key in a local `Map`) — constructing it costs nothing; it is only *invoked* by `evaluateScopedAccess` on the "slow path" (D2 step 5).
4. For each required permission: **only `.Managed`-suffixed permissions receive the context provider.** `.Own`/`.Any`/scope-less permissions call `canWithGrants` with no provider — the exact pre-ADR-019 rank-only path.
5. Context resolution (only reached for `.Managed` permissions without a context-free grant): read `@AuthorizationContext` metadata → extract resource id from the declared param → resolve resolver token via `ModuleRef.get(token, { strict: false })` (default `IDENTITY_PLACE_RESOLVER` when `resolver` is omitted) → invoke `.resolve(...)`.
6. Uniform deny (same `Thiếu quyền: ${permission}` 403, D10) on: missing metadata, missing route param, unregistered resolver token, resolver returning `null`, resolver throwing, or businessId mismatch (the last one via the untouched `matchesScopedContext` in `scoped-authorization.util.ts`). Every guard-level failure branch also logs via `Logger.error` (`ghi log lỗi`, D8 INV-A2/A5) — a concern kept at the PEP layer, not inside the PDP core.

## Bootstrap validation (D9, Managed-only per the resolved staging contradiction)

`AuthorizationBootstrapValidator` runs at `onApplicationBootstrap()` — after all modules initialize, before `app.listen()`. It uses `DiscoveryService`/`MetadataScanner` to enumerate every controller handler, filters to permissions ending in `.Managed`, and for each such handler requires: (a) resolvable `@AuthorizationContext` metadata (handler or class), and (b) the declared (or default identity) resolver token actually registers via `ModuleRef.get(token, { strict: false })`. Any violation aggregates into one thrown `Error` naming controller, handler, route (best-effort via `PATH_METADATA`), and violated permission — startup never completes. `.Own`/`.Any`/scope-less permissions are explicitly out of this validator's scope (see the D9/M0.3 section above). Request-time INV-A1 in the guard remains as defense in depth.

## Request-scoped memoization (D11)

`RequestScopedGrantCache` (already built and unit-tested in M0.1) is now actually consumed: a fresh instance per `canActivate` call, `.load(userId)` called once regardless of how many permissions `@RequirePermissions` lists, and the context-resolution `Map` similarly scoped to that single call. Two separate requests never share either cache (proven: `permissions.guard.spec.ts`, "hai lệnh gọi canActivate riêng biệt... KHÔNG chia sẻ cache"). No cross-request cache, no TTL, no Redis — exactly per D11's prohibitions.

## All 8 handler rollout (ADR-019 D16)

| # | Route | Permission | Resolver |
|---|---|---|---|
| 1 | `PATCH /places/:id` | `Place.Edit.Managed` | `IDENTITY_PLACE_RESOLVER` |
| 2 | `PATCH /hotels/:id/rooms` | `Place.Edit.Managed` | `IDENTITY_PLACE_RESOLVER` |
| 3 | `PATCH /restaurants/:id/menu` | `Place.Edit.Managed` | `IDENTITY_PLACE_RESOLVER` |
| 4 | `POST /places/:id/contacts` | `Contact.Edit.Managed` | `IDENTITY_PLACE_RESOLVER` |
| 5 | `PATCH /contacts/:id` | `Contact.Edit.Managed` | `CONTACT_AUTHZ_RESOLVER` |
| 6 | `DELETE /contacts/:id` | `Contact.Edit.Managed` | `CONTACT_AUTHZ_RESOLVER` |
| 7 | `POST /places/:id/prices` | `Price.Edit.Managed` | `IDENTITY_PLACE_RESOLVER` |
| 8 | `PATCH /prices/:id` | `Price.Edit.Managed` | `PRICE_AUTHZ_RESOLVER` |

Confirmed by grep: every live `.Managed` `@RequirePermissions` call site in `apps/api/src` is immediately followed by an `@AuthorizationContext` declaration — zero gaps.

## A regression caught and fixed during implementation (same shape as M0.1's)

The first `PermissionsGuard` implementation passed a `contextProvider` **unconditionally** for every permission in `@RequirePermissions(...)`, regardless of scope suffix. This forced the new two-phase fail-closed evaluation onto live `.Own`-scoped permissions (`Media.Upload.Own`) that have no `@AuthorizationContext` and are outside M0.2's rollout — because a grant's *own* code suffix (not the route's rollout status) determines whether it's `contextBound` (D6). The full e2e suite caught this immediately: 20 failures across the same three suites M0.1's regression hit (`media.e2e-spec.ts`, `review-media-auto-publish.e2e-spec.ts`, `media-orphan-cleanup.e2e-spec.ts`).

**Fix:** the guard now passes a `contextProvider` **only** for permissions ending in `.Managed`; `.Own`/`.Any`/scope-less permissions take the plain rank-only `canWithGrants` call (no provider) — reproducing the exact pre-M0.2 decision for every permission M0.2 doesn't touch. A dedicated regression test (`permissions.guard.spec.ts`, "permission .Own KHÔNG có @AuthorizationContext... vẫn allow qua đường tương thích rank-thuần") locks this in. Re-ran full e2e after the fix: 22/22 suites, 190/190 tests green.

## Red-before / green-after evidence (live Postgres)

Using `git stash` to temporarily revert only the **tracked** M0.2 source changes (guard, decorator wiring, controllers, modules — new untracked files including the e2e test itself were unaffected), the exact same `authz-scoped-pep-rollout.e2e-spec.ts` was run against the M0.1 baseline, then against the restored M0.2 code:

**RED (M0.1 baseline, Finding A live):**

```
Tests: 9 failed, 4 passed, 13 total
● managerA PATCH place B -> Expected 403, Received 200   (place identity)
● hotels PATCH place B    -> Expected 403, Received 200
● restaurants PATCH place B -> Expected 403, Received 200
● contacts POST place B   -> Expected 403, Received 201
● prices POST place B     -> Expected 403, Received 201
● contacts PATCH place B  -> Expected 403, Received 200
● contacts DELETE place B -> Expected 403, Received 200
● prices PATCH place B    -> Expected 403, Received 200
● unknown resource id     -> Expected 403, Received 404   (existence leak)
```

The 4 that passed under the baseline are exactly the ones Finding A never touched: managerA on place A (own business), contributor `Any`, `super_administrator` wildcard, and plain-member deny-by-default.

**GREEN (M0.2 restored):** 13/13 pass — cross-business denied for all 8 handlers, own-business still allowed, `Any`/wildcard unaffected, unknown resource returns uniform 403.

Raw stashing procedure: `git stash push -- <11 tracked M0.2 files>` → run test (red) → `git stash pop` → run test (green) → `git stash list` confirmed empty afterward. `git status --short` matched the pre-stash state exactly.

## Authorization matrix (confirmed live, real Postgres + real HTTP)

| Caller | Place A | Place B | Contact (A/B) | Price (A/B) | Hotel/Restaurant (A/B) | Unknown resource |
|---|---|---|---|---|---|---|
| `business_manager` scoped to A | 200/201 | **403** | 200/**403** | 200/**403** | 200/**403** | **403** (no leak) |
| `contributor` (`Place.Edit.Any`) | 200 | 200 | — | — | — | — |
| `super_administrator` (`*`) | 200 | 200 | — | — | — | — |
| plain `member` | 403 | 403 | — | — | — | — |

Also verified live (separate temporary check, deleted immediately after): the real `NestFactory`-driven application (full `AppModule` + a throwaway controller with a `.Managed` permission and no `@AuthorizationContext`) fails `app.init()` with an error naming the offending controller/handler/permission — proving D9 at actual bootstrap, not just in the isolated validator unit test.

## Unit tests

| Suite | Count |
|---|---|
| `authorization-context.decorator.spec.ts` | 5 |
| `identity-place.resolver.spec.ts` | 3 |
| `contact-authz.resolver.spec.ts` | 4 |
| `price-authz.resolver.spec.ts` | 4 |
| `authorization-bootstrap.validator.spec.ts` | 8 |
| `permissions.guard.spec.ts` | 16 |
| `authorization.service.spec.ts` (added `canWithGrants` cases) | +4 |
| **New/updated total** | **44** |

## E2E / live validation

| Suite | Result |
|---|---|
| `authz-scoped-pep-rollout.e2e-spec.ts` (new, real Postgres) | 13/13 PASS |
| Live bootstrap-failure check (temporary, deleted after) | Confirmed `app.init()` rejects with correct identifying message |
| DB residue after all e2e runs | **Zero** — verified by direct query (users/roles/places/contacts/prices matching test naming patterns all count 0) |

## Full regression (2026-08-05)

| Check | Result |
|---|---|
| Backend unit | **112 suites / 1250 tests PASS** |
| Backend e2e (all 22 suites, real Postgres) | **22 suites / 190 tests PASS** |
| Backend typecheck | PASS |
| Backend lint | PASS, `--max-warnings=0` |
| Backend build | PASS |
| Monorepo build | **4/4 PASS** |
| Monorepo typecheck | **6/6 PASS** |
| Monorepo lint | **6/6 PASS** |
| `git diff --check` | clean |
| Secret scan | clean |

## Remaining work for M0.3 (NOT started)

- Own-scope hardening: extend `@AuthorizationContext`/resolver/guard mechanism to `Own`-scoped routes (`PATCH /users/me`, `Media.Upload.Own`) — today safe only by structural convention (no `:id` param), not by any check.
- `PRINCIPAL_RESOLVER` (mentioned in ADR-019 D5 as a shared resolver alongside `IDENTITY_PLACE_RESOLVER`) — not implemented in M0.2, since it only matters for Own-scope routes.
- Extending `AuthorizationBootstrapValidator`'s D9 check to cover `.Own` permissions once M0.3 makes that check meaningful (today it would immediately fail on live, intentionally-uncontexted Own routes).
- Any new scope dimension (organization/team/tenant) per ADR-019's own stated reopening conditions.

This report does not modify ADR-015.
