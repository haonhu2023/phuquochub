# Enterprise Engineering Framework (EEF)
# 04 — Repository Profile

Version: 1.0.0
Status: Draft
Owner: Enterprise Architecture

## Purpose

Defines how the Enterprise Engineering Framework maps to this specific
repository — PhuQuocHub.

Every fact below is backed by a cited repository path or command output.
Where evidence was not available, the section says `NOT FOUND` rather than
inventing a value, per the EEF Evidence Requirements.

---

## Repository Identity

| Field | Value | Evidence |
|---|---|---|
| Repository Name | `phuquochub` | [package.json](../../package.json) `name` |
| Product Name | PhuQuocHub — "Wikipedia + Reddit + Google Maps cho Phú Quốc" | [package.json](../../package.json) `description` |
| Git Remote | **NONE** — no `.git` directory exists | `git status` → `fatal: not a git repository` |
| Default Branch | N/A — no git repository | same |
| Repository Type | Monorepo (npm workspaces + Turborepo) | [package.json](../../package.json) `workspaces`, [turbo.json](../../turbo.json) |
| Primary Language | TypeScript, `strict: true` | [tsconfig.base.json](../../tsconfig.base.json), [docs/standards/coding-standard.md](../../docs/standards/coding-standard.md) |
| Package Manager | npm `10.8.2` | [package.json](../../package.json) `packageManager` |
| Build System | Turborepo | [turbo.json](../../turbo.json) |

---

## Repository Layout

Verified top-level directories (excluding `node_modules`):

```
apps/api/          NestJS backend (real implementation, 173 source files)
apps/web/          Next.js 14 App Router frontend (real implementation, 47 source files)
packages/config/    shared eslint/prettier/tsconfig configs
packages/database/  placeholder only — src/.gitkeep, prisma/migrations/.gitkeep (unimplemented)
packages/shared-types/  @phuquochub/shared-types — api-response.ts, health.ts
packages/ui/        placeholder only — src/.gitkeep (unimplemented)
packages/utils/     @phuquochub/utils — slug.ts + test
docs/               SSOT design documentation (see Documentation Map below)
infrastructure/     docker/postgres, k8s, nginx — all placeholder only (.gitkeep)
prompts/            existing prompt library (INDEX.md, README.md) — Prompts 01, 29–34, 36
.claude/skills/     governance skills: ssot, Architecture Review, Documentation Freeze, Sprint Planner, Batch Generator
prisma/schema.prisma  DRAFT, self-declared non-authoritative — see Constraints
```

No top-level `services/`, `libraries/`, `scripts/`, or `tests/` directories.
Tests live colocated as `*.spec.ts` inside `apps/api/src/**` and
`apps/web/src/**`, plus `apps/api/test/` for e2e.

---

## Technology Stack

| Layer | Value | Evidence |
|---|---|---|
| Runtime | Node.js `>=20.0.0` | [package.json](../../package.json) `engines` |
| Backend framework | NestJS `^10.4.4` | [apps/api/package.json](../../apps/api/package.json) |
| Frontend framework | Next.js `^14.2.5` (App Router), React `^18.3.1` | [apps/web/package.json](../../apps/web/package.json) |
| Database | PostgreSQL + PostGIS (`postgis/postgis:16-3.4`) | [.github/workflows/ci.yml](../../.github/workflows/ci.yml), [docker-compose.yml](../../docker-compose.yml) |
| ORM | **TypeORM** `^0.3.20` — 18 real migrations exist | `apps/api/src/core/database/migrations/*.ts` |
| Cache | Redis via `ioredis ^5.4.1` | [apps/api/package.json](../../apps/api/package.json) |
| Queue | **NOT IMPLEMENTED** — `apps/api/src/jobs/{processors,queues}` exist only as `.gitkeep` placeholders | directory listing |
| Object storage | MinIO/S3 — planned, not yet active (`.env.example` comment: "dùng từ Sprint 5") | [.env.example](../../.env.example) |
| Map rendering | maplibre-gl `^4.5.0` (client-side library, not an external API integration) | [apps/web/package.json](../../apps/web/package.json) |
| Authentication | JWT (`@nestjs/jwt`), access/refresh secrets, bcrypt for hashing | `apps/api/src/modules/auth/`, `apps/api/src/modules/authz/` |
| Validation | `class-validator`, `class-transformer`, Joi (env validation) | [apps/api/package.json](../../apps/api/package.json), `apps/api/src/core/config/env.validation.ts` |

---

## Workspace Inventory

| Name | Path | Purpose | Key Dependencies | Public Interface |
|---|---|---|---|---|
| `@phuquochub/api` | `apps/api` | NestJS REST API backend | `@phuquochub/shared-types`, `@phuquochub/utils`, TypeORM, Redis | REST API — see [docs/api/api.md](../../docs/api/api.md), [docs/api/openapi.yaml](../../docs/api/openapi.yaml) |
| `@phuquochub/web` | `apps/web` | Next.js frontend | `@phuquochub/shared-types` | Web app routes under `apps/web/src/app/**` |
| `@phuquochub/shared-types` | `packages/shared-types` | Shared TS types | — | `api-response.ts`, `health.ts` |
| `@phuquochub/utils` | `packages/utils` | Shared utilities | — | `slug.ts` |
| `packages/config` | `packages/config` | Shared eslint/prettier/tsconfig | — | config files only |
| `packages/database` | `packages/database` | **Unimplemented** — reserved for future shared DB layer | — | none yet |
| `packages/ui` | `packages/ui` | **Unimplemented** — reserved for shared UI components | — | none yet |

---

## Validation Commands

All commands below are copied verbatim from repository manifests/CI — none invented.

**Root** ([package.json](../../package.json), turbo-orchestrated):
`build`, `dev`, `lint`, `test`, `typecheck`, `format`, `db:up` / `db:down` (docker compose)

**apps/api** ([apps/api/package.json](../../apps/api/package.json)):
`nest build`, `nest start --watch`, `eslint "src/**/*.ts" --max-warnings=0`,
`tsc -p tsconfig.json --noEmit`, `jest`, `jest --coverage`,
`jest --config ./test/jest-e2e.json`, `typeorm-ts-node-commonjs migration:run/revert/generate`

**apps/web** ([apps/web/package.json](../../apps/web/package.json)):
`next dev -p 3000`, `next build`, `next start -p 3000`, `next lint`,
`tsc --noEmit`, `jest --passWithNoTests`

**CI** ([.github/workflows/ci.yml](../../.github/workflows/ci.yml)):
Job 1 (`build-test`): `npm ci` → `npm run typecheck` → `npm run lint` → `npm run build` → `npm test`
Job 2 (`e2e`): spins up real Postgres (PostGIS) + Redis services, builds shared packages, runs `migration:run`, runs `test:e2e` for the API

**Security scan**: `NOT FOUND` — no security-scan command exists in any package.json or in CI. Do not assume one exists.

---

## Documentation Map

| Artifact | Path | Status |
|---|---|---|
| Root README | [README.md](../../README.md) | exists |
| SSOT index | [docs/README.md](../../docs/README.md) | ACTIVE, declared SSOT root |
| CLAUDE.md | — | `NOT FOUND` |
| AGENTS.md | — | `NOT FOUND` |
| ADRs | [docs/99-decisions/ADR-*.md](../../docs/99-decisions/) | 16 ADRs, mixed status (see Decision Register) |
| Decision Register | [docs/99-decisions/decision-register.md](../../docs/99-decisions/decision-register.md) | ACTIVE, authoritative ADR status source |
| Architecture | [docs/architecture/architecture.md](../../docs/architecture/architecture.md) (+ security.md, search.md, data-collection.md, seo.md, analytics.md, tech-stack.md, deployment.md) | Mixed Draft/Review |
| Documentation Freeze | — | `NOT FOUND` as an executed artifact. Only an unfilled template exists: `.claude/skills/Documentation Freeze/freeze-certificate.md.txt` |
| Existing prompt library | [prompts/README.md](../../prompts/README.md), [prompts/INDEX.md](../../prompts/INDEX.md) | ACTIVE, explicitly subordinate to `docs/` SSOT |
| Existing governance skills | `.claude/skills/ssot/`, `Architecture Review/`, `Documentation Freeze/`, `Sprint Planner/`, `Batch Generator/` | ACTIVE, Production status (per internal file headers) |

---

## Dependency Map

- **Internal packages**: `@phuquochub/shared-types`, `@phuquochub/utils` — both implemented and consumed by `api` and/or `web`. `@phuquochub/database`, `@phuquochub/ui` exist as directories but are unimplemented.
- **External APIs**: none confirmed integrated in code yet.
- **Databases**: PostgreSQL + PostGIS (primary), Redis (cache).
- **Queues**: none implemented — placeholder directories only.
- **Infrastructure**: `docker-compose.yml` defines `postgres`, `redis`, `minio` services for local dev. `infrastructure/{docker,k8s,nginx}` are currently empty (`.gitkeep` only) — no deployment target beyond local docker-compose is evidenced.
- **Object storage**: MinIO/S3 planned via `.env.example` `S3_*` vars, explicitly noted as "used from Sprint 5" — not yet active.

---

## Constraints

- **No frozen contracts exist.** No executed Documentation Freeze was found; most `docs/` artifacts are at Draft/Review status, not Accepted (`docs/README.md` §2.1).
- **`prisma/schema.prisma` is a stale/orphaned artifact.** Self-annotated "DRAFT... KHÔNG sinh migration, KHÔNG sinh code" (do not generate migration/code). Actual persistence layer is TypeORM with 18 real migrations. ADR-013 ("Prisma readiness") is **Superseded**. Recommend flagging for archival/deletion — decision deferred to you, not inferred here.
- **Security**: `.env.example` contains only placeholder secrets (`change-me-*`, `minioadmin`); `DB_SYNCHRONIZE=false` is correctly enforced for non-dev safety. No security-scan command exists in CI (see Validation Commands).
- **Deployment**: no confirmed deployment target beyond local `docker-compose`; `infrastructure/k8s` and `infrastructure/nginx` are unpopulated.
- **No version control.** Blocks any git-based change-control step described in `.claude/skills/ssot/change-management.md.txt` (commit references, PR review, branch protection) until resolved.

---

## Readiness Checklist

- [x] Repository identified
- [~] Instructions loaded — no `CLAUDE.md`/`AGENTS.md`; `prompts/README.md` and `.claude/skills/ssot/` serve this role instead
- [x] Git inspected — confirmed absent
- [x] Commands verified — all sourced from `package.json`/CI, none invented; security scan explicitly `NOT FOUND`
- [x] Architecture mapped — `docs/architecture/*`, ADRs, `decision-register.md`
- [x] Risks documented — see Constraints above

---

## Exit Criteria

Every section above is backed by a cited repository path or command output
gathered during direct inspection of this repository. No values were
invented or assumed.

# END OF DOCUMENT
