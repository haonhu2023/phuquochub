# PLACE-003 — Evidence Index

Backs `docs/delivery/reports/PLACE-003-execution-report.md`.
Result: **BLOCKED at preflight.** Concise references only.

> **Historical.** This records the earlier attempt, made when no `PLACE-003.yaml` existed and
> `state.yaml` still authorized PLACE-002. PLACE-003 was later defined and **executed on
> 2026-07-22** — see `PLACE-003-migration-evidence-index.md` and
> `reports/PLACE-003-migration-report.md`. Rows below describe that earlier state, not current truth.

## State / task authority
| id | category | source | result | proves | limitations |
|---|---|---|---|---|---|
| S-1 | state | `docs/delivery/state.yaml:22-26` | `task: PLACE-002`, `status: in_progress` | state does not authorize PLACE-003 (§29) | — |
| S-2 | state | `docs/delivery/state.yaml:57` | `gates.implementation: not_started` | no implementation gate passed | — |
| A-1 | task authority | `ls docs/delivery/tasks/` → `PLACE-001.yaml`, `PLACE-002.yaml` | `PLACE-003.yaml` absent | mandatory task input missing (§29) | directory listing only; no VCS history to confirm it never existed |
| A-2 | task authority | `docs/delivery/tasks/PLACE-002.yaml:101-107` | `next_candidate_task` = GAP-06 partial index | a candidate title exists | candidate ≠ executable definition; no scope/criteria/rollback |

## Dependency status
| id | category | source | result | proves | limitations |
|---|---|---|---|---|---|
| DEP-1 | task authority | `docs/delivery/tasks/PLACE-002.yaml:7,18` | `status: in_progress`; `mandatory_criteria_unmet: [AC1, AC3]` | PLACE-003's dependency is not completed | — |
| DEP-2 | test | `reports/PLACE-002-implementation-report.md` §19 | AC1 PARTIAL, AC3 NOT VERIFIED | dependency incomplete on evidence, not label | — |
| DEP-3 | task authority | `reports/PLACE-002-implementation-report.md` §20 | "do **not** create PLACE-003.yaml" | absence of the task file is a correct prior state | — |
| DEP-4 | documentation | `workstreams/place.yaml:119-123` | `next_task: PLACE-002` (in progress) | workstream agrees with state | — |

## Environment (root blocker)
| id | category | source / command | result | proves | limitations |
|---|---|---|---|---|---|
| ENV-1 | build | `node -v` / `npm -v` / `npx -v` | `command not found` (exit 127) | no Node runtime → jest/eslint/tsc unrunnable | — |
| ENV-2 | build | `which node`; `ls "/c/Program Files/nodejs"` | not on PATH; directory absent | runtime not merely unlinked — not installed | other install locations not exhaustively searched |
| ENV-3 | state | `git status` | `fatal: not a git repository` | no branch/commit/diff available to any task | — |
| ENV-4 | state | `state.yaml:20,64-72` | FAT-family volume; `node_modules/@phuquochub` empty | workspace packages unlinked | recorded in PLACE-001/002; not re-measured here |

## Repository truth check
| id | category | source | result | proves | limitations |
|---|---|---|---|---|---|
| R-1 | implementation | existence check of `apps/api/src/common/geo-bounds.ts`, `modules/places/dto/places.dto{,.spec}.ts`, `modules/geo/dto/geo.dto{,.spec}.ts` | all 5 EXIST | PLACE-002 implementation is physically present, not claimed-only | existence only — contents not executed or type-checked |

## Change surface
| id | category | source | result | proves | limitations |
|---|---|---|---|---|---|
| C-1 | implementation | change register (report §9-§10) | 0 source files, 0 state files modified; 2 delivery docs created | no scope was executed; no unrelated work overwritten | no git diff available (ENV-3) |
| C-2 | rollback | report §20 | delete the 2 files in §9 | recovery is complete and non-destructive | — |

## Not executed
| id | category | source / command | result | proves | limitations |
|---|---|---|---|---|---|
| NX-1 | test | `cd apps/api && npx jest places.dto` | NOT EXECUTED — ENV-1 | PLACE-002 AC3 still unverified | — |
| NX-2 | test | `cd apps/api && npx jest geo.dto` | NOT EXECUTED — ENV-1 | as above | — |
| NX-3 | lint | `npx eslint "src/modules/{places,geo}/**/*.ts"` | NOT EXECUTED — ENV-1 | lint unverified | — |
| NX-4 | type-check | `npx tsc -p tsconfig.json --noEmit` | NOT EXECUTED — ENV-1 | types unverified | — |
| NX-5 | migration | none | NOT EXECUTED | no migration authored, amended, or applied | — |

## Open findings carried forward
| id | category | source | result | proves | limitations |
|---|---|---|---|---|---|
| OF-1 | domain | `PLACE-002.yaml:24` | Phú Quốc bbox PROVISIONAL | owner confirmation outstanding before PLACE-002 completion | — |
| OF-2 | performance | `workstreams/place.yaml:96` GAP-06 | partial index still missing | remains the leading PLACE-003 candidate once unblocked | requires Postgres + Node to verify via EXPLAIN |
| OF-3 | contract | `workstreams/place.yaml:98` GAP-05/10 | unadjudicated | parked by design, not auto-scheduled | needs owner decision |
