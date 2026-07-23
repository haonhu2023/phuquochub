# PLACE-009 — Execution Report (PlacesController route-boundary tests)

> Workstream: place · Task: PLACE-009 · Type: testing · Date: 2026-07-22
> Authority: `docs/delivery/state.yaml`, `docs/delivery/tasks/PLACE-009.yaml`
> Result: **COMPLETED.** AC1–AC7 (mandatory) PASS, AC8 (optional) PASS.

## 1. Executive Summary
`places.controller.ts` is thin delegation, so its security boundary lives entirely in decorator
metadata — and nothing verified it. Removing a `@RequirePermissions`, marking a write route
`@Public()`, or swapping the `:id/revisions` / `:slug` declaration order would all have passed
`tsc`, `eslint` and every existing spec.

23 specs now pin that metadata, passing on the first run. Module total: **92/92 across 7
suites**. No production code changed.

## 2. Task Identity and Authority
| item | value |
|---|---|
| Task | PLACE-009 — "Add PlacesController tests for the public/privileged route boundary" |
| Type | `testing` |
| Authorized by | `state.yaml` — `current.task: PLACE-009`, was `ready` |
| depends_on | PLACE-008 (completed 2026-07-22, 18 specs, no production change) |

## 3. Task Type
`testing` per §5.9: approved missing coverage only, real declared behaviour exercised, no
production change, no assertion weakened.

## 4. Starting Repository State
Not a git repository — branch/commit/diff unknown, not fabricated. Node v24.18.0 portable.
Working tree carries PLACE-002…008 changes, all intact.

## 5. Dependency Verification
PLACE-008 completed on executed evidence: `jest places.service` 18/18, `jest places` 69/69,
eslint + tsc exit 0, `places.service.ts` byte-unchanged
(`evidence/PLACE-008-service-tests-evidence-index.md` VO-1..VO-5).

## 6. Problem and Objective
The controller declares the enforcement points that authorize the audit events PLACE-008
pinned: three `@Public()` reads, four permission-gated writes, `@HttpCode(201)` on create, and a
declaration order that keeps `:id/revisions` from being swallowed by `:slug`. All unverified.

Objective: assert the declared metadata and delegation so the boundary cannot regress silently,
without a running server and without touching production code.

## 7. Approved Scope
One new file: `places.controller.spec.ts`. Out of scope: any production change, the authz guard
*implementation*, e2e/supertest/Nest boot, re-testing service logic, DTO validation, and all
carried findings.

## 8. Execution Approach
Read both authz decorators first to take their **exported key constants**; asserted metadata via
`Reflect.getMetadata` against prototype handlers; followed PLACE-008's construction convention;
ran validation.

## 9. Files Inspected
`tasks/PLACE-009.yaml`; `places.controller.ts`; `authz/decorators/{public,require-permissions,current-user}.decorator.ts`;
`places.service.spec.ts` (convention); `test/helpers/create-mock.ts`.

## 10. Files Created
| path | class | reason | validation | rollback |
|---|---|---|---|---|
| `apps/api/src/modules/places/places.controller.spec.ts` | task_required | 23 specs (AC2–AC6) | jest 23/23, then 92/92 | delete the file |

## 11. Files Modified
**None.** `places.controller.ts` is byte-unchanged (AC7). No seam proved untestable, so the
task's third stop condition never fired.

## 12. Metadata Keys Used (AC8)
Both keys come from the decorators' own exports, never duplicated as literals:

| key | source | value |
|---|---|---|
| `IS_PUBLIC_KEY` | `authz/decorators/public.decorator.ts:3` | `'isPublic'` |
| `PERMISSIONS_KEY` | `authz/decorators/require-permissions.decorator.ts:3` | `'requiredPermissions'` |
| `HTTP_CODE_METADATA`, `PATH_METADATA` | `@nestjs/common/constants` | framework-owned |

This matters: if someone renames a metadata key, the spec fails to find metadata and the tests
break loudly, instead of passing vacuously against a stale string.

The **expected permission strings** are deliberately written as literals in the spec, *not* read
back from the controller. Reading both sides from the same source would make a production typo
agree with itself and pass.

## 13. Route Boundary Asserted (AC2, AC3)
| handler | route | `@Public()` | permission |
|---|---|---|---|
| `list` | `GET /places` | **yes** | none (asserted `undefined`) |
| `listRevisions` | `GET /places/:id/revisions` | **yes** | none (asserted `undefined`) |
| `getBySlug` | `GET /places/:slug` | **yes** | none (asserted `undefined`) |
| `create` | `POST /places` | **no** | `Place.Create` |
| `update` | `PATCH /places/:id` | **no** | `Place.Edit.Managed` |
| `archive` | `DELETE /places/:id` | **no** | `Place.Archive` |
| `approve` | `POST /places/:id/approve` | **no** | `Place.Approve` |

Both directions are asserted: reads *are* public **and** declare no permission; writes are *not*
public **and** declare exactly one specific permission. A write route accidentally marked
`@Public()` fails, and so does a read route that quietly acquires a permission requirement.

## 14. Domain Impact
None — tests only. The specs pin the declared authorization surface for the Place aggregate's
lifecycle operations (create → pending, edit, archive, approve), but change no semantics.

## 15. Persistence and Migration Impact
Not applicable to the approved PLACE-009 task. No entity, migration or data touched; both
services are mocked, so nothing reaches a repository.

## 16. API and Contract Impact
No contract change. Two contract-relevant declarations are now locked: `POST /places` responds
**201** (asserted via `HTTP_CODE_METADATA`), and the route paths `:id/revisions` and `:slug` are
asserted to be exactly those strings — so a path edit that breaks the openapi mapping fails.

## 17. Compatibility Strategy
Not applicable — a new test file creates no coexisting behaviour and nothing to retire.

## 18. Consumer Compatibility
| Consumer | Path | R/W | Contract or behavior | Required change | Validation | Status |
|---|---|---|---|---|---|---|
| places controller | `apps/api/src/modules/places/places.controller.ts` | n/a | **unchanged (byte-identical)** | none | jest 23/23 | **tested** (was untested) |
| places module suites | `apps/api/src/modules/places/**` | n/a | unchanged | none | jest 92/92, 7 suites | compatible_without_change (tested) |
| authz guards | `apps/api/src/modules/authz` | read | consumes the metadata asserted here | none — implementation deliberately not tested | tsc exit 0 | compatible_without_change (compiled) |

## 19. Geospatial / Data-Quality / Cache-Search-Event Impact
Not applicable to the approved PLACE-009 task.

## 20. Tests Added or Updated
23 specs added, none modified, none weakened:
- **7** `@Public()` assertions (3 read routes public, 4 write routes not);
- **7** permission assertions (4 exact strings, 3 read routes asserted `undefined`);
- **1** `@HttpCode(201)` on create;
- **1** route ordering + path identity;
- **7** delegation assertions, each checking arguments — notably that write routes pass
  **`user.sub`**, not the whole `AuthPrincipal`, since that value flows into ADR-016 audit
  records and `created_by`/`updated_by`.

`it.each` is used for the repetitive metadata assertions so every route is named individually in
the output rather than hidden inside one loop.

## 21. Validation Commands and Results
| # | command | cwd | exit | result |
|---|---|---|---|---|
| 1 | `npx jest places.controller` | `apps/api` | **0** | **23/23 pass**, first run |
| 2 | `npx jest places` | `apps/api` | **0** | **92/92 pass, 7 suites** (69 before + 23 new) |
| 3 | `npx eslint "src/modules/places/**/*.ts" --max-warnings=0` | `apps/api` | **0** | clean |
| 4 | `npx tsc -p tsconfig.json --noEmit` | `apps/api` | **0** | clean |

All four declared `validation_commands` executed. No failures, so no failure classification was
required. No Nest application was booted — the first stop condition never fired, since
`Reflect.getMetadata` reached everything needed statically.

## 22. Security Review
This is the security-relevant task of the pair. Prior to it, the entire public/privileged split
was unverified; now:
- a write route silently marked `@Public()` fails;
- a deleted or renamed `@RequirePermissions` fails (metadata becomes `undefined`);
- a **weakened** permission fails, because the expected strings are independent literals — e.g.
  changing `Place.Edit.Managed` to `Place.Edit` is caught;
- passing the whole principal instead of `user.sub` fails, which protects the audit trail's
  actor identity.

**What this deliberately does not test**, and must not be read as: it asserts what the
controller *declares*, not what the guard *does*. Whether `JwtAuthGuard`/the PDP actually deny
an unauthorized caller is the authz module's own responsibility and was explicitly out of scope.
A correct declaration with a broken guard would still pass these specs.

## 23. Performance Review
No runtime change; the suite runs in ~7 s. Nothing measured, nothing to measure.

## 24. Observability Review
Not applicable to the approved PLACE-009 task. No signal added; the `user.sub` delegation
assertions indirectly protect audit-record quality, which PLACE-008 already covers at the
service layer.

## 25. Rollback or Recovery Review
Delete `apps/api/src/modules/places/places.controller.spec.ts`. No production file, schema,
data, contract or configuration is involved.

## 26. Deviations From the Approved Task
None. No production change, no Nest boot, no guard-implementation testing, no finding bundled in.

## 27. Remaining Findings
| id | finding | evidence | disposition |
|---|---|---|---|
| F-27 | The route-ordering assertion relies on `Object.getOwnPropertyNames(prototype)` reflecting declaration order. That is reliable for TypeScript class methods and is what Nest itself walks when registering routes — but it is **not** a routing test. It would not catch a framework-level change in registration strategy. Only an e2e request for `/places/<uuid>/revisions` would prove the real behaviour. | §20; spec "thứ tự route" | backlog — folded into the DB-backed/e2e validation task |
| F-28 | `getBySlug` takes a raw `:slug` with no `ParseUUIDPipe` (correctly — it is a slug) and no format constraint, so any string reaches the service and then the parameterized query. Not a vulnerability (the query is parameterized and the repository filters by status), but it is the one unvalidated path parameter in the controller. | `places.controller.ts:43-47` | backlog — would need a slug-format decision first |

F-1 … F-26 remain open and unchanged.

## 28. Risks
| risk | severity | note |
|---|---|---|
| No DB-backed validation anywhere in the workstream | high | unchanged — and now the dominant remaining gap |
| Guard implementation unverified for Place routes | medium | declarations are pinned; enforcement is the authz module's own coverage |
| `node_modules/@phuquochub/shared-types` is a FAT32 copy | high | unchanged |
| FAT32 removable volume, no VCS | high | unchanged |

## 29. Acceptance-Criteria Evaluation
| # | Criterion | Mandatory | Result | Evidence |
|---|---|---|---|---|
| AC1 | Spec follows the PLACE-008 convention; no new pattern, no Nest boot | yes | **PASS** | §8; direct construction + `createMock` |
| AC2 | 3 read routes asserted public, 4 write routes asserted not public | yes | **PASS** | §13; 7 specs |
| AC3 | Exact permission string asserted for each write route | yes | **PASS** | §13; independent literals (§12) |
| AC4 | Delegation asserted for every handler, incl. `user.sub` as actor id | yes | **PASS** | 7 delegation specs |
| AC5 | `POST /` asserted 201 via HttpCode metadata | yes | **PASS** | §21 cmd 1 |
| AC6 | Route ordering asserted, with what it proves stated plainly | yes | **PASS** | §20; **F-27** states the limitation explicitly |
| AC7 | No production file modified; jest/eslint/tsc exit 0 | yes | **PASS** | §11; §21 cmds 1–4 |
| AC8 | Metadata keys from exported constants, not duplicated literals | **no** | **PASS** | §12 |

All seven mandatory criteria **PASS**. The optional criterion also passes.

## 30. Recommended Delivery-State Transition
Applied: `current.task: PLACE-010`, `status: ready`. The `testing` gate remains `in_progress`:
every layer reachable without a database is now covered, but e2e and DB-backed validation are not.

## 31. Selected PLACE-010 Task
`docs/delivery/tasks/PLACE-010.yaml` — **"Place release-readiness assessment
(repository-evidence only)"**, type `release-readiness assessment`. With DTO, repository,
mapper, service and controller all covered, and the schema/contract gaps closed by
PLACE-003/005, what remains unverified is overwhelmingly environment-dependent. An honest
gate-by-gate assessment — naming exactly what Docker would unlock and what cannot be claimed
without it — is the highest-value next step and needs no environment access to produce.

## 32. Explicit Non-Claims
This report does **not** claim any unverified: **production deployment, production migration
application, production backfill completion, complete external consumer migration, complete
cache propagation, complete search reindexing, complete event propagation, canary success,
hypercare completion, production stabilization, compatibility retirement readiness, or legacy
schema cleanup readiness.**

Specifically not claimed: these specs assert **declared metadata and delegation**, not HTTP
behaviour. No Nest application was booted, no request was issued, and no guard was executed — a
correct declaration paired with a broken guard would still pass. The route-ordering assertion is
a declaration-order check, not a routing test (F-27). No database, `nest build`, e2e, telemetry,
or git branch/commit/diff.
