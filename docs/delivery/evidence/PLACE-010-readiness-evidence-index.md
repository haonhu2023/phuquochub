# PLACE-010 — Evidence Index (release-readiness assessment, 2026-07-22)

Backs `docs/delivery/reports/PLACE-010-release-readiness-assessment.md`. Concise references only.

## State / task authority
| id | category | source | result | proves | limitations |
|---|---|---|---|---|---|
| S-1 | state | `state.yaml` `current` | `task: PLACE-010`, `status: ready` at preflight | state-authorized | — |
| S-2 | task authority | `tasks/PLACE-010.yaml` | 9 ACs, 4 validation commands, 4 stop conditions | scope/criteria authority | — |

## Dependency
| id | category | source | result | proves | limitations |
|---|---|---|---|---|---|
| DEP-1 | dependency | `evidence/PLACE-009-controller-tests-evidence-index.md` VO-1..VO-4 | jest 23/23 + 92/92, eslint + tsc exit 0, controller byte-unchanged | PLACE-009 complete on executed evidence | — |

## Documents read (AC1)
| id | category | source | result | proves | limitations |
|---|---|---|---|---|---|
| DOC-1 | release readiness | 9 execution reports + 9 evidence indexes, listed by path in assessment §3 | all located by task ID | the assessment rests on the full record, not a sample | suffixes vary per task |
| DOC-2 | release readiness | `reports/PLACE-00{3,4,5,7,8,9}-execution-report.md`, `evidence/PLACE-00{3,4,5}-evidence-index.md` | identified as **historical block reports**, not execution records | prevents citing a stale blocked state as current truth | an ID-only lookup is ambiguous for these — F-10 |

## Validation baseline — re-run 2026-07-22 (AC7)
| id | category | command | cwd | exit | result | classification |
|---|---|---|---|---|---|---|
| VO-1 | test | `npx jest places` | `apps/api` | **0** | **92/92 pass, 7 suites** | current, not quoted |
| VO-2 | test | `npx jest migrations` | `apps/api` | **0** | **11/11 pass, 3 suites** | current, not quoted |
| VO-3 | type-check | `npx tsc -p tsconfig.json --noEmit` | `apps/api` | **0** | clean | — |
| VO-4 | type-check | `npx tsc --noEmit` | `apps/web` | **0** | clean | — |

Suite is green, so the assessment is not published on top of a regression (stop condition 4).

## Re-verification of carried claims (AC6)
| id | category | command | result | proves | limitations |
|---|---|---|---|---|---|
| RV-1 | data quality | grep `PROVISIONAL` in `apps/api/src/common/geo-bounds.ts` | block intact | F-1 still open — bounds remain seed-derived and owner-unconfirmed **while actively enforced** | — |
| RV-2 | migration | `Get-Command docker` | **docker NOT FOUND** | PLACE-003's migration is still `implemented_not_executed` — it *cannot* have been applied here | proves absence on this machine only |
| RV-3 | build | `(Get-Item node_modules\@phuquochub\shared-types).LinkType` / `.Attributes` | `LinkType` empty; attributes `Directory` (no `ReparsePoint`) | F-5 confirmed: a real directory = a copy, not a symlink; it will go stale on the next package edit | — |

These three were re-measured rather than copied forward, which is the difference between an
assessment and a summary.

## Assessment outputs
| id | category | source | result | proves | limitations |
|---|---|---|---|---|---|
| AS-1 | release readiness | assessment §4 | per-layer coverage map, 103 specs, each with a "does not prove" column | AC2 | — |
| AS-2 | release readiness | assessment §7 | 13 gates classified; **none PROVEN**; each unproven item names its required environment | AC3, AC4 | — |
| AS-3 | release readiness | assessment §8 | F-1..F-28 consolidated: **5 BLOCKS_RELEASE**, 18 NON_BLOCKING, 5 RESOLVED | AC5 | classification is judgement, stated with reasons |
| AS-4 | release readiness | assessment §9 | work ordered by unblocking power (Docker → VCS → owner decisions → typing → hygiene) | AC9 | — |
| AS-5 | release readiness | assessment §10 | **NOT READY FOR RELEASE**; workstream stays INCOMPLETE | AC8 | closure deliberately not attempted — its criteria fail today |
| AS-6 | implementation | change register | **no product code modified** — only two new delivery documents plus state/workstream updates | AC8 | — |

## Not executed / not claimed
| id | category | item | result | limitations |
|---|---|---|---|---|
| NX-1 | deployment | any deploy, migration run, or environment acquisition | NOT ATTEMPTED | explicitly out of scope |
| NX-2 | workstream closure | closure assessment | NOT PERFORMED | criteria fail while DB-backed validation is absent; would have been a fabricated pass |
| NX-3 | performance | `EXPLAIN` / any measurement | NOT RUN | Docker absent (RV-2) |
| NX-4 | security | guard/PDP enforcement | NOT TESTED | needs a running Nest app |
| NX-5 | state | `git diff` | UNAVAILABLE | F-3 — repository not under version control |
