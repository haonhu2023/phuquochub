# PLACE-025 — Evidence Index (runtime persistence authority reconciliation, 2026-07-24)

Backs `docs/delivery/reports/PLACE-025-persistence-authority-report.md`. All commands on the D:
checkout under pinned **Node v20.20.2 / npm 10.8.2**.

## Authority
| id | source | proves |
|---|---|---|
| S-1 | owner instruction 2026-07-24 — "activation and execution of PLACE-025 — OD-B7 / GAP-15" | activation authorized |
| S-2 | `decisions/OWNER-DECISIONS-2026-07-24.md` OD-B7 (B7-A) | TypeORM authoritative; Prisma reference-only; no runtime change |
| S-3 | `tasks/PLACE-025.yaml` | scope = documentation/governance only |
| S-4 | PLACE-024 completed (`f8c4750`), full suites green | dependency satisfied |

## Runtime layer evidence (Phase 2)
| id | evidence | result |
|---|---|---|
| R-1 | `apps/api/src/core/database/database.module.ts` | `TypeOrmModule.forRootAsync`, `synchronize: false`, `autoLoadEntities: true` |
| R-2 | `apps/api/src/core/database/data-source.ts` | dedicated CLI DataSource; same connection params |
| R-3 | `ls apps/api/src/core/database/migrations/*.ts \| wc -l` | **20** real migrations |
| R-4 | `@Entity` classes | present across `apps/api/src/modules/*/entities/*.entity.ts` |

## Prisma non-execution evidence (Phase 2)
| id | evidence | result |
|---|---|---|
| P-1 | `grep prisma` in root + `apps/api` `package.json` | **no hits** — not a dependency anywhere |
| P-2 | `ls node_modules/.bin \| grep -i prisma` | **no hits** — no binary installed |
| P-3 | `grep -i prisma .github/workflows/ci.yml` | **no hits** — never invoked in CI |
| P-4 | `grep @prisma/client\|PrismaClient` across `apps`/`packages` | **no hits** — no generated client imported anywhere |
| P-5 | `find . -ipath "*generated*prisma*"` | **no hits** — no generated client artifact exists |
| P-6 | `prisma/schema.prisma` header (lines 1-23) | self-declares *"KHÔNG sinh migration, KHÔNG sinh code, KHÔNG sinh API"* |
| P-7 | `generator client { provider = "prisma-client-js" }` (schema.prisma) | declared but **never run** |
| P-8 | `packages/database/` contents | `.gitkeep` stubs only — empty, unimplemented |

## Already-consistent documentation (no change needed)
| id | location | statement |
|---|---|---|
| A-1 | `README.md:98` | "prisma/schema.prisma là artifact thiết kế cũ... đã chọn TypeORM" |
| A-2 | `docs/delivery/project-registry.yaml:45` | "reference model (ADR-013); NOT the runtime ORM" |
| A-3 | `enterprise-engineering-framework/project-profile/repository-map.md:146` | "stale/orphaned artifact... Actual persistence layer is TypeORM" |
| A-4 | `docs/architecture/architecture.md:130` | "ORM: TypeORM — hỗ trợ PostGIS geometry tốt hơn Prisma" |

## Genuine ambiguity found and reconciled
| id | location | before | after |
|---|---|---|---|
| G-1 | `docs/data/database.md §11` heading | "Entity Catalog — chuẩn bị sinh Prisma" (implies active future codegen) | heading reworded; clarifying note added citing ADR-013 addendum; **32-row catalog table unchanged** |

## Implementation (documentation/governance only)
| id | file | change |
|---|---|---|
| C-1 | `docs/data/database.md` | §11 heading + one clarifying paragraph |
| C-2 | `docs/99-decisions/ADR-013-prisma-readiness.md` | new closing **Addendum** section; `Superseded` status + every prior section untouched |
| C-3 | `docs/delivery/workstreams/place.yaml` | GAP-15 `known_gaps` → `resolved_gaps`; `place_025_status` added |
| C-4 | `docs/delivery/state.yaml` | `current`/`proposed_tasks`/`completed_tasks`/`next_action` updated |

## Untouched (confirmed via git diff — Phase 3 constraints honored)
| id | item | proof |
|---|---|---|
| U-1 | `prisma/schema.prisma` | `git status --short prisma/` → **empty** (zero diff) |
| U-2 | Every TypeORM entity/migration/repository/service/SQL file | absent from `git status` |
| U-3 | Every API contract/DTO/OpenAPI file | absent from `git status` |
| U-4 | Every existing test | none modified — unit/e2e totals identical to PLACE-024 |

## Documentation validation sweep (Phase 4)
| id | command | result |
|---|---|---|
| D-1 | repo-wide grep for Prisma-as-runtime language (post-change) | no remaining contradiction; all hits already-correct, this task's own new records, or unrelated |

## Verification ladder (Phase 5)
| id | command | result |
|---|---|---|
| V-1 | governance YAML parse | 27/27 (28 incl. new task file) |
| V-2 | `eslint` (full `src/**`) | exit 0 |
| V-3 | `tsc -p tsconfig.json --noEmit` | exit 0 |
| V-4 | `jest` (full unit) | **221/221**, 30 suites — **identical to PLACE-024** |
| V-5 | `jest --config test/jest-e2e.json` (full e2e) | **44/44**, 8 suites — **identical to PLACE-024** |
| V-6 | `turbo run build --force` (tsbuildinfo purged) | 4/4, 0 cached |
| V-7 | artifacts | main.js/app.module.js/core; **153==153** (unchanged) |
| V-8 | boot API + `/api/health` | 200, `database: up`, `redis: up (PONG)` |
| V-9 | terminate + port | PID killed; **4000 FREE** |

## Zero-runtime-impact proof
| id | evidence | result |
|---|---|---|
| Z-1 | unit test count | 221 before == 221 after |
| Z-2 | e2e test count | 44 before == 44 after |
| Z-3 | compiled artifact count | 153 before == 153 after |
| Z-4 | `git diff` scope | only `docs/99-decisions/**`, `docs/data/database.md`, `docs/delivery/**` |

## Not claimed
| id | item | disposition |
|---|---|---|
| NX-1 | prisma/schema.prisma modification | NOT done |
| NX-2 | any code/schema/migration/entity/API change | NOT done |
| NX-3 | OD-B5 (bbox), OD-B6 (index EXPLAIN) | NOT implemented (accepted-risk / deferred respectively) |
