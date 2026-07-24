# PLACE-022 — Evidence Index (privileged card-access hardening, 2026-07-24)

Backs `docs/delivery/reports/PLACE-022-privileged-card-access-report.md`. All commands on the D:
checkout under pinned **Node v20.20.2 / npm 10.8.2**.

## Authority
| id | source | proves |
|---|---|---|
| S-1 | owner instruction 2026-07-24 — "activation and execution of PLACE-022 — OD-B2 / F-24" | activation authorized |
| S-2 | `decisions/OWNER-DECISIONS-2026-07-24.md` OD-B2 (B2-A) | rename + arch test; behaviour preserved; no status filter added |
| S-3 | `tasks/PLACE-022.yaml` | scope = F-24 only |

## Call graph (Phase 2, verified — not name-based)
| id | evidence | result |
|---|---|---|
| C-1 | `grep getCardById` (pre-change) | 5 callers, all in `places.service.ts` (create/update/archive/approve) + mock/specs |
| C-2 | `places.controller.ts` routes | `create`/`update`/`archive`/`approve` = `@RequirePermissions(...)`, NOT `@Public` |
| C-3 | `@Public` routes | `list`→`repo.list`, `listRevisions`→revisions, `getBySlug`→`repo.getDetailBySlug` (status=published) |
| C-4 | `auth.module.ts:32-33` | global `APP_GUARD` JwtAuthGuard + PermissionsGuard |
| C-5 | reachability | **No `@Public` route reaches the privileged method** ⇒ rename conceals no authz problem |

## Rename (Phase 3)
| id | file | change |
|---|---|---|
| R-1 | `places.repository.ts` | `getCardById` → `getCardByIdIncludingInactive`; SQL/params/return identical; comment adds authorization precondition + F-24/PLACE-022 note |
| R-2 | `places.service.ts` | 5 call sites renamed (create:160, update:178+203, archive:223, approve:241) |
| R-3 | `places.service.spec.ts` | mock + 13 refs renamed |
| R-4 | repo-wide grep | only remaining `getCardById` is the historical comment; new name has 20 refs across 3 files |

## Architecture test (Phase 4)
`apps/api/src/modules/places/places-privileged-access.arch.spec.ts` — 6 tests, unit suite, no DB.
| id | test | result |
|---|---|---|
| A-1 | privileged method exists on PlacesRepository | ✅ |
| A-2 | old `getCardById` absent from repository | ✅ |
| A-3 | exactly {create,update,archive,approve} call it (allowlist) | ✅ |
| A-4 | no `@Public` route transitively reaches it (controller→service→repo) | ✅ |
| A-5 | no controller calls the privileged repo method directly | ✅ |
| A-6 | self-check documents approved callers | ✅ |
| A-MUT | mutation: `@Public` route → `placesService.archive()` | tests A-4 + A-6 **FAIL** naming the path; restore → 6/6 |
| A-3x | determinism | 6/6 on runs 1, 2, 3 |

Design authorities: runtime metadata (`IS_PUBLIC_KEY` via reflect) + static source reachability +
approved-caller allowlist. Not satisfied by a rename alone; deterministic; clear failure messages.

## Verification ladder (Phase 5)
| id | command | result |
|---|---|---|
| V-1 | scope (`git status`) | only `apps/api/src/modules/places/**` + `docs/**` |
| V-2 | governance YAML parse | PASS |
| V-3 | `eslint` (places, then full `src/**`) | exit 0 |
| V-4 | `tsc -p tsconfig.json --noEmit` | exit 0 |
| V-5 | affected specs (repo + service) | 40/40 |
| V-6 | arch spec | 6/6 (+ mutation + 3×) |
| V-7 | `jest` (full unit) | **216/216**, 30 suites |
| V-8 | `jest --config test/jest-e2e.json` | **33/33**, 6 suites |
| V-9 | `turbo run build --force` (tsbuildinfo purged) | 4/4, 0 cached |
| V-10 | artifacts | main.js/app.module.js/core; 153==153; no `*.spec.js` in dist; web `.next` |
| V-11 | boot + `/api/health` | 200, db=up, redis=up |
| V-12 | web `/` | 200 |
| V-13 | public list statuses | `["published"]`, 49 rows — excludes inactive |
| V-14 | non-existent detail | 404 (status-filtered path intact) |
| V-15 | unauthenticated write | 401 (privileged path gated) |
| V-16 | terminate + ports | PIDs killed; 4000/3000 FREE |

## Runtime-unchanged proof
| id | evidence | result |
|---|---|---|
| U-1 | SQL/params/return of the method | byte-identical (pure rename) |
| U-2 | `places.service.spec` / `places.repository.spec` | pass, assertions unmodified except the name |
| U-3 | public list / detail / write behaviour (live) | unchanged (published-only, 404, 401) |
| U-4 | `git diff` scope | no schema/migration/contract/DTO/guard file |

## Not claimed
| id | item | disposition |
|---|---|---|
| NX-1 | status filter on the method | NOT added (returns inactive by design) |
| NX-2 | Place authorization redesign | NOT performed |
| NX-3 | B3..B7 | NOT implemented |
