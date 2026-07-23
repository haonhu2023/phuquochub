# PLACE-002 — Evidence Index

Backs `docs/delivery/reports/PLACE-002-implementation-report.md`. Concise references only.

## State / task authority
| id | source | result | proves | limitations |
|---|---|---|---|---|
| S-1 | `docs/delivery/state.yaml:22-26` | active task PLACE-002, status ready | task authorized | pointer left unchanged (no completion) |
| S-2 | `docs/delivery/tasks/PLACE-002.yaml` | full task spec | scope/criteria authority | — |

## Dependency
| id | source | result | proves | limitations |
|---|---|---|---|---|
| DEP-1 | `docs/delivery/tasks/PLACE-001.yaml:7` | status completed | PLACE-001 done | — |
| DEP-2 | `docs/delivery/reports/PLACE-001-place-domain-persistence-baseline.md` §20 GAP-07 | report exists | dependency evidence (not label-only) | — |

## Requirement (SSOT)
| id | source | result | proves | limitations |
|---|---|---|---|---|
| REQ-1 | `docs/api/api.md:184` | "tọa độ trong Phú Quốc" | boundary required | no numeric bbox given |
| REQ-2 | `docs/product/modules/place.md:102` | "nằm trong **bao Phú Quốc** (validation biên)" | boundary required | no numeric bbox |
| REQ-3 | seed `1720001600000-SeedPlacesExpansion.ts` (lng ~103.85–104.05, lat ~10.02–10.33) | real coords | basis for PROVISIONAL bbox | derived, not authoritative |

## Implementation
| id | source | result | proves | limitations |
|---|---|---|---|---|
| IMP-1 | `apps/api/src/common/geo-bounds.ts` | PROVISIONAL `PHU_QUOC_BOUNDS` + `@IsLatInPhuQuoc`/`@IsLngInPhuQuoc` | reusable bound validator; owner-flagged | bbox provisional |
| IMP-2 | `apps/api/src/modules/places/dto/places.dto.ts` GeoPointDto | bound decorators added, global guards kept | AC1 (create/update path) | not runtime-verified |
| IMP-3 | `apps/api/src/modules/geo/dto/geo.dto.ts` | Nearby/Bbox bound decorators; `radius @Max(50000)` | AC1 + AC2 | not runtime-verified |
| IMP-4 | `apps/api/src/modules/geo/geo.service.ts:8` | `MAX_RADIUS_M = 50000` | `@Max` matches service cap | — |

## Contract / scope integrity
| id | source | result | proves | limitations |
|---|---|---|---|---|
| SCOPE-1 | change register (report §11) | 5 files, all in `in_scope_files` | AC4 (no entity/migration/service/etc change) | no git diff (no VCS) |

## Tests
| id | source | result | proves | limitations |
|---|---|---|---|---|
| T-1 | `apps/api/src/modules/places/dto/places.dto.spec.ts` (+6 GeoPointDto cases) | specs written; **executed 12/12 PASS** (VO-7) | AC3 coverage | DTO layer only; no DB-backed geospatial check |
| T-2 | `apps/api/src/modules/geo/dto/geo.dto.spec.ts` (new) | specs written; **executed 9/9 PASS** (VO-8) | AC3 coverage (nearby/bbox/radius) | DTO layer only; no DB-backed geospatial check |

## Validation output

**Superseded 2026-07-22.** VO-1..VO-4 below record the original blocked run. VO-5..VO-10
record the actual execution after a portable Node runtime was obtained. The blocked rows are
retained for history, not as current status.

### Original (blocked) run
| id | source/command | result | proves | limitations |
|---|---|---|---|---|
| VO-1 | `command -v node npx` | NOT FOUND | no Node runtime | blocks all JS tooling |
| VO-2 | `cd apps/api && npx jest places.dto` | NOT EXECUTED (`npx: command not found`) | specs unrun | environment |
| VO-3 | `cd apps/api && npx jest geo.dto` | NOT EXECUTED | specs unrun | environment |
| VO-4 | `npx eslint … / npx tsc --noEmit` | NOT EXECUTED | lint/type-check unrun | no Node; FAT32 |

### Executed run — 2026-07-22
| id | category | source/command | result | proves | limitations |
|---|---|---|---|---|---|
| VO-5 | environment | `winget install --id OpenJS.NodeJS.LTS …` | **FAILED, exit 1602** — installer requested admin; UAC could not be answered in a non-interactive session | system-wide MSI install is not possible from this session | package downloaded and hash-verified before the failure |
| VO-6 | environment | Portable extract of official `node-v24.18.0-win-x64.zip` (nodejs.org) to `%LOCALAPPDATA%\node-portable` | `node -v` → **v24.18.0**; `npm -v` → **11.16.0** | Node ≥ 20 requirement (root `engines`) satisfied without admin | not on system PATH; must be prepended per shell |
| VO-7 | test | `node …/jest.js places.dto` (cwd `apps/api`) | **PASS — 12/12, exit 0** | AC1 create/update path + AC3: in-bounds accepted, out-of-bounds lat/lng rejected, boundary inclusive, just-outside rejected | DTO layer only; no DB |
| VO-8 | test | `node …/jest.js geo.dto` (cwd `apps/api`) | **PASS — 9/9, exit 0** | AC1 nearby/bbox + AC2 + AC3: radius 60000 > 50000 rejected, missing radius still valid, bbox edge outside PQ rejected | DTO layer only; no DB |
| VO-9 | lint | `node …/eslint.js "src/modules/places/**/*.ts" "src/modules/geo/**/*.ts" --max-warnings=0` | **exit 0**, no output | no lint error or warning in the changed modules | scoped to places+geo, not repo-wide |
| VO-10 | type-check | `node …/tsc -p tsconfig.json --noEmit` (cwd `apps/api`) | **exit 0** | whole `apps/api` type-checks with the PLACE-002 changes | required the workspace-package workaround in VO-11 |
| VO-11 | environment | First `tsc` attempt, before workaround | **exit 2** — 6 × `TS2307 Cannot find module '@phuquochub/{shared-types,utils}'` | failures classified **environmental**, not `introduced_by_PLACE-002`: all 6 are in `common/filters`, `common/interceptors`, `common/pagination`, `categories/`, `events/`, `places.service` — **zero** in the 5 PLACE-002 files | root cause is FAT32's inability to create npm workspace symlinks (`node_modules/@phuquochub/` was empty) |
| VO-12 | environment | `node_modules/@phuquochub/{shared-types,utils}` populated with copied `package.json` + prebuilt `dist/` | VO-10 then returned exit 0 | confirms VO-11 was purely a link-resolution problem | a copy, not a symlink — goes stale if `packages/*` source changes; re-copy or `npm install` on NTFS |

## Security / performance
| id | source | result | proves | limitations |
|---|---|---|---|---|
| SEC-1 | `geo.dto.ts` `radius @Max` | bounded scan input | prevents anon unbounded `ST_DWithin` | not load-tested |
| PERF-1 | `geo-bounds.ts` numeric compares | O(1) per field | negligible cost | not measured |
