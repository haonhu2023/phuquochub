# PLACE-019 — Execution Report (Pre-BUILD repository readiness remediation)

> Workstream: place · Task: PLACE-019 · Type: governance_remediation · Date: 2026-07-23
> Authority: repository owner instruction, "Authorize Pre-BUILD Repository Readiness Remediation"
> Result: **PARTIALLY REMEDIATED.** AC1–AC11 all PASS, but F-3 is only *partially* cleared and F-2 is untouched.
> **BUILD remains unauthorized.**

## 1. Executive summary

Five of six authorized items completed cleanly, and one of them for the first time in this
repository's recorded history: **`nest build` ran to exit 0**, producing 120 files and a real
`dist/main.js`. Governance validation went from **2 failures to 0**.

The honest qualifier is F-3. The repository is now a Git work tree, but there is **no commit**, and
Git cannot operate on it without a per-command override because of the FAT32 volume. So F-3's
*specific* condition is cleared; release rollback readiness is **not**.

## 2. Owner authorization interpretation

The owner authorized a bounded, repository-local readiness operation — not BUILD, not deployment,
not Docker, not database work, and not any change to PLACE-001..PLACE-018 behaviour. Two
restrictions actively shaped the work:

- **"Do not rewrite user Git configuration"** — this blocked the documented fix for Git's FAT32
  ownership guard (`git config --global --add safe.directory`). I used a **non-persistent
  `-c safe.directory=...` override per command** instead, so no user config was modified. §5.
- **"Do not create a commit unless repository governance explicitly requires it"** — neither
  ADR-DELIVERY-001 nor `state.yaml` requires one, so **no commit was made**. §5.

## 3. Governance record created and used

ADR-DELIVERY-001 makes `state.yaml` the execution gate, so a task record was required before any
repository change. Created **PLACE-019** (next unused identifier, verified by listing the tasks
directory), activated it in `state.yaml`, executed it, and closed it in this same turn as directed.
It is explicitly typed `governance_remediation` — **not a BUILD task**, and not new Place feature
work. Its acceptance criteria are derived from the documented failures G-1, G-2, G-3, F-33, F-3 and
the recorded BUILD-readiness rules; none was invented.

Preflight confirmed: no task was active (`current.task: none`), PLACE-001..PLACE-018 all remain
`completed`, nothing was displaced, and no existing task governs this remediation.

## 4. Baseline findings (verified directly, not taken from the prior review)

| item | baseline |
|---|---|
| `git rev-parse --is-inside-work-tree` | **exit 128** — not a repository |
| `git status --short` | N/A — no repository |
| Governance YAML parsing | **1 failure** — `project-registry.yaml` |
| Task-schema validation | **1 failure** — `PLACE-001.yaml` has no `run_status` (17/18 others do) |
| Dependency / report / evidence integrity | PASS |
| `project-registry.yaml` exact defect | `bad indentation of a mapping entry (82:3)` — `env_template:` as a mapping key inside the `infrastructure:` sequence |
| Stale gate comments | `architecture_baseline` "no Node"; `testing` "service/controller/e2e still absent"; `implementation` "first slice … landed" |
| F-33 | `PlacesRepository.bbox()` at `:302`, **zero consumers** (4-pass sweep) |
| API build status | **never run** |
| `apps/api/dist/` | only `tsconfig.tsbuildinfo` — **no build output** |
| `@phuquochub/*` resolution | `shared-types`, `utils` present as FAT32 **copies**, not links |

## 5. Git initialization result and `.gitignore` assessment

`git init` → **exit 0**, `.git/` created. Verification then hit Git's dubious-ownership guard,
because FAT32 records no ownership. Resolved **without touching user config** via
`git -c safe.directory=F:/PhuQuochub …`, which confirmed `--is-inside-work-tree` → `true`, exit 0.

**`.gitignore` required no modification.** It already covers every mandated category:

| category | pattern | status |
|---|---|---|
| dependencies | `node_modules/`, `.pnp`, `.pnp.js` | COVERED |
| build output | `dist/`, `build/`, `.next/`, `out/`, `*.tsbuildinfo`, `.turbo/` | COVERED |
| secrets / env | `.env`, `.env.local`, `.env.*.local`, `!.env.example` | COVERED |
| coverage | `coverage/` | COVERED |
| logs | `logs/`, `*.log`, `npm-debug.log*` | COVERED |
| editor / OS | `.DS_Store`, `Thumbs.db`, `.idea/`, `.vscode/*` | COVERED |
| local data | `.data/` | COVERED |

**Secret-sensitive inspection:** `git status --short` lists 22 top-level entries; **no**
`node_modules/`, `dist/`, `coverage/`, `.turbo/` or `*.log` path appears — the ignore rules work.
The only env file in the repository is `.env.example`, intentionally un-ignored, and it contains
placeholders only (`change-me-access-secret`, `minioadmin`, `phuquoc`) — **no production secret**.
`.claude/` holds project skill documentation, no credentials.

**No remote was created, nothing was pushed, no commit was made, user config untouched.**

### F-3 disposition — partially cleared, and the distinction matters
- **Cleared:** the repository is under local version control; `git rev-parse` succeeds.
- **NOT cleared:** there is **no commit**, so there is still no baseline, no diff-verified change
  scope, no bisect point, and **no rollback point**. Git also cannot run here without the
  `safe.directory` exception, which needs either a user-level config change (outside this
  authorization) or relocation to an NTFS volume.

F-3 therefore moves from `OPEN` to **`PARTIALLY_CLEARED`**, not to `CLEARED`.

## 6. G-1 — `project-registry.yaml` repair

`infrastructure:` was a 3-item sequence with `env_template:` illegally appended as a mapping key.
Repaired by making `infrastructure` a mapping with an explicit `paths:` sequence. **Every original
value and inline comment is preserved verbatim; no project decision was changed.** Because the file
was previously unparseable, nothing could have been consuming the old shape.

Validated with the **same parser** the governance validation uses (`js-yaml`), and across **all**
governance YAML, not just this file: **26 files parse, 0 failures**.

## 7. G-2 — `PLACE-001.yaml` schema drift

`run_status` is the de-facto mandatory convention: **17 of 18** completed tasks carry it; only
PLACE-001, which predates it, does not. Resolution: **schema normalization, explicitly not
re-execution.**

The added block is transcribed from what PLACE-001 actually produced on 2026-07-22 and records
`validation: not_executed` — historically accurate, since no check could run then (no Node runtime;
FAT32 left `@phuquochub/*` unlinked). Values trace to
`reports/PLACE-001-place-domain-persistence-baseline.md` §16/§21 and its evidence index. A
`schema_note` states plainly that the field was added retroactively by PLACE-019 and that **no claim
is upgraded**. Task `status`, meaning and outcome are unchanged.

## 8. G-3 — comment refreshes (three), with no gate value changed

| gate | old statement | contradicting evidence | replacement | why no gate weakened |
|---|---|---|---|---|
| `architecture_baseline` | "build/typecheck NOT verifiable here (no Node; FAT32)" | `verification_environment.node_runtime: available`; tsc and `nest build` both exit 0 | notes Node IS available and typecheck/build DO run, "but `partial` stands: no DB/HTTP/deploy evidence" | value stays `partial`; the reason for withholding it is restated, not removed |
| `implementation` | "first slice (PLACE-002 GAP-07) landed + validated" | PLACE-002..PLACE-018 all completed | "18/18 complete; still NOT passed — nothing is exercised against a database or over HTTP" | value stays `in_progress` |
| `testing` | "DTO-level specs executed green; service/controller/e2e still absent" | PLACE-008 added 18 service specs, PLACE-009 added 23 controller specs; suite is 210 | "210/210 green incl. service and controller; still NOT passed — every one runs with the DB mocked or absent, and the 5 e2e specs have never run" | value stays `in_progress` |

All three refreshes make the comments *more* restrictive about what is proven, not less. **No gate
value advanced; no transition condition was treated as met.**

## 9. F-33 — remediated

All five preconditions held: repository-local, unambiguous behaviour, no product-owner decision, no
database/Docker/deployment/external service, and acceptance traceable to existing documentation
(PLACE-014 recorded it; PLACE-015 named it "the only clearly executable item").

**Four-pass consumer sweep, re-run this task rather than trusted:**
1. bare `.bbox(` → only `geoService.bbox(dto)` in `geo.controller.ts:20`, which is **GeoService**'s
   method, not the repository's;
2. dynamic bracket access `['bbox']` / `["bbox"]` → none;
3. every `bbox` identifier in `apps/api/src` → `GeoService.bbox` calls
   `placesRepo.bboxClusters` (`geo.service.ts:40`), never `placesRepo.bbox`;
4. all spec files → no reference.

`PlacesRepository.bbox()` deleted. A regression spec now pins the removal (`sut.bbox` undefined
while `bboxClusters` remains a function), so silently re-adding a dead namesake fails the suite.
Compiled output confirms it: the built `places.repository.js` exposes 13 async methods and
**`bbox` is not among them**; `bboxClusters` retains the single legitimate `ST_MakeEnvelope`.

**Process note, recorded because it matters:** my first edit at this step was wrong — it left a
renamed placeholder method instead of removing the code, which would have been *worse* dead surface
than the defect. I caught it on review and replaced it with a genuine deletion. The final state is
a clean removal; no placeholder remains.

## 10. Rollback for F-33

Restore inside `PlacesRepository`, above `bboxClusters`:

```ts
/** Điểm trong khung nhìn bản đồ (bbox). */
async bbox(params: { minLng: number; minLat: number; maxLng: number; maxLat: number; limit: number }): Promise<PlaceCardRow[]> {
  return this.repo.query(
    `SELECT ${CARD_COLS}
     FROM places p
     WHERE p.deleted_at IS NULL AND p.status = 'published'
       AND ST_Intersects(p.location::geometry, ST_MakeEnvelope($1,$2,$3,$4,4326))
     LIMIT $5`,
    [params.minLng, params.minLat, params.maxLng, params.maxLat, params.limit],
  );
}
```
and delete the F-33 regression spec.

## 11. Production build

Repository-authoritative command, from `apps/api/package.json` `"build": "nest build"`:

```
cd apps/api && npx nest build      → exit 0
```

| verification | result |
|---|---|
| exit code | **0** |
| TypeScript compilation | `tsc -p tsconfig.json --noEmit` → exit 0 |
| `dist/` contents | **120 files** (baseline: 1, only `tsconfig.tsbuildinfo`) |
| production entry point | `apps/api/dist/main.js` present, 1424 bytes |
| entry point matches `start:prod` | `"start:prod": "node dist/main.js"` — ✅ target exists |
| workspace package resolution | build resolved `@phuquochub/*` from the FAT32 copies without error |
| generated artifacts not treated as source | `dist/` is gitignored and regenerated; source authority remains `src/` |

**This is compilation only.** No service was started. Per the authorization, **no runtime claim is
made from a successful build.**

## 12. Files inspected

`state.yaml`; `decisions/ADR-DELIVERY-001.md`; `project-registry.yaml`; `tasks/PLACE-001.yaml`;
all 18 other `tasks/*.yaml`; `workstreams/place.yaml`; the 3 `findings/*.yaml`; PLACE-014/015/016
reports and evidence indexes (F-33 definition); `places.repository.ts`; `geo.service.ts`;
`geo.controller.ts`; `places.repository.spec.ts`; `.gitignore`; `.env.example`; `apps/api/package.json`;
root `package.json`; `apps/api/dist/`.

## 13. Files modified

| path | change |
|---|---|
| `docs/delivery/state.yaml` | activated then closed PLACE-019; G-3 comment refreshes; completed-task entry |
| `docs/delivery/project-registry.yaml` | G-1 YAML repair |
| `docs/delivery/tasks/PLACE-001.yaml` | G-2 `run_status` normalization |
| `docs/delivery/tasks/PLACE-019.yaml` | closed with `run_status` |
| `docs/delivery/workstreams/place.yaml` | PLACE-019 status; F-33 recorded resolved |
| `apps/api/src/modules/places/repositories/places.repository.ts` | F-33 `bbox()` removed |
| `apps/api/src/modules/places/repositories/places.repository.spec.ts` | F-33 regression spec |

## 14. Files created

`.git/` (local repository); `docs/delivery/tasks/PLACE-019.yaml`;
`docs/delivery/reports/PLACE-019-pre-build-readiness-report.md`;
`docs/delivery/evidence/PLACE-019-pre-build-readiness-evidence-index.md`;
`apps/api/dist/**` (120 build artifacts, gitignored).

## 15. Files deleted

None as whole files. One method removed: `PlacesRepository.bbox()`.

## 16. Validation commands and exit codes

| # | command | exit |
|---|---|---|
| 1 | `git rev-parse --is-inside-work-tree` (baseline) | **128** |
| 2 | `git init` | **0** |
| 3 | `git -c safe.directory=F:/PhuQuochub rev-parse --is-inside-work-tree` | **0** |
| 4 | `git -c safe.directory=… status --short` | **0** (22 entries; no dep/secret/build path) |
| 5 | governance validation suite (26 YAML, 8 categories) | **0** — **0 failures** (baseline: 2) |
| 6 | `npx tsc -p tsconfig.json --noEmit` | **0** |
| 7 | `npx nest build` | **0** |
| 8 | `npx jest` (full) | **0** — **210/210, 29 suites** |
| 9 | `npx eslint places + geo --max-warnings=0` | **0** |
| 10 | `dist/` artifact verification | **0** — 120 files, `main.js` present, `bbox` absent |

Web typecheck was **not** run: no shared contract was touched (the F-33 removal is an internal
repository method, invisible to `@phuquochub/shared-types`).

Docker was **not** re-probed — its `command not found` result is already established and §18 carries
F-2 forward unchanged.

## 17. Acceptance-criteria matrix

| # | Criterion | Result | Evidence |
|---|---|---|---|
| AC1 | Repository under local version control | **PASS** | §5 — `git init` exit 0, work tree confirmed |
| AC2 | `.gitignore` excludes all categories; no secret/dep in status | **PASS** | §5 — 7/7 categories; only `.env.example` (placeholders) |
| AC3 | `project-registry.yaml` parses; values preserved | **PASS** | §6 |
| AC4 | ALL governance YAML parses | **PASS** | §16 cmd 5 — 26 files, 0 failures |
| AC5 | PLACE-001 normalized with historically accurate values | **PASS** | §7 — `validation: not_executed`, `schema_note` present |
| AC6 | Comment refreshes documented; no gate value changed | **PASS** | §8 — all three still `partial`/`in_progress` |
| AC7 | F-33 remediated with sweep + regression coverage | **PASS** | §9 |
| AC8 | Build run; exit code, `dist/`, entry point recorded | **PASS** | §11 |
| AC9 | Full jest + API typecheck exit 0 | **PASS** | §16 cmds 6, 8 |
| AC10 | F-2 open; DB/HTTP/authz/geo/EXPLAIN/e2e gaps preserved | **PASS** | §18, §19 |
| AC11 | No BUILD task created/activated; READY_FOR_BUILD not asserted | **PASS** | no BUILD file exists; §20 |

## 18. Updated blocker table

| ID | Description | Status | Evidence | Remaining risk | Owner | Blocks BUILD? |
|---|---|---|---|---|---|---|
| **F-2** | Docker not installed | **OPEN — unchanged** | `docker --version` → 127 | DB, migration, HTTP, authz, geospatial, `EXPLAIN`, e2e all unverifiable | environment owner | **YES** |
| **F-3** | Not under version control | **PARTIALLY CLEARED** | `git init` exit 0; work tree confirmed | **no commit ⇒ no rollback point, no diff-verified scope**; Git needs a `safe.directory` exception (user-level config, outside this authorization) or NTFS relocation | repository owner | **YES** |
| F-1 / F-6 / F-17 | | CLEARED | PLACE-016/017/018 | as recorded | — | no |
| **F-33** | Consumerless `PlacesRepository.bbox()` | **RESOLVED** | §9; 210/210; absent from compiled output | none | — | no |
| G-1 | `project-registry.yaml` unparseable | **RESOLVED** | §6 | none | — | no |
| G-2 | PLACE-001 schema drift | **RESOLVED** | §7 | none | — | no |
| G-3 | Stale gate comments | **RESOLVED** | §8 | none | — | no |

## 19. Remaining evidence gaps

Unchanged and explicitly preserved: **zero database evidence**; **zero HTTP evidence**;
**authorization guards never executed**; **geospatial behaviour never executed**; **no `EXPLAIN`**;
**migrations never applied to any database**; **e2e suite (5 specs) never run**. Newly narrowed but
not closed: build reproducibility is now **PROVEN for compilation** — production *startup* remains
**NOT VERIFIED**, since no service was started. Also open: no commit yet; `@phuquochub/*` remain
FAT32 copies rather than links; external-consumer risk remains unknown and unverifiable.

## 20. Final classification

```text
PARTIALLY_REMEDIATED
```

Every authorized item was executed and all eleven acceptance criteria pass — but the classification
is driven by outcome, not effort. F-3 is only partially cleared (no commit, `safe.directory`
unresolved within the authorization's limits), and F-2 is untouched by design. Both still block
BUILD, so `PRE_BUILD_REMEDIATION_COMPLETED` would overstate the position.

**BUILD remains unauthorized.** No BUILD task exists, none was created, and `READY_FOR_BUILD` is not
asserted — a green suite and a successful compilation are explicitly not accepted as evidence of a
working system.

## 21. Explicit non-claims

Not claimed: runtime verification, production readiness, database/migration/HTTP/authz/geospatial
correctness, deployment, rollback capability, or external-consumer safety. `nest build` exiting 0
proves the code compiles and emits an entry point — nothing about whether it runs.
