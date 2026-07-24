# PLACE-025 — Runtime persistence authority reconciliation (B7 / OD-B7 / GAP-15)

- **Task:** PLACE-025 (`docs/delivery/tasks/PLACE-025.yaml`)
- **Type:** documentation_governance
- **Date:** 2026-07-24
- **Outcome:** **COMPLETED — GAP-15 RESOLVED**
- **Authority:** OD-B7 (B7-A) + explicit owner authorization to activate & execute PLACE-025, 2026-07-24
- **Evidence index:** `docs/delivery/evidence/PLACE-025-persistence-authority-evidence-index.md`

## 1. What & why

Two persistence artifacts coexisted in the repository — TypeORM entities/migrations (implemented,
executed) and `prisma/schema.prisma` (a draft data-model reference, never executed) — with no single
citable, durable record formally closing which one holds runtime authority. GAP-15 flagged this as a
documentation/governance ambiguity. OD-B7/B7-A: **record TypeORM as the runtime persistence authority
and Prisma as reference-only, documentation-only, zero runtime change.**

## 2. Investigation — evidence-based answers (Phase 2)

| # | Question | Answer | Evidence |
|---|---|---|---|
| 1 | Which persistence layer actually runs in production? | **TypeORM** | `apps/api/src/core/database/database.module.ts` — `TypeOrmModule.forRootAsync`, `synchronize: false`, `autoLoadEntities: true` |
| 2 | Which owns migrations? | **TypeORM** | 20 forward-only migrations in `apps/api/src/core/database/migrations/`; a dedicated `data-source.ts` DataSource for the CLI (`migration:run`/`revert`/`generate` in `apps/api/package.json`) |
| 3 | Which owns entities? | **TypeORM** | `@Entity`-decorated classes across `apps/api/src/modules/*/entities/*.entity.ts` |
| 4 | Does Prisma execute anywhere? | **No** | zero `prisma`/`@prisma/client` package dependency in any `package.json`; no binary in `node_modules/.bin`; `.github/workflows/ci.yml` has zero Prisma mentions; no root/`apps/api` script invokes it |
| 5 | Referenced by runtime dependencies? | **No** | same as above — not installed anywhere |
| 6 | Referenced only as documentation? | **Yes** | `prisma/schema.prisma`'s own header states *"KHÔNG sinh migration, KHÔNG sinh code, KHÔNG sinh API"*; 4 TypeORM entity/enum files cite it in comments purely for field-naming cross-reference ("khớp prisma/schema.prisma") |
| 7 | Any generated Prisma client used? | **No** | the schema declares a `generator client` block, but it has never been run — zero `@prisma/client` import and no generated artifact anywhere in the repo |
| 8 | Does removing runtime authority from Prisma change behaviour? | **No** | Prisma never held runtime authority to begin with — this is a pure documentation/governance record |

**Stop-condition check:** repository evidence fully supports OD-B7; nothing contradicts it. Investigation did **not** stop.

## 3. Already-consistent documentation (no change needed)

- `README.md:98` — *"prisma/schema.prisma là artifact thiết kế cũ — không dùng để sinh code (đã chọn TypeORM)."*
- `docs/delivery/project-registry.yaml:45` — *"reference model (ADR-013); NOT the runtime ORM."*
- `enterprise-engineering-framework/project-profile/repository-map.md:146` — *"stale/orphaned artifact... Actual persistence layer is TypeORM."*
- `docs/architecture/architecture.md:130` — *"ORM: TypeORM — hỗ trợ PostGIS geometry tốt hơn Prisma."*

## 4. Genuine ambiguity found and reconciled

`docs/data/database.md` §11's heading — *"Danh mục thực thể (Entity Catalog) — chuẩn bị sinh Prisma"*
("preparing to generate Prisma") — implied an active, forward-looking intent to generate a Prisma
schema from this catalog, contradicting the settled authority determination. **Reworded** to drop that
framing and added a one-paragraph clarifying note citing the ADR-013 addendum (§5 below). The entity
catalog table itself (32 rows) is **unchanged**.

## 5. Implementation (documentation/governance only)

| File | Change |
|---|---|
| `docs/data/database.md` | §11 heading reworded (dropped "chuẩn bị sinh Prisma"); added a clarifying note citing the ADR-013 addendum |
| `docs/99-decisions/ADR-013-prisma-readiness.md` | New closing **Addendum: Runtime Persistence Authority (OD-B7, 2026-07-24)** section recording the determination; ADR's `Superseded` status and every other section **left untouched** |
| `docs/delivery/workstreams/place.yaml` | GAP-15 moved from `known_gaps` to `resolved_gaps` with full evidence; `known_gaps` now empty; `place_025_status` added |
| `docs/delivery/state.yaml` | `current`, `proposed_tasks`, `completed_tasks`, `next_action` updated |

**Not touched (as required):** `prisma/schema.prisma` (zero diff — confirmed by `git status`), every TypeORM entity, every migration, every repository/service/SQL file, every API contract/DTO/OpenAPI file, every existing test.

## 6. Documentation validation (Phase 4)

A repository-wide sweep for statements implying Prisma is runtime authority (`grep` across `docs/`,
`prisma/`, `README.md` for generation/execution language) found **no remaining contradiction** after
the §11 rework — every other hit was either already-correct, a match in this task's own new records,
or an unrelated match (general codegen-scaffolding language in `sprint-plan.md`/`README.md` unrelated
to Prisma). No speculative documentation was introduced.

## 7. Verification (Node v20.20.2 / npm 10.8.2)

| Check | Result |
|---|---|
| `prisma/schema.prisma` diff | **none** (untouched) |
| Governance YAML parse | ✅ |
| Full lint | ✅ |
| Full typecheck | ✅ |
| Full unit | ✅ **221/221**, 30 suites — **identical to PLACE-024** |
| Full API e2e | ✅ **44/44**, 8 suites — **identical to PLACE-024** |
| Clean build (`turbo --force`, tsbuildinfo purged) | ✅ 4/4, 0 cached |
| Artifacts | ✅ `main.js`/`app.module.js`/`core/`; **153==153** (unchanged count) |
| Boot API + `/api/health` | ✅ 200, `database: up`, `redis: up (PONG)` |
| Process / port | ✅ terminated; **4000 FREE** |

Identical unit/e2e totals to the pre-task baseline (PLACE-024's 221/44) are the direct proof that this
task changed **zero runtime behaviour** — no test was added, removed, or altered, because none needed
to be: nothing executable changed.

## 8. GAP-15 resolution

`decision_status: APPROVED` (OD-B7) · `implementation_status: DONE` (PLACE-025) ·
`validation_status: PASSED` (identical unit/e2e totals + clean build + live health check) →
**GAP-15 RESOLVED**. Runtime persistence authority is unambiguous: TypeORM entities + migrations +
PostgreSQL. Prisma remains reference-only documentation, kept (not deleted) for its data-model
cross-reference value.

## 9. Non-claims

This task changes **no runtime behaviour**, does **not** modify, remove, or regenerate
`prisma/schema.prisma`, and does **not** implement OD-B5 or OD-B6. It records, at the
architecture-documentation layer, an authority determination that was already true in practice.
