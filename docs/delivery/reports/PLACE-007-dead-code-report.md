# PLACE-007 — Execution Report (GAP-13 getCardBySlug dead code)

> Workstream: place · Task: PLACE-007 · Type: analysis · Date: 2026-07-22
> Authority: `docs/delivery/state.yaml`, `docs/delivery/tasks/PLACE-007.yaml`
> Result: **COMPLETED.** AC1–AC6 (mandatory) PASS, AC7 (optional) PASS.

> `PLACE-007-execution-report.md` is a *different, older* file — the report from the session
> that was blocked on PLACE-007 and instead completed PLACE-002. Retained as history; this
> report is the PLACE-007 record.

## 1. Executive Summary
`PlacesRepository.getCardBySlug` had no consumer anywhere in the repository and filtered only
`deleted_at IS NULL`, missing the `status` check that the public read-by-slug path requires.
**Decision: removed**, with a comment left in its place explaining why it went and why the
obvious "fix" (adding a status filter) would have been the wrong call.

51/51 specs pass, including the GAP-02/04 regression specs unmodified. No other method touched.

## 2. Task Identity and Authority
| item | value |
|---|---|
| Task | PLACE-007 — "Retire or justify PlacesRepository.getCardBySlug dead code (GAP-13)" |
| Type | `analysis` (with the single-method change the task authorized) |
| Authorized by | `state.yaml` — `current.task: PLACE-007`, was `ready` |
| depends_on | PLACE-006 (completed 2026-07-22, jest 30/30 + mutation check) |

## 3. Task Type
`analysis` per §4.1 / §5.1: repository evidence inspected first, findings documented, current
state distinguished from recommended state, and only the narrowly authorized change made.

## 4. Starting Repository State
Not a git repository — branch/commit/diff unknown, not fabricated. **VCS history was therefore
unavailable**, so the method's provenance and original intent could not be recovered. That is
recorded as a limitation, not filled in by inference.

## 5. Dependency Verification
PLACE-006 completed on executed evidence: `jest places.dto` 30/30, mutation check 9 failures
without the validator, eslint + tsc exit 0, AC1–AC6 PASS
(`evidence/PLACE-006-opening-hours-evidence-index.md` VO-1..VO-5).

## 6. Problem and Objective
`places.repository.ts:123-129` defined `getCardBySlug(slug)`. GAP-13 (P3) flagged it as dead
code in BUILD_001, and BUILD_002 §193 recorded the deferral explicitly: *"Hiện không có caller
⇒ không khai thác được. Nhưng nếu sau này được nối vào đường công khai mà quên lọc thì lỗ hổng
tái xuất. Nên xử lý khi có caller, hoặc xoá nếu xác nhận là dead code."*

Objective: settle it with evidence — confirm whether any consumer exists, then remove, guard,
or justify keeping it.

## 7. Approved Scope
The analysis, plus `getCardBySlug` alone in `places.repository.ts` and a regression spec if the
guard option had been chosen. Everything else — including F-16, other methods, and every
finding from PLACE-005/006 — explicitly out of scope.

## 8. Execution Approach
Four-pass sweep (§10), then a three-way comparison of the sibling methods (§13), then the
decision, then validation.

## 9. Files Inspected
`tasks/PLACE-007.yaml`; `places.repository.ts`; `places.repository.spec.ts`;
`places.service.ts`; `places.module.ts`; `BUILD_001_PLACE_INSPECTION_GAP_ANALYSIS.md:53,212`;
`BUILD_002_PLACE_PRIORITY_REMEDIATION.md:51,58,193`;
`PLACE-001-place-domain-persistence-baseline.md:111,263,275`.

## 10. Consumer Sweep (AC1)
Four passes, whole repository — not a single bare grep:

| # | pass | command | result |
|---|---|---|---|
| 1 | bare identifier, all trees | `grep -rn "getCardBySlug" apps packages docs delivery scripts` | **1 source occurrence** — its own definition at `places.repository.ts:123`. Plus `apps/api/dist/...js:63` (stale build artifact, not a caller) and 20+ hits in delivery/BUILD docs that *describe* it. |
| 2 | dynamic access | `grep -rnE "\['getCardBySlug'\]\|\[\"getCardBySlug\"\]\|CardBySlug"` | no bracket access, no partial-name binding |
| 3 | all `*BySlug` identifiers | `grep -rnoE "[A-Za-z_]+BySlug" apps packages` | 52 hits across the codebase; every Place-side one resolves to `getDetailBySlug` (7), `existsBySlug` (2) or the vertical modules' own `getBySlug`. **None** to `getCardBySlug`. |
| 4 | module export surface | `grep -rn "PlacesRepository" --include=*.module.ts` | `places.module.ts:27` **exports** `PlacesRepository`, so other Nest modules *could* bind to it — Hotel/Restaurant/Tour reuse `PlacesModule` by design. Pass 3 confirms none of them call this method. |

Pass 4 is the one that mattered: the provider is exported, so "no caller in this file" would
have been insufficient evidence. It has no caller in any module either.

**Limitation, stated plainly:** this is static evidence. There is no VCS history to consult and
no running system to observe, so a reflective or string-built invocation would not appear —
though pass 2 found no bracket-access pattern of any kind in the codebase.

## 11. Files Created
None.

## 12. Files Modified
| path | class | reason | validation | rollback |
|---|---|---|---|---|
| `apps/api/src/modules/places/repositories/places.repository.ts` | task_required | removed `getCardBySlug` (7 lines); left a 7-line comment recording why it went and why not to "fix" it instead | jest 51/51, eslint, tsc | restore the method body (shape identical to `getCardById`, keyed on `slug`) |

One method, one file. No spec needed changing because none referenced it (§20).

## 13. The Three-Way Comparison (AC2)
| method | WHERE clause | status filter | consumers | intent |
|---|---|---|---|---|
| `getCardBySlug` (removed) | `p.slug = $1 AND p.deleted_at IS NULL` | **none** | **0** | undetermined |
| `getCardById` | `p.id = $1 AND p.deleted_at IS NULL` | **none** | 5 (`places.service.ts:124,142,166,186,204`) | privileged — moderation |
| `getDetailBySlug` | `p.slug = $1 AND p.deleted_at IS NULL AND p.status = $2` | **PUBLISHED** | public detail route | public |

**What a public caller would have received:** any Place matching the slug regardless of
`status` — including `draft`, `pending` and `archived` rows. That is precisely the exposure
GAP-02/04 closed for the detail route.

**Why the obvious fix was the wrong call.** Adding `status = PUBLISHED` looks like the safe
move, but `getCardById` — the sibling with five real callers — *deliberately* omits the status
filter, because the moderation flow (`approve`, `archive`, `update`) must read unpublished
rows. So the missing filter is only a defect *if* the method is public, and nothing in the
repository settles whether it was meant to be. Adding the filter would have encoded a guess
about intent; removing the method dissolves the question entirely.

## 14. Decision (AC3)
**Option (a): remove.** Evidence supporting it:
1. Zero consumers across four sweep passes, including the exported-provider check (§10).
2. BUILD_002 §193 pre-authorized exactly this, conditional on confirmation: *"xoá nếu xác nhận
   là dead code"*. This task supplied the confirmation.
3. Keeping it preserves a latent trap that three separate prior reports (BUILD_001, BUILD_002,
   PLACE-001 C-5) each flagged and each deferred. Deferring a fourth time adds nothing.
4. Option (b) would require deciding public-vs-privileged intent, which no repository evidence
   settles — the task's own stop condition 3 territory. Removal avoids the guess rather than
   making it.

The stop conditions were checked and none fired: no consumer was found (SC1), no other method
or export surface had to change (SC2), and the decision does not rest on unsettled product
intent (SC3) — that constraint binds the *keep* path, which is exactly why it was not chosen.

## 15. Domain Impact
None. No Place identity, lifecycle, status transition, ownership, publication, verification,
provenance, audit or soft-delete semantic changed. An uncalled method has no behaviour.

## 16. Persistence and Migration Impact
No schema, entity, migration, index, constraint, seed or fixture change. The removed method
issued a read-only `SELECT`; nothing about the stored data or its access paths changed.

## 17. API and Contract Impact
None. `getCardBySlug` was never reachable from a route: `places.controller.ts` exposes
`getBySlug`, which calls `places.service.ts:62-63` → `getDetailBySlug`. No route, DTO,
response shape, shared type or openapi schema is affected.

## 18. Compatibility Strategy
Not applicable — nothing consumed the method, so there is no old behaviour to preserve, no
transitional path, and nothing to retire. `PlacesRepository` remains exported from
`PlacesModule` with its surface otherwise unchanged.

## 19. Consumer Compatibility
| Consumer | Path | R/W | Contract or behavior | Required change | Validation | Status |
|---|---|---|---|---|---|---|
| places service | `apps/api/src/modules/places/places.service.ts` | read | uses `getCardById` / `getDetailBySlug` | none | jest 51/51 | compatible_without_change (tested) |
| geo / search / revisions | `apps/api/src/modules/{geo,search,revisions}` | read | never referenced it | none | tsc exit 0 | compatible_without_change (compiled) |
| hotels / restaurants / tours | `apps/api/src/modules/{hotels,restaurants,tours}` | read | import `PlacesModule`; use their own `getBySlug` | none | tsc exit 0 + sweep pass 3 | compatible_without_change (compiled) |
| web frontend | `apps/web` | read | no API-internal binding | none | not run | not_applicable |

## 20. Tests Added or Updated
**None — and that is the correct outcome, verified rather than assumed.** Sweep pass 3 confirms
`places.repository.spec.ts` references `getDetailBySlug` five times and never `getCardBySlug`,
so no spec asserted the removed method's existence and none needed editing.

The GAP-02/04 regression specs pass **unmodified** (AC6), which is the evidence that removing a
neighbouring method did not disturb the public-exposure guarantees they protect.

No new spec was added: there is no behaviour to test, and a test asserting a method's *absence*
would be noise.

## 21. Validation Commands and Results
| # | command | cwd | exit | result |
|---|---|---|---|---|
| 1 | `npx jest places` | `apps/api` | **0** | **51/51 pass, 5 suites** — GAP-02/04 specs unmodified |
| 2 | `npx eslint "src/modules/places/**/*.ts" --max-warnings=0` | `apps/api` | **0** | clean |
| 3 | `npx tsc -p tsconfig.json --noEmit` | `apps/api` | **0** | clean — nothing referenced the removed symbol |
| 4 | sweep passes 1–4 | repo root | 0 | §10 |

All three declared `validation_commands` executed. No failures, so no failure classification
was required. Command 3 is meaningful evidence here: had any TypeScript consumer existed, its
removal would have surfaced as a compile error.

## 22. Security Review
Net positive. The repository now contains one fewer slug-keyed reader that returns unpublished
content, so the GAP-02/04 exposure can no longer be reintroduced by wiring up an existing
method — a future public card-by-slug reader must be written deliberately, and the comment left
at the removal site tells the author to decide the status filter at that moment.

No authentication, authorization, guard, ownership or validation behaviour changed. Removing an
uncalled method cannot regress runtime security; the benefit is entirely in reduced future risk.

## 23. Performance Review
No runtime impact: the method never executed. Removing it marginally reduces the compiled
surface. Nothing measured, because there is nothing to measure.

## 24. Observability Review
Not applicable to the approved PLACE-007 task. No runtime behaviour, log, metric, trace, audit
event or health check changed.

## 25. Rollback or Recovery Review
Restore the seven removed lines — the body is identical in shape to `getCardById` but keyed on
`slug`, and both the original SQL and the reasoning are preserved in §13 of this report and in
the comment at the removal site. No schema, data, migration or contract is involved, so rollback
is complete and non-destructive.

## 26. Deviations From the Approved Task
1. **A comment was left at the removal site** rather than deleting the code silently. Strictly,
   the task authorized removal; the comment is a small addition, justified because three prior
   reports flagged this method and a bare deletion would lose the reasoning for the fourth
   reader. It also warns against the plausible-but-wrong "add a status filter" fix.
2. Nothing else. No other method touched, no spec edited, no finding bundled in.

## 27. Remaining Findings
| id | finding | evidence | disposition |
|---|---|---|---|
| F-23 | **`apps/api/dist/` contains stale compiled output in the working tree** — sweep pass 1 found the removed method still present at `dist/modules/places/repositories/places.repository.js:63`. Since the repo is not under version control, it is unclear whether this is meant to be tracked; either way it is now out of date and could mislead a future sweep. | sweep pass 1 | backlog — housekeeping, unrelated to GAP-13; **not** removed here (out of scope) |
| F-24 | `getCardById` has no status filter and five callers. That is correct for the moderation flow, but it is undocumented — the next reader may mistake it for the same defect just removed. A one-line comment would settle it. | §13 | backlog — trivial, but a code change outside the authorized single method |

AC7 is satisfied by these: no other unused method was found during the sweep (pass 3 resolved
every `*BySlug` identifier to a live consumer), and the two incidental observations above are
recorded rather than acted on.

F-1 … F-22 from earlier reports remain open and unchanged.

## 28. Risks
| risk | severity | note |
|---|---|---|
| No DB-backed validation anywhere in the workstream | high | unchanged |
| `node_modules/@phuquochub/shared-types` is a FAT32 copy | high | unchanged |
| FAT32 removable volume, no VCS | high | unchanged — and it directly limited this task: no history to consult, and no diff to prove the change surface |
| Stale `dist/` misleading future analysis | low | F-23 |

## 29. Acceptance-Criteria Evaluation
| # | Criterion | Mandatory | Result | Evidence |
|---|---|---|---|---|
| AC1 | Repository-wide sweep covering apps/packages/seeds/scripts/tests incl. dynamic access | yes | **PASS** | §10, four passes |
| AC2 | Status-filter divergence documented precisely, incl. what a public caller would receive | yes | **PASS** | §13 |
| AC3 | One option chosen and justified from evidence | yes | **PASS** | §14 — removal, four supporting points |
| AC4 | Change confined to `getCardBySlug`; no other method modified | yes | **PASS** | §12 change register; §21 cmd 3 |
| AC5 | jest / eslint / tsc exit 0 | yes | **PASS** | §21 cmds 1–3 |
| AC6 | GAP-02/04 regression specs still pass, unmodified | yes | **PASS** | §21 cmd 1 — 51/51, specs untouched |
| AC7 | Other unused methods recorded, not removed | **no** | **PASS** | §27 — none found; two incidental findings recorded |

All six mandatory criteria **PASS**. The optional criterion also passes.

## 30. Recommended Delivery-State Transition
Applied: `current.task: PLACE-008`, `status: ready`. Gates unchanged.

## 31. Selected PLACE-008 Task
`docs/delivery/tasks/PLACE-008.yaml` — **"Add PlacesService unit tests for the Place write and
moderation paths"**, type `testing`. `workstreams/place.yaml` still lists service and
controller tests as absent, and records the blocker as *"service imports @phuquochub/utils"* —
which PLACE-005 made moot, since the package is materialized in `node_modules` and both `tsc`
and `jest` resolve it. `places.service.ts` holds the approve/archive/update transitions, which
this very task showed are the reason `getCardById` skips the status filter — and they have **no
unit coverage at all**. That is now the largest untested surface reachable without a database.

## 32. Explicit Non-Claims
This report does **not** claim any unverified: **production deployment, production migration
application, production backfill completion, complete external consumer migration, complete
cache propagation, complete search reindexing, complete event propagation, canary success,
hypercare completion, production stabilization, compatibility retirement readiness, or legacy
schema cleanup readiness.**

Specifically not claimed: the consumer sweep is **static analysis only** — no running system was
observed, no VCS history existed to consult, and no reflective or dynamically-constructed
invocation could have been detected (though none of the bracket-access patterns that would
enable one appear anywhere in the codebase). No database, HTTP server or browser was started;
no `nest build`; no telemetry; and no git branch, commit or diff.
