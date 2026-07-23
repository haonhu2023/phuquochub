# PLACE-009 — Evidence Index (PlacesController route-boundary tests, 2026-07-22)

Backs `docs/delivery/reports/PLACE-009-controller-tests-report.md`. Concise references only.

## State / task authority
| id | category | source | result | proves | limitations |
|---|---|---|---|---|---|
| S-1 | state | `state.yaml` `current` | `task: PLACE-009`, `status: ready` at preflight | state-authorized before any edit | — |
| S-2 | task authority | `tasks/PLACE-009.yaml` | 8 ACs, 4 validation commands, 3 stop conditions | scope/criteria authority | — |

## Dependency
| id | category | source | result | proves | limitations |
|---|---|---|---|---|---|
| DEP-1 | dependency | `evidence/PLACE-008-service-tests-evidence-index.md` VO-1..VO-5 | jest 18/18 + 69/69, eslint + tsc exit 0, service byte-unchanged | PLACE-008 complete on executed evidence | — |

## Analysis
| id | category | source | result | proves | limitations |
|---|---|---|---|---|---|
| AN-1 | test | `modules/places/` listing | no `places.controller.spec.ts` existed | the gap was real | — |
| AN-2 | security | `public.decorator.ts:3` | `export const IS_PUBLIC_KEY = 'isPublic'` | key available as a constant → AC8 achievable without duplicating a literal | — |
| AN-3 | security | `require-permissions.decorator.ts:3` | `export const PERMISSIONS_KEY = 'requiredPermissions'` | same | — |
| AN-4 | contract | `places.controller.ts:29-76` | 3 `@Public()` reads; 4 `@RequirePermissions` writes; `@HttpCode(CREATED)` on POST; `:id/revisions` declared before `:slug` | the surface worth pinning | static read |
| AN-5 | test | `Reflect.getMetadata` against prototype handlers | metadata readable **without** booting Nest | stop condition 1 never fired; suite stays a fast unit test | reads declarations, not runtime routing |

## Implementation
| id | category | source | result | proves | limitations |
|---|---|---|---|---|---|
| IMP-1 | test | `places.controller.spec.ts` (new) | 23 specs: 7 public, 7 permission, 1 HttpCode, 1 ordering/path, 7 delegation | AC2–AC6 | asserts declarations, not guard execution |
| IMP-2 | security | same, permission block | expected strings written as **independent literals**, not read back from the controller | a production typo cannot agree with itself and pass | — |
| IMP-3 | security | same, delegation block | write routes asserted to pass `user.sub`, not the whole `AuthPrincipal` | protects the ADR-016 actor id and created_by/updated_by | — |
| IMP-4 | implementation | `places.controller.ts` | **byte-unchanged** | AC7; stop condition 3 never fired | — |

## Route boundary asserted
| handler | route | public | permission |
|---|---|---|---|
| `list` | `GET /places` | yes | asserted `undefined` |
| `listRevisions` | `GET /places/:id/revisions` | yes | asserted `undefined` |
| `getBySlug` | `GET /places/:slug` | yes | asserted `undefined` |
| `create` | `POST /places` | no | `Place.Create` |
| `update` | `PATCH /places/:id` | no | `Place.Edit.Managed` |
| `archive` | `DELETE /places/:id` | no | `Place.Archive` |
| `approve` | `POST /places/:id/approve` | no | `Place.Approve` |

Both directions are asserted (reads public **and** permission-free; writes non-public **and**
carrying exactly one named permission), so neither loosening nor tightening passes unnoticed.

## Validation output — executed 2026-07-22
| id | category | command | cwd | exit | result | classification |
|---|---|---|---|---|---|---|
| VO-1 | test | `npx jest places.controller` | `apps/api` | **0** | **23/23 pass**, first run | — |
| VO-2 | test | `npx jest places` | `apps/api` | **0** | **92/92 pass, 7 suites** (69 prior + 23 new) | no pre-existing spec disturbed |
| VO-3 | lint | `npx eslint "src/modules/places/**/*.ts" --max-warnings=0` | `apps/api` | **0** | clean | — |
| VO-4 | type-check | `npx tsc -p tsconfig.json --noEmit` | `apps/api` | **0** | clean | — |

## Not executed / not claimed
| id | category | item | result | limitations |
|---|---|---|---|---|
| NX-1 | security | guard / PDP actually denying an unauthorized caller | NOT TESTED | deliberately out of scope — a correct declaration with a broken guard would still pass |
| NX-2 | API | any real HTTP request | NOT RUN | no Nest boot, no supertest; 201 is asserted from metadata, not from a response |
| NX-3 | integration | routing resolution of `/places/<uuid>/revisions` vs `/places/<slug>` | NOT RUN | ordering asserted from declaration order only — **F-27** |
| NX-4 | build | `nest build`, e2e | NOT RUN | Docker not installed |
| NX-5 | state | `git diff` | UNAVAILABLE | repository not under version control |

## Findings carried
| id | category | source | result | limitations |
|---|---|---|---|---|
| F-27 | test | spec "thứ tự route" | ordering is proven from `Object.getOwnPropertyNames(prototype)` — reliable for TS class methods and the order Nest walks, but **not** a routing test | only e2e would prove real resolution; folded into the DB-backed/e2e task |
| F-28 | security | `places.controller.ts:43-47` | `:slug` has no pipe or format constraint — any string reaches the service | not a vulnerability (parameterized query + status filter), but the one unvalidated path param; needs a slug-format decision first |
