# PLACE-005 — Evidence Index

Backs `docs/delivery/reports/PLACE-005-execution-report.md`.
Result: **BLOCKED at preflight** (third consecutive, same cause). Concise references only.

## State / task authority
| id | category | source | result | proves | limitations |
|---|---|---|---|---|---|
| S-1 | state | `docs/delivery/state.yaml:22-26` (re-read from disk this session) | `task: PLACE-002`, `status: in_progress` | state does not authorize PLACE-005 (§34) | — |
| S-2 | state | `docs/delivery/state.yaml:53-62` | `gates.implementation: not_started`; deployment/canary/hypercare/stabilization `not_started` | no gate advanced by any blocked attempt | — |
| A-1 | task authority | `ls docs/delivery/tasks/` → `PLACE-001.yaml`, `PLACE-002.yaml` | `PLACE-005.yaml` absent | mandatory task input missing | listing only; no VCS history |
| A-2 | task authority | same listing | `PLACE-004.yaml` and `PLACE-003.yaml` also absent | dependency chain has a three-task gap | — |
| A-3 | task authority | `tasks/PLACE-002.yaml:101-107` | `next_candidate_task` names PLACE-003 only | no PLACE-004/005 candidate exists anywhere | candidate ≠ executable definition |

## Dependency verification (§4 — evidence, not labels)
| id | category | source | result | proves | limitations |
|---|---|---|---|---|---|
| DEP-1 | dependency | `reports/PLACE-004-execution-report.md` §1, §26 | BLOCKED; never defined or executed | direct dependency not completed | — |
| DEP-2 | dependency | `reports/PLACE-003-execution-report.md` §1, §24 | BLOCKED; never defined or executed | transitive dependency not completed | — |
| DEP-3 | dependency | `evidence/PLACE-004-evidence-index.md`, `PLACE-003-evidence-index.md` | preflight blocks corroborated | assessment is evidence-based, not label-based | — |
| DEP-4 | dependency | `tasks/PLACE-002.yaml:7,18` + PLACE-002 report §19 | `in_progress`; AC1 PARTIAL, AC3 NOT VERIFIED | terminal dependency incomplete | — |
| DEP-5 | dependency | `state.yaml:82-91` | PLACE-001 completed with report + evidence index | only genuinely completed Place task | — |
| DEP-6 | documentation | `workstreams/place.yaml:119-123` | `next_task: PLACE-002` | workstream agrees with state | — |

## Governance
| id | category | source | result | proves | limitations |
|---|---|---|---|---|---|
| G-1 | documentation | `decisions/ADR-DELIVERY-001.md` §Decision | `state.yaml` is the execution-control source; numbering is not a gate | authoring PLACE-003/004/005 to satisfy the sequence is forbidden | ADR provisional, unratified by a human owner |
| G-2 | documentation | ADR-DELIVERY-001 §Context | BUILD_003–014 blocked by the same numbering-ahead-of-state pattern | current divergence is a recurrence, not a new failure | historical analogy |

## Environment (root blocker)
| id | category | source / command | result | proves | limitations |
|---|---|---|---|---|---|
| ENV-1 | build | `node -v` (re-tested this session) | `command not found` (exit 127) | jest/eslint/tsc unrunnable; PLACE-002 cannot advance | — |
| ENV-2 | state | `git status` | `fatal: not a git repository` (exit 128) | no branch/commit/diff available to any task | — |
| ENV-3 | build | `state.yaml:20,64-72` | FAT-family volume; `node_modules/@phuquochub` empty | workspace packages unlinked | recorded in PLACE-001/002; not re-measured |

## Change surface
| id | category | source | result | proves | limitations |
|---|---|---|---|---|---|
| C-1 | implementation | change register (report §11-§12) | 0 source files, 0 state files modified; 2 delivery docs created | no scope executed; no pre-existing or unrelated work overwritten | no git diff available (ENV-2) |
| C-2 | rollback | report §25 | delete the 2 files in §11 | recovery complete and non-destructive | — |

## Not executed
| id | category | source / command | result | proves | limitations |
|---|---|---|---|---|---|
| NX-1 | test | `cd apps/api && npx jest places.dto` | NOT EXECUTED — ENV-1 | PLACE-002 AC3 still unverified | — |
| NX-2 | test | `cd apps/api && npx jest geo.dto` | NOT EXECUTED — ENV-1 | as above | — |
| NX-3 | lint | `npx eslint "src/modules/{places,geo}/**/*.ts" --max-warnings=0` | NOT EXECUTED — ENV-1 | lint unverified | — |
| NX-4 | type-check | `npx tsc -p tsconfig.json --noEmit` | NOT EXECUTED — ENV-1 | types unverified | — |
| NX-5 | migration | none | NOT EXECUTED | no migration authored, amended, or applied | — |
| NX-6 | backfill | none | NOT APPLICABLE | no backfill designed or run | — |
| NX-7 | build | none | NOT EXECUTED | no build performed | — |

## Process findings
| id | category | source | result | proves | limitations |
|---|---|---|---|---|---|
| P-1 | documentation | `ls docs/delivery/reports/ evidence/` | 4 report/evidence pairs; PLACE-003/004 (and now 005) document blocks only | paperwork is outpacing engineering | — |
| P-2 | documentation | this report §30 | one action clears the whole chain (NTFS + Node ≥ 20 → run PLACE-002 validation) | further numbered prompts add no delivery value until then | recommendation, not a repository fact |

## Open findings carried forward
| id | category | source | result | proves | limitations |
|---|---|---|---|---|---|
| OF-1 | domain | `tasks/PLACE-002.yaml:24` | Phú Quốc bbox PROVISIONAL | owner confirmation outstanding | — |
| OF-2 | performance | `workstreams/place.yaml:96` GAP-06 | partial index still missing | leading PLACE-003 candidate once unblocked | needs Postgres + Node to verify via EXPLAIN |
| OF-3 | contract | `workstreams/place.yaml:98` GAP-05/10 | unadjudicated | parked by design; needs owner decision | — |
| OF-4 | security | `evidence/PLACE-002-evidence-index.md` SEC-1 | `radius @Max` implemented, not runtime-verified | anti-unbounded-scan guard unproven | — |
