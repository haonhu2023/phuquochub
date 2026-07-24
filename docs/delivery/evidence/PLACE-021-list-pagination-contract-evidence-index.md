# PLACE-021 — Evidence Index (list-pagination contract, 2026-07-24)

Backs `docs/delivery/reports/PLACE-021-list-pagination-contract-report.md`. All commands on the D:
checkout under pinned **Node v20.20.2 / npm 10.8.2**.

## Authority
| id | source | proves |
|---|---|---|
| S-1 | OD-B1 (B1-A) + ADR-010 Accept, `decisions/OWNER-DECISIONS-2026-07-24.md` | offset ratified; cursor not adopted; reconcile docs to runtime |
| S-2 | `tasks/PLACE-021.yaml` | scope = GAP-05/10 (listPlaces) only; B2..B7 out of scope |
| S-3 | ADR-010 status `Proposed → Accepted` (`decision-register.md`, ADR-010 addendum) | versioning/deprecation policy now governs |

## Runtime-vs-doc reconciliation (the core finding)
| id | evidence | result |
|---|---|---|
| R-1 | `main.ts:19-21` — `ValidationPipe({whitelist,transform,forbidNonWhitelisted})`, no `errorHttpStatusCode` | validation failure default = **400** |
| R-2 | `all-exceptions.filter.ts:64-70` — maps 400 → `VALIDATION_ERROR` | envelope code for invalid params |
| R-3 | `places.dto.ts:98-113` — `page`/`limit` `@IsInt @Min(1)`, no `@Max` on limit | `<1`/non-int → 400; `>100` passes DTO |
| R-4 | `pagination.ts:18-21` — `clampLimit(…,20,100)` | `>100` clamped to 100, default 20 |
| R-5 | live HTTP (booted prod build) | `page=0`→400, `page=abc`→400, `limit=0`→400, `cursor`→400 `VALIDATION_ERROR` |
| **Conclusion** | OpenAPI documented **422**; runtime is **400** | corrected docs **422→400** (runtime authoritative per B1-A; code unchanged) |

## Changes (docs + tests only)
| id | file | change |
|---|---|---|
| C-1 | `docs/api/openapi.yaml` | listPlaces: desc ratified-offset; `page`/`limit`/`price_range` 422→400; add `'400': BadRequest`; deprecated `status`/`sort`/`cursor` kept, descriptions updated (cursor decided-against for v1) |
| C-2 | `docs/api/api.md` | offset line 422→400 + ratified note; cursor line → not adopted for v1 |
| C-3 | `apps/api/test/places-list-contract.e2e-spec.ts` (new) | 11 contract tests, production-equivalent pipe |

## Contract tests (new spec, 11/11)
| id | case | assertion | result |
|---|---|---|---|
| T-1 | default (no params) | 200; meta.page=1, pageSize=20 | ✅ |
| T-2 | meta shape | page/pageSize/total/totalPages/timestamp; totalPages=ceil(total/pageSize); data≤pageSize | ✅ |
| T-3 | explicit page=2 limit=5 | 200; meta reflects; data≤5 | ✅ |
| T-4 | limit=500 | 200; pageSize clamped to 100 | ✅ |
| T-5 | page=0 | 400 `VALIDATION_ERROR` | ✅ |
| T-6 | page=abc | 400 | ✅ |
| T-7 | limit=0 | 400 | ✅ |
| T-8..10 | status / sort / cursor | 400 `VALIDATION_ERROR` (forbidNonWhitelisted) | ✅ |
| T-11 | category filter | 200 (valid param accepted) | ✅ |

## Verification ladder
| id | command | result |
|---|---|---|
| V-1 | openapi `js-yaml` load | PARSE OK |
| V-2 | governance YAML parse | 27/27, 0 fail |
| V-3 | `eslint src+test --max-warnings=0` | exit 0 |
| V-4 | `tsc -p tsconfig.json --noEmit` | exit 0 |
| V-5 | `jest` (unit) | **210/210** (unchanged) |
| V-6 | `jest --config test/jest-e2e.json` | **33/33** (22 + 11 new) |
| V-7 | `turbo run build --force` (tsbuildinfo purged) | 4/4, 0 cached |
| V-8 | artifacts | main.js/app.module.js/core present; 153==153 |
| V-9 | boot + `/api/health` | 200, db=up, redis=up |
| V-10 | web `/` | 200 |
| V-11 | HTTP pagination (prod build) | all cases pass (§R-5 + default/explicit/clamp) |
| V-12 | terminate + ports | PIDs killed; 4000/3000 FREE |

## Runtime-unchanged proof
| id | evidence | result |
|---|---|---|
| U-1 | `git diff --name-only` scope | only `docs/**` + new test file; NO `apps/api/src/**` |
| U-2 | existing `places` unit/e2e specs | UNMODIFIED and green (210 unit incl. places.*.spec) |
| U-3 | `places.dto.ts` / `places.repository.ts` / controller / service | byte-unchanged |

## GAP resolution
| id | before | after |
|---|---|---|
| GAP-05 | openapi advertises status/sort/cursor; not implemented | **RESOLVED** — offset ratified; params documented deprecated→400 |
| GAP-10 | list-param contract vs impl mismatch (page/limit) | **RESOLVED** — docs match runtime; 422→400 corrected; contract tests pin it |

## Not claimed
| id | item | disposition |
|---|---|---|
| NX-1 | cursor pagination | NOT implemented (explicitly excluded) |
| NX-2 | B2..B7 | NOT implemented |
| NX-3 | 422→400 on other endpoints | NOT touched (out of scope; follow-up finding) |
| NX-4 | release readiness | NOT asserted |
