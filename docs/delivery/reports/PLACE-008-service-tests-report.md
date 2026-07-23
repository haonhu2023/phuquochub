# PLACE-008 — Execution Report (PlacesService unit tests)

> Workstream: place · Task: PLACE-008 · Type: testing · Date: 2026-07-22
> Authority: `docs/delivery/state.yaml`, `docs/delivery/tasks/PLACE-008.yaml`
> Result: **COMPLETED.** AC1–AC7 (mandatory) PASS, AC8 (optional) PASS.

> `PLACE-008-execution-report.md` is a *different, older* file — a preflight block report from
> when PLACE-008 was an undefined ID. Retained as history; this is the PLACE-008 record.

## 1. Executive Summary
`places.service.ts` had **no spec file at all**, despite holding the module's most consequential
logic: the forced-`PENDING` create, the snake_case→camelCase update mapping, the conditional
revision recording, the slug-collision loop, and the two ADR-016 audit events on
`archive`/`approve`. 18 specs now cover it, passing on the first run.

The blocker recorded in `place.yaml` — *"service imports @phuquochub/utils"* — is **disproven**:
`slugify` resolves under jest, exercised live by the slug-collision spec. **No production code
was modified.**

## 2. Task Identity and Authority
| item | value |
|---|---|
| Task | PLACE-008 — "Add PlacesService unit tests for the write and moderation paths" |
| Type | `testing` |
| Authorized by | `state.yaml` — `current.task: PLACE-008`, was `ready` |
| depends_on | PLACE-007 (completed 2026-07-22, jest 51/51) |

## 3. Task Type
`testing` per §4.4 / §5.9: only approved missing coverage added, real behaviour exercised, no
production change, no assertion weakened.

## 4. Starting Repository State
Not a git repository — branch/commit/diff unknown, not fabricated. Node v24.18.0 portable.
Working tree carries PLACE-002…007 changes, all left intact.

## 5. Dependency Verification
PLACE-007 completed on executed evidence: `jest places` 51/51 with GAP-02/04 specs unmodified,
eslint + tsc exit 0, AC1–AC6 PASS (`evidence/PLACE-007-dead-code-evidence-index.md` VO-1..VO-4).

## 6. Problem and Objective
Every path in `PlacesService` was unverified. A dropped `audit.record` call, a wrong default
status, or a snake_case key leaking into the ORM patch would all pass `tsc` and `eslint`
today — the failure modes are silent. The service is pure orchestration over seven injected
collaborators, so all of it is reachable with mocks and no database.

## 7. Approved Scope
Exactly one new file: `places.service.spec.ts`. Explicitly out of scope: any production change,
controller tests, e2e, and every carried finding.

## 8. Execution Approach
1. Read the sibling service specs first to identify the established convention.
2. Verified `@phuquochub/utils` resolution (the task's first stop condition) by exercising
   `slugify` through a real code path rather than asserting it abstractly.
3. Wrote the suite, mocking the mapper as the sibling spec does.
4. Ran the full validation set.

## 9. Files Inspected
`tasks/PLACE-008.yaml`; `places.service.ts`; `events.service.spec.ts`;
`test/helpers/create-mock.ts`; `places.repository.spec.ts`; `place.enums.ts`;
`revisions/revision.enums.ts`.

## 10. Files Created
| path | class | reason | validation | rollback |
|---|---|---|---|---|
| `apps/api/src/modules/places/places.service.spec.ts` | task_required | 18 specs (AC1–AC6) | jest 18/18, then 69/69 module-wide | delete the file |

## 11. Files Modified
**None.** `places.service.ts` is byte-unchanged — the AC7 requirement and the task's second
stop condition. No seam turned out to be untestable, so no production edit was needed or made.

## 12. Convention Compliance (AC1)
`events.service.spec.ts` establishes the pattern, and this suite matches it point for point:
direct construction (`new PlacesService(...)`) rather than `Test.createTestingModule`;
collaborators built with `createMock<ConstructorParameters<typeof Service>[N]>`;
`jest.mock('./places.mapper', ...)` because the mapper has its own specs;
`afterEach(() => jest.clearAllMocks())`; Vietnamese test names. No third pattern introduced.

Using `ConstructorParameters<...>[N]` rather than importing each collaborator type also means
the suite cannot drift out of sync with the constructor signature without a compile error.

## 13. Domain Impact
None — tests only. But the suite now *pins* domain rules that were previously unenforced:
community-created Places must start `PENDING` (WF-06); every content change records a
`wiki_revision` (WF-14) with `PENDING` on create and `APPROVED` on update; and privileged
status transitions must emit an audit event. Those rules are now regression-protected.

## 14. Persistence and Migration Impact
Not applicable to the approved PLACE-008 task. No entity, migration, index or stored data
touched. Repository collaborators are mocked, so no SQL executes.

## 15. API and Contract Impact
No contract change. One contract-adjacent behaviour is now locked down: the update path must
translate snake_case DTO keys (`short_description`, `opening_hours`, `price_range`,
`category_id`) into camelCase entity properties, and the spec asserts the snake_case keys do
**not** survive into the ORM patch — a leak would have written columns that do not exist.

## 16. Compatibility Strategy
Not applicable — a new test file creates no old/new behaviour coexistence and nothing to retire.

## 17. Consumer Compatibility
| Consumer | Path | R/W | Contract or behavior | Required change | Validation | Status |
|---|---|---|---|---|---|---|
| places service | `apps/api/src/modules/places/places.service.ts` | n/a | **unchanged (byte-identical)** | none | jest 18/18 | **tested** (was untested) |
| places module suites | `apps/api/src/modules/places/**` | n/a | unchanged | none | jest 69/69, 6 suites | compatible_without_change (tested) |
| other modules | `apps/api/src/modules/**` | n/a | untouched | none | tsc exit 0 | compatible_without_change (compiled) |

## 18. Geospatial Impact
One assertion of note: the create spec checks that `location.lng` and `location.lat` reach the
repository in the **correct fields**, guarding the classic lat/lng transposition at the
service→repository boundary. No geospatial behaviour changed; nothing DB-backed is claimed.

## 19. Data-Quality Impact
Indirect and positive: the suite pins `updatedBy` always being set on update, and the empty-patch
case asserting `{ updatedBy: 'u1' }` exactly — so an accidental broadening of the patch object
(which would overwrite columns with `undefined`) would now fail.

## 20. Cache, Search, and Event Impact
Not applicable to the approved PLACE-008 task. No cache, search index or event publisher is
involved; the audit and revision services are asserted as collaborators, not exercised for real.

## 21. Tests Added or Updated
18 specs added, none modified, none weakened:

| area | specs | what they pin |
|---|---|---|
| `list` | 2 | public path never forwards `status` (GAP-04 at the **service** layer); page/limit → offset and `meta.total` |
| `create` | 4 | invalid category → `BadRequestException` with **no** write and **no** revision; status forced `PENDING`; `createdBy` set; lng/lat in the right fields; revision `PENDING` + `COMMUNITY_EDIT` + `diff: null`; slug-collision loop produces a different slug that still starts with the base |
| `update` | 6 | not-found → `NotFoundException`; invalid category → `BadRequestException` with no write; snake→camel mapping with the four snake keys asserted **absent**; `updateLocation` only when `location` present, with correct lng/lat order; revision `APPROVED` with `diff.fields`; **no** revision on an empty patch, while `updatedBy` is still written |
| `archive` | 2 | not-found → no archive, no audit; audit `place.status_changed` with `Place.Archive` and `{from, to: archived}` |
| `approve` | 2 | not-found → no status change, no audit; `setStatus(PUBLISHED)` and audit with `Place.Approve` and `{from: pending, to: published}` |
| `getBySlug` | 2 | not-found/unpublished → `NotFoundException`; satellites composed, and looked up with the lowercase `'place'` discriminator (B-3) |

**AC8 — assertions target arguments, not call counts.** `audit.record` is asserted via
`toMatchObject` on the event payload (name, entityType, entityId, actorId, permission, and the
`from`/`to` context), not merely `toHaveBeenCalled()`. A reordered-but-correct implementation
still passes; a silently dropped permission or wrong `from` value does not.

## 22. Validation Commands and Results
| # | command | cwd | exit | result |
|---|---|---|---|---|
| 1 | `npx jest places.service` | `apps/api` | **0** | **18/18 pass** — first run, no iteration needed |
| 2 | `npx jest places` | `apps/api` | **0** | **69/69 pass, 6 suites** (51 before + 18 new) |
| 3 | `npx eslint "src/modules/places/**/*.ts" --max-warnings=0` | `apps/api` | **0** | clean |
| 4 | `npx tsc -p tsconfig.json --noEmit` | `apps/api` | **0** | clean |

All four declared `validation_commands` executed. No failures, so no failure classification was
required.

**Stop condition 1 discharged with evidence, not assertion.** `@phuquochub/utils` resolves under
jest: the slug-collision spec calls `create()`, which calls `uniqueSlug()`, which calls
`slugify()` — and the spec asserts the produced slug *starts with the base slug*, which is only
true if `slugify` actually ran. A module-resolution failure would have thrown at import.

## 23. Security Review
The suite adds no attack surface and strengthens two security-relevant guarantees:
1. **Audit non-repudiation.** `archive` and `approve` are privileged transitions under ADR-016.
   Their audit events are now asserted down to `permission` and `{from, to}`, so a change that
   silently stopped recording who did what — or recorded the wrong prior state — fails.
2. **Privilege boundary.** The `list` spec deliberately passes `status: PENDING` in the query,
   as if the DTO guard had been bypassed, and asserts the service still does not forward it.
   That is a defence-in-depth regression test complementing the repository-layer GAP-04 spec.

Both not-found paths are also asserted to perform **no** side effect, so a future refactor
cannot leave an audit entry or a write behind for a place that does not exist.

## 24. Performance Review
No runtime change. The suite runs in ~7 s (18 specs), well inside normal jest time on this
volume — notable only because `places.dto.spec.ts` took 232 s in an earlier session (F-7); the
service suite has no such cost. Nothing else measured; nothing to measure.

## 25. Observability Review
No observability change. The audit-event assertions are the closest adjacent concern, and they
verify existing behaviour rather than adding a signal. No production claim is made about
whether those events reach any sink.

## 26. Rollback or Recovery Review
Delete `apps/api/src/modules/places/places.service.spec.ts`. That is the entire change: no
production file, schema, data, contract or configuration is involved.

## 27. Deviations From the Approved Task
None. No production code touched, no jest configuration changed, no other layer tested, no
finding bundled in. The task's `getBySlug` guidance — "one representative assertion" — was
followed: two specs, one failure path and one composition check, without duplicating the
satellite mappers' own coverage.

## 28. Remaining Findings
| id | finding | evidence | disposition |
|---|---|---|---|
| F-25 | The `place.yaml` blocker *"places.service unit tests (blocked: service imports @phuquochub/utils)"* was **stale** — the import resolves fine. It had been carried since PLACE-001 without retest. Worth remembering that recorded blockers decay: PLACE-005 fixed the environment, but the note was never revisited. | §22; `place.yaml` testing_surface | **resolved by this task**; the entry is corrected in `place.yaml` |
| F-26 | `update()` records a revision whose `snapshot` is the card **after** the write, but the `diff` lists only field *names* — no before/after values. Recovering what a value used to be is therefore impossible from the revision alone. Adequate for WF-14 today; a limitation to know before Sprint 4 builds the approval flow on it. | `places.service.ts:170-181` | backlog — design question, not a defect |

F-1 … F-24 remain open and unchanged.

## 29. Risks
| risk | severity | note |
|---|---|---|
| No DB-backed validation anywhere in the workstream | high | unchanged — the service suite mocks every repository, so no SQL is exercised |
| `node_modules/@phuquochub/shared-types` is a FAT32 copy | high | unchanged |
| FAT32 removable volume, no VCS | high | unchanged |
| Controller layer still untested | medium | guards and permission decorators remain unverified — selected as PLACE-009 |

## 30. Acceptance-Criteria Evaluation
| # | Criterion | Mandatory | Result | Evidence |
|---|---|---|---|---|
| AC1 | Spec exists and follows the sibling convention; no new pattern | yes | **PASS** | §12 |
| AC2 | `create` covered: forced PENDING, invalid category, PENDING revision | yes | **PASS** | 4 create specs |
| AC3 | `update` covered: not-found, invalid category, snake→camel, conditional location, conditional revision incl. no-change | yes | **PASS** | 6 update specs |
| AC4 | `archive`/`approve` assert event name, permission and from/to — not just "was called" | yes | **PASS** | §21; `toMatchObject` payload assertions |
| AC5 | Slug-collision loop exercised, colliding slug yields a different final slug | yes | **PASS** | create spec 4 |
| AC6 | `list` asserted not to forward a status filter | yes | **PASS** | list spec 1 |
| AC7 | No production file modified; jest/eslint/tsc exit 0 | yes | **PASS** | §11; §22 cmds 1–4 |
| AC8 | Assertions target behaviour/arguments over call counts | **no** | **PASS** | §21 final paragraph |

All seven mandatory criteria **PASS**. The optional criterion also passes.

## 31. Recommended Delivery-State Transition
Applied: `current.task: PLACE-009`, `status: ready`. The `testing` gate stays `in_progress`:
the service layer is now covered, but controller and e2e coverage remain absent.

## 32. Selected PLACE-009 Task
`docs/delivery/tasks/PLACE-009.yaml` — **"Add PlacesController tests for the public/privileged
route boundary"**, type `testing`. The controller is the last Place layer reachable without a
database, and it is where guards and permission decorators are declared — the enforcement
points behind the audit events this task just pinned at the service layer.

## 33. Explicit Non-Claims
This report does **not** claim any unverified: **production deployment, production migration
application, production backfill completion, complete external consumer migration, complete
cache propagation, complete search reindexing, complete event propagation, canary success,
hypercare completion, production stabilization, compatibility retirement readiness, or legacy
schema cleanup readiness.**

Specifically not claimed: these are **unit tests with every collaborator mocked**. They prove
the service calls its dependencies correctly — **not** that the SQL those repositories emit is
correct, that the audit event reaches any store, that the revision is persisted, or that guards
admit the right callers. No database, HTTP server or browser was started; no `nest build`; no
e2e; no telemetry; and no git branch, commit or diff.
