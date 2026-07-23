# PhuQuocHub — Environment Setup Runbook

> Purpose: clear the single environmental blocker that has held the Place workstream at
> **PLACE-002** since 2026-07-22, preventing PLACE-003 onward from being derived at all.
> Date: 2026-07-22 · Status: **runbook only — nothing in it has been executed.**
> Every fact below was measured on this machine; measurements are cited inline.

---

## 1. What is actually blocking delivery

PLACE-002 (Phú Quốc coordinate bounds, GAP-07) is **implemented** — all five in-scope files
exist on disk — but two mandatory acceptance criteria (AC1, AC3) require running its specs,
and they have never been run. Nothing downstream can be derived until they are.

Two independent causes, previously recorded together as one blocker. **They are not equally
severe, and separating them changes the fastest path:**

| # | Cause | Measured evidence | What it actually blocks |
|---|---|---|---|
| **A** | **No Node runtime installed** | `node -v`, `npm -v`, `npx -v` → `command not found` (exit 127); `C:\Program Files\nodejs` absent | **Everything.** No test, lint, or type-check can run. |
| **B** | **Repo lives on a FAT32 removable stick** | `Win32_LogicalDisk`: `F:` = FAT32, DriveType 2 (removable), 14.9 GB. `node_modules/@phuquochub/` exists but is **empty** — npm workspace symlinks cannot be created on FAT32 | **Only** `tsc --noEmit` and repo-wide lint, which resolve `@phuquochub/utils` and `@phuquochub/shared-types`. |

### The finding that shortens the path

The PLACE-002 DTO specs import **only** `class-validator`, `class-transformer`, and local
relative paths — verified by inspecting the import lines of `places.dto.spec.ts`,
`geo.dto.spec.ts`, `places.dto.ts`, `geo.dto.ts`, and `common/geo-bounds.ts`. There is **no
`@phuquochub/*` import, no TypeORM entity, and no database access anywhere in that graph.**

Meanwhile the full dependency tree is **already installed** at the repo root (530.8 MB /
45,781 files): `jest`, `ts-jest`, `class-validator`, `class-transformer`, `typescript`,
`eslint` and `node_modules/.bin/jest` are all present.

**Therefore:** cause B does *not* block the two spec commands that satisfy AC3. Installing
Node alone (Path 1, ~5 minutes) is enough to run them. Docker/Postgres/PostGIS are **not**
required for PLACE-002 at all — they are only needed for e2e tests.

---

## 2. Path 1 — Install Node (minimum to unblock PLACE-002's specs)

Fastest route to real validation. Does not move the repository.

### 2.1 Install

`winget` is available on this machine. Node LTS is `OpenJS.NodeJS.LTS` **24.18.0**; the repo
requires `node >= 20.0.0`, `npm >= 10.0.0` (root `package.json` `engines`), so LTS satisfies it.

Prefer **LTS 24**, not current 26 — the toolchain is NestJS 10 / TypeORM 0.3 / Jest 29, which
is tested against LTS lines.

```powershell
winget install --id OpenJS.NodeJS.LTS --exact --source winget
```

Then **open a new terminal** (PATH is only refreshed in new sessions) and confirm:

```powershell
node -v; npm -v
```

Expect `v24.x` and `10.x` or newer.

### 2.2 Run the two mandatory spec commands

```powershell
cd F:\PhuQuochub\apps\api
npx jest places.dto
npx jest geo.dto
```

These are two of PLACE-002's four recorded `validation_commands`. If both pass, **AC3 moves
from NOT VERIFIED to PASS** and AC1 moves from PARTIAL toward PASS.

> Expect this to work on `F:` despite FAT32 — the specs need no workspace symlink. If jest
> instead fails on resolving `@phuquochub/...`, that is cause B and means Path 2 is required;
> classify it as **environmental**, not as a PLACE-002 defect.

---

## 3. Path 2 — Relocate to NTFS (required for type-check and full lint)

Needed for `tsc --noEmit` and repo-wide `eslint`, because `apps/api/src` (services, entities)
imports `@phuquochub/utils` and `@phuquochub/shared-types`, and **`tsconfig.base.json`
declares no `paths` mapping** — resolution depends entirely on npm workspace symlinks, which
FAT32 cannot create.

### 3.1 Choose the target

| Drive | Filesystem | Free | Type | Suitable |
|---|---|---|---|---|
| `C:` | NTFS | 92.2 GB | fixed | yes |
| **`D:`** | **NTFS** | **255 GB** | **fixed** | **recommended** |
| `F:` | FAT32 | 14 GB | **removable** | no — current location |

`D:` is recommended: most free space, and a fixed disk rather than a stick that can be
unplugged mid-build.

### 3.2 Copy source only — never copy node_modules

Of the 588.9 MB / 46,880 files measured, **530.8 MB / 45,781 files are `node_modules`**.
That leaves roughly **58 MB / ~1,100 real files**. Copying `node_modules` across would carry
the broken empty `@phuquochub/` directory with it and take vastly longer.

```powershell
robocopy F:\PhuQuochub D:\PhuQuocHub /E /XD node_modules dist .turbo /R:1 /W:1
```

`robocopy` exit codes 0–7 indicate success; 8 or higher is a real failure.

> **Non-destructive:** this copies, it does not move. `F:\PhuQuochub` stays exactly as it is
> and remains a complete fallback until you choose to delete it.

### 3.3 Install dependencies on NTFS

```powershell
cd D:\PhuQuocHub
npm install
```

The repo uses **npm workspaces** (`workspaces: ["apps/*", "packages/*"]`) with
`packageManager: npm@10.8.2` and a committed `package-lock.json` — use `npm`, not pnpm or
yarn. Turbo 2.x is the task runner.

### 3.4 Verify the symlinks that FAT32 broke

```powershell
Get-ChildItem D:\PhuQuocHub\node_modules\@phuquochub
```

This directory is **empty on `F:`** — that emptiness is the whole of cause B. On NTFS it must
list `shared-types` and `utils` as links/junctions. If it is still empty, stop: `npm install`
did not link the workspaces and nothing downstream will type-check.

### 3.5 Build the workspace packages before type-checking

Both packages resolve through `dist/`, not source — `packages/shared-types/package.json` and
`packages/utils/package.json` declare `"main": "./dist/index.js"`, `"types": "./dist/index.d.ts"`.
So `dist/` must exist or `tsc --noEmit` fails on missing type declarations.

```powershell
cd D:\PhuQuocHub
npx turbo run build --filter=@phuquochub/shared-types --filter=@phuquochub/utils
```

> Both `dist/` directories are already present on `F:` and copy across if you do not exclude
> them; the command is still worth running to guarantee they match current source.

---

## 4. Complete PLACE-002 validation sequence

All four of PLACE-002's recorded `validation_commands`, narrowest first, per delivery §24.
Run from the repository root after Path 2.

```powershell
cd D:\PhuQuocHub\apps\api
npx jest places.dto
npx jest geo.dto
npx eslint "src/modules/{places,geo}/**/*.ts" --max-warnings=0
npx tsc -p tsconfig.json --noEmit
```

These match the repo's real scripts: `apps/api/package.json` defines
`"lint": "eslint \"src/**/*.ts\" --max-warnings=0"`, `"typecheck": "tsc -p tsconfig.json --noEmit"`,
`"test": "jest"`. Jest config is inline in `package.json` with `rootDir: src`,
`testRegex: .*\.spec\.ts$`, `ts-jest` transform.

### Interpreting results — classify before fixing

| Outcome | Classification | Action |
|---|---|---|
| Both spec files pass | — | AC3 → **PASS**; AC1 → **PASS** |
| A bounds assertion fails | `introduced_by_PLACE-002` | Fix **only** within PLACE-002's five in-scope files |
| `Cannot find module '@phuquochub/...'` | `environmental` | Symlinks or package build missing — §3.4 / §3.5 |
| Errors in files unrelated to places/geo | `pre_existing` or `unrelated` | Record as a finding; do **not** fix inside PLACE-002 |

Do not weaken assertions or delete specs to obtain green.

---

## 5. What this does *not* unblock

- **Docker is not installed** (`Get-Command docker` → not found). e2e tests and any
  database-backed work need `npm run db:up`, which starts `postgis/postgis:16-3.4`,
  `redis:7-alpine`, and `minio` per `docker-compose.yml`.
- Therefore **GAP-06** (the partial index `BTREE(status) WHERE deleted_at IS NULL`, the leading
  PLACE-003 candidate) still cannot be verified by `EXPLAIN` after Paths 1–2. It needs Docker
  Desktop plus `npm run db:up`. That is a separate, later prerequisite — **not** a PLACE-002
  blocker.
- **No git repository** exists (`git status` → `fatal: not a git repository`; no `.git`
  directory). No task can produce a diff-verified scope proof until the project is placed
  under version control. Worth doing during the move, but out of scope here.

## 6. Still required before PLACE-002 can finally close

Green commands are necessary but not sufficient. PLACE-002's own stop conditions also require
**owner confirmation of the Phú Quốc bounding box** — `apps/api/src/common/geo-bounds.ts`
carries a `PROVISIONAL` constant derived from seed coordinates
(`1720001600000-SeedPlacesExpansion.ts`, lng ≈ 103.85–104.05, lat ≈ 10.02–10.33), not from an
authoritative source. `docs/api/api.md:184` requires coordinates "trong Phú Quốc" but states
no numeric box. A human decision is needed on the real boundary.

## 7. Order of operations

1. Install Node LTS (§2.1) — ~5 min.
2. Run the two spec commands on `F:` (§2.2) — proves or disproves AC3 immediately.
3. Copy to `D:` (§3.2), `npm install` (§3.3), verify symlinks (§3.4), build packages (§3.5).
4. Run all four validation commands (§4).
5. Classify any failure before touching code (§4 table).
6. Obtain owner confirmation of the bbox (§6).
7. Only then complete PLACE-002 and derive PLACE-003 from real remaining work.

## 8. Rollback

Every step is additive and reversible:

- Node install → `winget uninstall --id OpenJS.NodeJS.LTS`.
- `D:` copy → delete `D:\PhuQuocHub`; `F:\PhuQuochub` is untouched throughout.
- `npm install` → deletes with the copy; the committed `package-lock.json` is unchanged.
- No database, migration, contract, or product source is modified by anything in this runbook.

## 9. Explicit non-claims

This runbook is **instructions, not results**. Nothing in it has been executed. It does not
claim that Node was installed, that the repository was relocated, that dependencies were
installed, that any workspace symlink now exists, that any test, lint, type-check, or build
passed, that any migration was applied, that any backfill ran, or that PLACE-002's acceptance
criteria have changed status. All PLACE-002 validation remains **NOT EXECUTED**, and the
delivery state remains `task: PLACE-002, status: in_progress`.
