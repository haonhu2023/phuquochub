# PLACE-007 — Evidence Index (GAP-13 getCardBySlug, 2026-07-22)

Backs `docs/delivery/reports/PLACE-007-dead-code-report.md`. Concise references only.

## State / task authority
| id | category | source | result | proves | limitations |
|---|---|---|---|---|---|
| S-1 | state | `state.yaml` `current` | `task: PLACE-007`, `status: ready` at preflight | state-authorized before any edit | — |
| S-2 | task authority | `tasks/PLACE-007.yaml` | 7 ACs, 3 validation commands, 3 stop conditions, rollback | scope/criteria authority | — |

## Dependency
| id | category | source | result | proves | limitations |
|---|---|---|---|---|---|
| DEP-1 | dependency | `evidence/PLACE-006-opening-hours-evidence-index.md` VO-1..VO-5 | jest 30/30, mutation check 9 failures, eslint + tsc exit 0 | PLACE-006 complete on executed evidence | — |

## Consumer sweep (AC1)
| id | category | command | result | proves | limitations |
|---|---|---|---|---|---|
| SW-1 | analysis | `grep -rn "getCardBySlug" apps packages docs delivery scripts` | 1 source occurrence (`places.repository.ts:123`, its own definition); `apps/api/dist/...js:63` stale artifact; ~20 delivery/BUILD doc mentions | no source consumer | text search |
| SW-2 | analysis | `grep -rnE "\['getCardBySlug'\]\|\[\"getCardBySlug\"\]\|CardBySlug"` | no bracket access anywhere | no dynamic/partial-name binding | cannot detect a runtime-built string |
| SW-3 | analysis | `grep -rnoE "[A-Za-z_]+BySlug" apps packages` | 52 hits; Place-side resolve to `getDetailBySlug` (7), `existsBySlug` (2), vertical modules' own `getBySlug`; **zero** to `getCardBySlug` | no near-miss or aliased consumer; also proves no OTHER `*BySlug` method is unused (AC7) | — |
| SW-4 | analysis | `grep -rn "PlacesRepository" --include=*.module.ts` | `places.module.ts:27` **exports** `PlacesRepository`; Hotel/Restaurant/Tour reuse `PlacesModule` | the provider is cross-module reachable, so file-local absence would NOT have sufficed — combined with SW-3, no module calls it | — |
| SW-5 | analysis | `git` history | **UNAVAILABLE** — repository is not under version control | provenance/intent cannot be recovered; recorded, not inferred | hard limitation |

## Prior authority
| id | category | source | result | proves | limitations |
|---|---|---|---|---|---|
| PA-1 | analysis | `BUILD_002_PLACE_PRIORITY_REMEDIATION.md:193` | "Nên xử lý khi có caller, hoặc **xoá nếu xác nhận là dead code**" | removal was pre-authorized conditional on confirmation, which SW-1..SW-4 supplied | — |
| PA-2 | analysis | `BUILD_002:51,58` | the method was consciously skipped in the GAP-02/04 fix because it had no caller | the defect is long-known and thrice-deferred | — |
| PA-3 | analysis | `BUILD_001:212`; `PLACE-001-...baseline.md:263,275` | GAP-13 registered P3: unused + missing status filter | the finding predates this task | — |

## Comparison (AC2)
| id | category | source | result | proves | limitations |
|---|---|---|---|---|---|
| CMP-1 | security | `places.repository.ts` `getCardBySlug` (before) | `WHERE p.slug = $1 AND p.deleted_at IS NULL` | no status filter → would have returned draft/pending/archived to a public caller | — |
| CMP-2 | security | `getDetailBySlug:145-156` | `... AND p.status = $2` (PUBLISHED) | the public slug path is correctly filtered — the GAP-02/04 fix | — |
| CMP-3 | domain | `getCardById:131-137` + `places.service.ts:124,142,166,186,204` | no status filter, 5 callers, all moderation (approve/archive/update) | omitting the filter is **correct** for privileged reads → "just add the filter" would encode an unsettled intent | — |

## Implementation
| id | category | source | result | proves | limitations |
|---|---|---|---|---|---|
| IMP-1 | implementation | `places.repository.ts` | `getCardBySlug` removed; 7-line comment left recording why, and why not to add a status filter instead | AC3, AC4 | — |

## Validation output — executed 2026-07-22
| id | category | command | cwd | exit | result | classification |
|---|---|---|---|---|---|---|
| VO-1 | test | `npx jest places` | `apps/api` | **0** | **51/51 pass, 5 suites** | GAP-02/04 regression specs **unmodified** → AC6 |
| VO-2 | lint | `npx eslint "src/modules/places/**/*.ts" --max-warnings=0` | `apps/api` | **0** | clean | — |
| VO-3 | type-check | `npx tsc -p tsconfig.json --noEmit` | `apps/api` | **0** | clean | independent confirmation of SW-1..SW-4: any TypeScript consumer would have failed to compile |
| VO-4 | test | `places.repository.spec.ts` reference check (via SW-3) | — | — | spec names `getDetailBySlug` ×5, `getCardBySlug` ×0 | no spec asserted the removed method → none needed editing |

VO-3 is the strongest single piece of evidence: static text search plus a clean full-package
type-check together make an unnoticed compile-time consumer effectively impossible.

## Not executed / not claimed
| id | category | item | result | limitations |
|---|---|---|---|---|
| NX-1 | analysis | runtime observation of the method being called | NOT RUN | no server started; reflective invocation could not be ruled out empirically (SW-2 found no bracket-access pattern) |
| NX-2 | state | VCS history / `git diff` | UNAVAILABLE | no `.git`; provenance and change surface cannot be proven by diff |
| NX-3 | build | `nest build` | NOT RUN | not a declared validation command; `dist/` remains stale (F-23) |
| NX-4 | integration | e2e or HTTP checks | NOT RUN | no database (Docker not installed) |

## Findings carried
| id | category | source | result | limitations |
|---|---|---|---|---|
| F-23 | build | SW-1 | `apps/api/dist/` holds stale compiled output still containing the removed method | housekeeping; out of PLACE-007 scope, deliberately not touched |
| F-24 | domain | CMP-3 | `getCardById`'s deliberate lack of a status filter is undocumented; next reader may mistake it for the defect just removed | trivial comment, but outside the single authorized method |
