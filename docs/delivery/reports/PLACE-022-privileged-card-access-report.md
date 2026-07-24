# PLACE-022 — Privileged Place-card access hardening (B2 / F-24)

- **Task:** PLACE-022 (`docs/delivery/tasks/PLACE-022.yaml`)
- **Type:** security_hardening
- **Date:** 2026-07-24
- **Outcome:** **COMPLETED — F-24 RESOLVED**
- **Authority:** OD-B2 (B2-A) + explicit owner authorization to activate & execute PLACE-022, 2026-07-24
- **Evidence index:** `docs/delivery/evidence/PLACE-022-privileged-card-access-evidence-index.md`

## 1. What & why

`PlacesRepository.getCardById` filtered only `deleted_at IS NULL` (no `status`), so it returned
inactive/non-published rows — intentional for permission-gated moderation/write flows, but its
general name gave no signal of the hazard (F-24: a future `@Public` route could re-expose
unpublished content). OD-B2/B2-A: **rename to a privileged-signalling name + add an enforceable
architecture test**, behaviour identical.

## 2. Selected name & rationale

**`getCardByIdIncludingInactive`.** Chosen because it satisfies OD-B2's **first-listed** naming
quality — "explicit that inactive or non-public records may be returned" — which is the property
that most directly prevents the misuse (a reviewer sees "IncludingInactive" and will not attach it
to a public endpoint). It matches the SQL (only `deleted_at IS NULL`, **no** status filter → includes
`pending`/`draft`/`archived`) and the neighbouring `getCardById` / `getDetailBySlug` / `existsBySlug`
convention. The authorization precondition (caller must already be permission-gated) is documented in
the method comment.

## 3. Before → after caller map (verified)

| Repo method | Service caller | Controller route | `@Public`? | Guard |
|---|---|---|---|---|
| `getCardById` → **`getCardByIdIncludingInactive`** | `create` | `POST /places` | No | `Place.Create` |
| " | `update` (×2) | `PATCH /places/:id` | No | `Place.Edit.Managed` |
| " | `archive` | `DELETE /places/:id` | No | `Place.Archive` |
| " | `approve` | `POST /places/:id/approve` | No | `Place.Approve` |

`@Public` routes — `list` (→ `repo.list`), `listRevisions` (→ revisions), `getBySlug`
(→ `repo.getDetailBySlug`, `status = published`) — **none reach the privileged method.**
Global `APP_GUARD` (`JwtAuthGuard` + `PermissionsGuard`) enforce that "not `@Public`" = authenticated
+ permission-checked.

**Public-route reachability finding: NONE.** No public route legitimately required the method, so the
rename conceals no authorization problem (Phase 2 stop-condition not triggered).

## 4. Runtime behaviour impact

**NONE.** SQL, parameters, return type, null-handling and exceptions are byte-identical — a pure
rename. No status predicate added/removed; no controller contract, DTO, pagination, guard or schema
change. Verified: existing `places.service.spec` (18 service specs) and `places.repository.spec`
pass unmodified except the method name; public list still returns only `published`; unauthenticated
write still `401`.

## 5. Files changed

- `apps/api/src/modules/places/repositories/places.repository.ts` — method renamed + comment updated (authorization precondition + F-24/PLACE-022 note).
- `apps/api/src/modules/places/places.service.ts` — 5 call sites renamed.
- `apps/api/src/modules/places/places.service.spec.ts` — mock + 13 references renamed.
- `apps/api/src/modules/places/places-privileged-access.arch.spec.ts` — **new** architecture test.
- Governance: `docs/delivery/tasks/PLACE-022.yaml`, this report, the evidence index, `findings/F-24.yaml`, `workstreams/place.yaml`, `state.yaml`.

## 6. Architecture-test design

`places-privileged-access.arch.spec.ts` (6 tests, unit suite, no DB) combines **runtime controller
metadata** (`IS_PUBLIC_KEY` via reflect-metadata) with **static reachability** parsed from source:

1. privileged method **exists** on `PlacesRepository` (guard wired to the real method);
2. the old ambiguous `getCardById` **no longer exists**;
3. **exactly** the approved service methods (`create`/`update`/`archive`/`approve`) call it (allowlist — drift fails);
4. **no `@Public` controller route** can transitively reach it (controller → service → repo), with a failure message naming the offending path;
5. **no controller** calls the privileged repo method directly;
6. self-check documenting the approved callers.

It is deterministic, is not satisfied by a rename alone (it enforces the public-reachability rule and
the allowlist), and protects the three regression scenarios named in the task. **Mutation-checked:**
wiring a `@Public` route to a privileged service method makes tests #4 and #6 fail with the exact
`@Public route "leak" → placesService.archive() → getCardByIdIncludingInactive()` path; restoring
returns to 6/6.

## 7. Verification (Node v20.20.2 / npm 10.8.2)

| Check | Result |
|---|---|
| Scope | only `apps/api/src/modules/places/**` + `docs/**`; no schema/migration/contract |
| Governance YAML parse | ✅ |
| Lint (affected + full) | ✅ |
| Typecheck | ✅ |
| Affected specs (repo + service) | ✅ 40/40 |
| New architecture test | ✅ 6/6 · mutation-checked · **3× deterministic** |
| Full unit | ✅ **216/216** (210 + 6 arch), 30 suites |
| Full API e2e | ✅ **33/33**, 6 suites |
| Clean build (`turbo --force`, tsbuildinfo purged) | ✅ 4/4; artifacts `main.js`/`app.module.js`/`core/`; **153 == 153**; no spec in dist; web `.next` present |
| Boot + `/api/health` | ✅ 200, db up, redis up |
| Web `/` | ✅ 200 |
| Public list excludes inactive | ✅ 49 rows, all `published` |
| Non-existent detail | ✅ 404 (status-filtered path intact) |
| Unauthenticated write | ✅ 401 (privileged path still gated) |
| Processes / ports | ✅ terminated; 4000 & 3000 FREE |

Authorized Place-card flows (create/update/archive/approve → the privileged method) are additionally
exercised against the real DB by the passing `authz-enforcement` + `wave2` e2e specs.

## 8. F-24 resolution

`decision_status: APPROVED` (OD-B2) · `implementation_status: DONE` (PLACE-022) ·
`validation_status: PASSED` · `release_blocker_status: NOT_A_BLOCKER` → **F-24 RESOLVED**. The latent
trap is closed: the method name now signals the hazard and an enforceable, mutation-checked test bars
any public path.

## 9. Non-claims

No Place authorization redesign; no status predicate added/removed; no B3–B7 work. Behaviour identical.
