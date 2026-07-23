# PLACE-019 — Evidence Index (pre-BUILD readiness remediation, 2026-07-23)

Backs `docs/delivery/reports/PLACE-019-pre-build-readiness-report.md`.

## Authority
| id | source | result | proves |
|---|---|---|---|
| S-1 | owner instruction "Authorize Pre-BUILD Repository Readiness Remediation" | explicit, scoped | authorization for this operation |
| S-2 | `state.yaml` before | `current.task: none` | nothing displaced; no active task interrupted |
| S-3 | `decisions/ADR-DELIVERY-001.md` | state.yaml is the execution gate | a task record was required BEFORE any change → PLACE-019 created + activated |
| S-4 | `tasks/` listing | PLACE-019 is the next unused id | identifier not derived from arithmetic alone |
| S-5 | 18 task files | PLACE-001..PLACE-018 all `completed` | no completed task reopened or modified |

## Baseline (verified directly this task)
| id | check | baseline |
|---|---|---|
| B-1 | `git rev-parse --is-inside-work-tree` | **exit 128** — not a repository |
| B-2 | governance YAML parse | **1 failure** — `project-registry.yaml` (82:3) |
| B-3 | task-schema survey | 17/18 have `run_status`; **PLACE-001 does not** |
| B-4 | dependency / report / evidence integrity | PASS |
| B-5 | `apps/api/dist/` | **1 file** — only `tsconfig.tsbuildinfo`; no build output |
| B-6 | `@phuquochub/*` | `shared-types`, `utils` present as FAT32 copies, not links |
| B-7 | F-33 4-pass sweep | `PlacesRepository.bbox()` at `:302`, **0 consumers** |

## Git (Phase B)
| id | command | exit | result |
|---|---|---|---|
| G-1 | `git init` | **0** | `.git/` created |
| G-2 | `git -c safe.directory=F:/PhuQuochub rev-parse --is-inside-work-tree` | **0** | `true` |
| G-3 | `git -c safe.directory=… status --short` | **0** | 22 top-level entries |
| G-4 | leak grep over status | — | **no** `node_modules/`, `dist/`, `coverage/`, `.turbo/`, `*.log` — ignore rules effective |
| G-5 | `.env*` inventory | — | only `.env.example` (intentionally un-ignored); placeholders only (`change-me-*`, `minioadmin`) — **no production secret** |
| G-6 | `.gitignore` category audit | — | 9/9 patterns COVERED ⇒ **no modification necessary** |

Constraint honoured: Git's FAT32 dubious-ownership guard was worked around with a
**non-persistent per-command `-c safe.directory`**, because the documented fix is a global config
change and the authorization forbids rewriting user Git configuration. **No commit, no remote, no
push, no user-config change.**

## Governance repairs (Phase C)
| id | item | before | after |
|---|---|---|---|
| R-1 | `project-registry.yaml` | unparseable — `env_template` as a mapping key inside a sequence | `infrastructure` is a mapping with `paths:`; all values + comments preserved verbatim |
| R-2 | `PLACE-001.yaml` | no `run_status` | added, historically accurate: `validation: not_executed`, results transcribed from the PLACE-001 report §16/§21, `schema_note` marking it retroactive |
| R-3 | `state.yaml` gates | 3 comments contradicted by later evidence | refreshed; **all 3 VALUES unchanged** (`partial`, `in_progress`, `in_progress`) |

R-2 is **schema normalization, not re-execution** — no claim upgraded, status and meaning preserved.
R-3 refreshes make the comments *more* restrictive about what is proven, never less.

## F-33 (Phase D)
| id | pass | result |
|---|---|---|
| F-1 | bare `.bbox(` | only `geoService.bbox(dto)` — GeoService's method, not the repository's |
| F-2 | dynamic bracket access | none |
| F-3 | all `bbox` identifiers | `GeoService.bbox` → `placesRepo.bboxClusters` (`geo.service.ts:40`), never `placesRepo.bbox` |
| F-4 | all spec files | none |
| F-5 | removal | `PlacesRepository.bbox()` deleted |
| F-6 | regression spec | `sut.bbox` undefined AND `bboxClusters` still a function |
| F-7 | compiled output | 13 async methods in `dist/.../places.repository.js`; **`bbox` absent**; `ST_MakeEnvelope` count = 1 (bboxClusters' legitimate use) |

F-7 is the strongest evidence: the removal is visible in the *built artifact*, not just the source.

## Build (Phase E)
| id | check | result |
|---|---|---|
| BLD-1 | `npx nest build` | **exit 0** — first successful run recorded in this repository |
| BLD-2 | `dist/` file count | **120** (baseline 1) |
| BLD-3 | production entry point | `apps/api/dist/main.js`, 1424 bytes |
| BLD-4 | entry matches `start:prod` | `"start:prod": "node dist/main.js"` — target exists |
| BLD-5 | workspace resolution | `@phuquochub/*` resolved from FAT32 copies without error |
| BLD-6 | source authority | `dist/` gitignored and regenerated; `src/` remains authoritative |

## Validation (Phase F)
| id | command | exit | result |
|---|---|---|---|
| VO-1 | governance suite (26 YAML, 8 categories) | **0** | **0 failures** (baseline 2) |
| VO-2 | `npx tsc -p tsconfig.json --noEmit` | **0** | clean |
| VO-3 | `npx nest build` | **0** | 120 artifacts |
| VO-4 | `npx jest` (full) | **0** | **210/210, 29 suites** (209 + 1 F-33 spec) |
| VO-5 | `npx eslint places + geo --max-warnings=0` | **0** | clean |
| VO-6 | `dist/` artifact verification | **0** | `main.js` present, `bbox` absent |

Web typecheck NOT run — no shared contract touched (F-33 is an internal repository method,
invisible to `@phuquochub/shared-types`). Docker NOT re-probed — result already established.

## Not executed / not claimed
| id | item | result | limitation |
|---|---|---|---|
| NX-1 | any commit | **NOT MADE** | governance does not require one; authorization forbids it absent that requirement ⇒ **no rollback point exists** |
| NX-2 | `safe.directory` exception | **NOT SET** | global config change, outside authorization; Git needs it per-command until the user sets it or relocates to NTFS |
| NX-3 | production startup | NOT RUN | compilation ≠ runtime; no service started |
| NX-4 | database / migration / HTTP / authz / geospatial / EXPLAIN / e2e | NOT RUN | Docker absent (F-2 unchanged) |
| NX-5 | Docker installation | **NOT AUTHORIZED** | explicitly excluded by the owner |
| NX-6 | BUILD task | **NOT CREATED** | explicitly excluded; none exists |

## Findings
| id | result | disposition |
|---|---|---|
| **F-33** | `PlacesRepository.bbox()` removed; 0 consumers across 4 passes; absent from compiled output | **RESOLVED** |
| **G-1** | `project-registry.yaml` parses; values preserved | **RESOLVED** |
| **G-2** | PLACE-001 schema normalized with historically accurate values | **RESOLVED** |
| **G-3** | 3 stale gate comments refreshed; no gate value changed | **RESOLVED** |
| **F-3** | repository is a Git work tree, but **no commit** and `safe.directory` unresolved | **PARTIALLY CLEARED** — still blocks BUILD |
| **F-2** | Docker not installed | **OPEN, UNCHANGED** — still blocks BUILD |

Build reproducibility moves from PARTIALLY PROVEN to **PROVEN for compilation**; production startup
remains **NOT VERIFIED**.
