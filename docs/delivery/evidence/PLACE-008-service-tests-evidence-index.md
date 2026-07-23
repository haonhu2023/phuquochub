# PLACE-008 — Evidence Index (PlacesService unit tests, 2026-07-22)

Backs `docs/delivery/reports/PLACE-008-service-tests-report.md`. Concise references only.

## State / task authority
| id | category | source | result | proves | limitations |
|---|---|---|---|---|---|
| S-1 | state | `state.yaml` `current` | `task: PLACE-008`, `status: ready` at preflight | state-authorized before any edit | — |
| S-2 | task authority | `tasks/PLACE-008.yaml` | 8 ACs, 4 validation commands, 3 stop conditions | scope/criteria authority | — |

## Dependency
| id | category | source | result | proves | limitations |
|---|---|---|---|---|---|
| DEP-1 | dependency | `evidence/PLACE-007-dead-code-evidence-index.md` VO-1..VO-3 | jest 51/51, eslint + tsc exit 0 | PLACE-007 complete on executed evidence | — |

## Analysis
| id | category | source | result | proves | limitations |
|---|---|---|---|---|---|
| AN-1 | test | file listing of `modules/places/` | **no `places.service.spec.ts`** existed | the gap was real | — |
| AN-2 | test | `events.service.spec.ts:1-26` | direct construction + `createMock<ConstructorParameters<...>[N]>` + `jest.mock` of the mapper | the convention to follow (AC1) — not invented | — |
| AN-3 | test | `test/helpers/create-mock.ts` | `LooseMock<T>` keeps class identity while making methods `jest.Mock` | mocks assign to constructor params without `any` casts | — |
| AN-4 | domain | `places.service.ts:101-218` | create forces PENDING; update maps snake→camel; archive/approve emit ADR-016 audit | the behaviours worth pinning | static read |

## Implementation
| id | category | source | result | proves | limitations |
|---|---|---|---|---|---|
| IMP-1 | test | `places.service.spec.ts` (new) | 18 specs across list/create/update/archive/approve/getBySlug | AC2–AC6 | every collaborator mocked — no SQL, no HTTP |
| IMP-2 | test | same, audit assertions | `toMatchObject` on event/entityType/entityId/actorId/permission/context | AC4, AC8 — argument-level, not call-count | — |
| IMP-3 | implementation | `places.service.ts` | **byte-unchanged** | AC7; stop condition 2 never fired | — |

## Validation output — executed 2026-07-22
| id | category | command | cwd | exit | result | classification |
|---|---|---|---|---|---|---|
| VO-1 | test | `npx jest places.service` | `apps/api` | **0** | **18/18 pass**, first run | — |
| VO-2 | test | `npx jest places` | `apps/api` | **0** | **69/69 pass, 6 suites** (51 prior + 18 new) | no pre-existing spec disturbed |
| VO-3 | lint | `npx eslint "src/modules/places/**/*.ts" --max-warnings=0` | `apps/api` | **0** | clean | — |
| VO-4 | type-check | `npx tsc -p tsconfig.json --noEmit` | `apps/api` | **0** | clean | — |
| VO-5 | build | `@phuquochub/utils` resolution under jest | — | — | **RESOLVES** — the slug-collision spec drives `create() → uniqueSlug() → slygify()` and asserts the result *starts with the base slug*, which only holds if `slugify` really ran | discharges stop condition 1 and disproves the stale `place.yaml` blocker (F-25) |

VO-5 is the notable one: the recorded blocker was disproven by exercising the import through a
real code path, not by asserting resolution abstractly.

## Not executed / not claimed
| id | category | item | result | limitations |
|---|---|---|---|---|
| NX-1 | integration | any SQL emitted by the mocked repositories | NOT EXERCISED | unit tests prove call correctness, **not** query correctness |
| NX-2 | observability | audit events reaching a store | NOT VERIFIED | `AuditService` is mocked |
| NX-3 | persistence | wiki_revision actually persisted | NOT VERIFIED | `RevisionsService` is mocked |
| NX-4 | security | guards / permission decorators admitting the right callers | NOT TESTED | controller layer — selected as PLACE-009 |
| NX-5 | build | `nest build`, e2e | NOT RUN | Docker not installed; not declared commands |
| NX-6 | state | `git diff` | UNAVAILABLE | repository not under version control |

## Findings carried
| id | category | source | result | limitations |
|---|---|---|---|---|
| F-25 | test | VO-5 vs `place.yaml` testing_surface | the "blocked: service imports @phuquochub/utils" note was **stale**; carried since PLACE-001 without retest | resolved by this task; entry corrected in `place.yaml` |
| F-26 | domain | `places.service.ts:170-181` | update revisions record field *names* only, no before/after values — prior values are unrecoverable from a revision | adequate for WF-14 today; matters before Sprint 4 builds approval on it |
