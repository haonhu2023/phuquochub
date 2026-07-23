# PLACE-004 — Evidence Index

Backs `docs/delivery/reports/PLACE-004-execution-report.md`.
Result: **BLOCKED at preflight.** Concise references only.

## State / task authority
| id | category | source | result | proves | limitations |
|---|---|---|---|---|---|
| S-1 | state | `docs/delivery/state.yaml:22-26` (re-read from disk this session) | `task: PLACE-002`, `status: in_progress` | state does not authorize PLACE-004 (§31) | — |
| S-2 | state | `docs/delivery/state.yaml:57` | `gates.implementation: not_started` | no implementation gate passed | — |
| A-1 | task authority | `ls docs/delivery/tasks/` → `PLACE-001.yaml`, `PLACE-002.yaml` | `PLACE-004.yaml` absent | mandatory task input missing | listing only; no VCS history |
| A-2 | task authority | same listing | `PLACE-003.yaml` also absent | dependency chain has a two-task gap | — |
| A-3 | task authority | `docs/delivery/tasks/PLACE-002.yaml:101-107` | `next_candidate_task` names PLACE-003 only | no PLACE-004 candidate exists anywhere | candidate ≠ executable definition |

## Governance
| id | category | source | result | proves | limitations |
|---|---|---|---|---|---|
| G-1 | documentation | `docs/delivery/decisions/ADR-DELIVERY-001.md` §Decision | `state.yaml` is the execution-control source; numbering is not a gate | authoring PLACE-003/004 to satisfy the sequence is forbidden | ADR is provisional, unratified by a human owner |
| G-2 | documentation | ADR-DELIVERY-001 §Context | BUILD_003–014 blocked identically by numbering-ahead-of-state | current divergence is the same failure mode | historical analogy, not proof of intent |

## Dependency chain
| id | category | source | result | proves | limitations |
|---|---|---|---|---|---|
| DEP-1 | dependency | `reports/PLACE-003-execution-report.md` §1, §24 | PLACE-003 BLOCKED; never defined or executed | PLACE-004's direct dependency is not completed | — |
| DEP-2 | dependency | `evidence/PLACE-003-evidence-index.md` A-1, DEP-1 | PLACE-003 preflight block corroborated | not a label-only assessment | — |
| DEP-3 | dependency | `tasks/PLACE-002.yaml:7,18` | `in_progress`; `mandatory_criteria_unmet: [AC1, AC3]` | transitive dependency incomplete | — |
| DEP-4 | test | `reports/PLACE-002-implementation-report.md` §19 | AC1 PARTIAL, AC3 NOT VERIFIED | incompleteness is evidence-based | — |
| DEP-5 | documentation | `workstreams/place.yaml:119-123` | `next_task: PLACE-002` (in progress) | workstream agrees with state | — |

## Environment (root blocker)
| id | category | source / command | result | proves | limitations |
|---|---|---|---|---|---|
| ENV-1 | build | `node -v`, `npx -v` (re-tested this session) | `command not found` (exit 127) | jest/eslint/tsc unrunnable; PLACE-002 cannot advance | — |
| ENV-2 | state | `git status` | `fatal: not a git repository` (exit 128) | no branch/commit/diff available to any task | — |
| ENV-3 | build | `state.yaml:20,64-72` | FAT-family volume; `node_modules/@phuquochub` empty | workspace packages unlinked | recorded in PLACE-001/002; not re-measured here |

## Change surface
| id | category | source | result | proves | limitations |
|---|---|---|---|---|---|
| C-1 | implementation | change register (report §10-§11) | 0 source files, 0 state files modified; 2 delivery docs created | no scope executed; no unrelated or pre-existing work overwritten | no git diff available (ENV-2) |
| C-2 | rollback | report §22 | delete the 2 files in §10 | recovery complete and non-destructive | — |

## Not executed
| id | category | source / command | result | proves | limitations |
|---|---|---|---|---|---|
| NX-1 | test | `cd apps/api && npx jest places.dto` | NOT EXECUTED — ENV-1 | PLACE-002 AC3 still unverified | — |
| NX-2 | test | `cd apps/api && npx jest geo.dto` | NOT EXECUTED — ENV-1 | as above | — |
| NX-3 | lint | `npx eslint "src/modules/{places,geo}/**/*.ts" --max-warnings=0` | NOT EXECUTED — ENV-1 | lint unverified | — |
| NX-4 | type-check | `npx tsc -p tsconfig.json --noEmit` | NOT EXECUTED — ENV-1 | types unverified | — |
| NX-5 | migration | none | NOT EXECUTED | no migration authored, amended, or applied | — |
| NX-6 | build | none | NOT EXECUTED | no build performed | — |

## Open findings carried forward
| id | category | source | result | proves | limitations |
|---|---|---|---|---|---|
| OF-1 | domain | `tasks/PLACE-002.yaml:24` | Phú Quốc bbox PROVISIONAL | owner confirmation outstanding before PLACE-002 completion | — |
| OF-2 | performance | `workstreams/place.yaml:96` GAP-06 | partial index still missing | leading PLACE-003 candidate once unblocked | needs Postgres + Node to verify via EXPLAIN |
| OF-3 | contract | `workstreams/place.yaml:98` GAP-05/10 | unadjudicated | parked by design; needs owner decision | — |
| OF-4 | security | `evidence/PLACE-002-evidence-index.md` SEC-1 | `radius @Max` implemented, not runtime-verified | anti-unbounded-scan guard unproven | — |
