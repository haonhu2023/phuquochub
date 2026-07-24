# PLACE-020 — Post-certification delivery-state reconciliation

- **Task:** PLACE-020 (`docs/delivery/tasks/PLACE-020.yaml`)
- **Type:** governance_remediation (state-maintenance; NOT feature work, NOT a BUILD task)
- **Date:** 2026-07-24
- **Outcome:** **RECONCILED**
- **Authority:** Repository owner instruction 2026-07-24 — *"re-establish the authoritative delivery state … execute exactly one valid next delivery task."* (EEF authority hierarchy #1: explicit user instruction.)
- **Evidence index:** `docs/delivery/evidence/PLACE-020-state-reconciliation-evidence-index.md`

## 1. Why this task, and why it is authorized

The authoritative state was `current.task: none`, `status: awaiting_task_authorization`, with an
explicit rule that **deriving an engineering task is not authorized**. The decision order therefore
excludes any new Place feature task. However, the immediately-preceding end-to-end certification of
the D: baseline produced objective evidence that the delivery state was **stale** on exactly the two
items PLACE-016..019 had named as *"the only release blockers left, and neither is fixable in-repo"*:

- **F-2 — Docker not installed.** Now installed and running.
- **F-3 — no version control / no commit.** Now a git work tree with a rollback point.

User instruction #1 explicitly directs a state re-establishment. Recording certified facts is the
evidence-backed state transition contemplated by the framework (Phase 2.2 / Phase 5), executed as a
governance task in the same shape as the precedent **PLACE-019**. It changes **no application source,
tests, schema, migrations, or contracts**, and it **resolves no owner product decision**.

## 2. Scope executed

Governance/docs only — `git diff` is limited to `docs/delivery/**`:

| File | Change |
|---|---|
| `docs/delivery/state.yaml` | Repository identity block moved from the obsolete **F: (FAT32, vcs none)** to the certified **D: (NTFS, git, HEAD 0ca958f)**, prior inspection retained under `superseded_inspection`; `verification_environment` reconciled; three gate **comments** refreshed (values unchanged); `current`, `completed_tasks` (new PLACE-020 entry), and `next_action` updated. |
| `docs/delivery/project-registry.yaml` | `repository.vcs: none → git` (+ branch/head/remote). |
| `docs/delivery/workstreams/place.yaml` | `known_risks` refresh — three risks marked `[RESOLVED PLACE-020]`, retained as history; `place_020_status` added; `next_task` note. |
| `docs/delivery/tasks/PLACE-020.yaml` | New task record (created, executed, closed in-turn). |
| `docs/delivery/reports/PLACE-020-…md`, `…/evidence/PLACE-020-…md` | This report + evidence index. |

## 3. Facts recorded (all evidence-backed — see index)

- **F-2 RESOLVED:** `phuquoc-postgres` / `-redis` / `-minio` all `health=healthy` on **existing volumes** (not recreated); `redis-cli ping → PONG`; `pg_isready → accepting connections`; `migrations` table = **20 rows**; **API e2e = 5 suites / 22 tests green** against real Postgres/PostGIS + Redis.
- **F-3 RESOLVED:** branch `master`, commits `889d01f → c661912 → 0ca958f`, clean tree, **no remote** (nothing pushed) — a rollback point and diff-verifiable scope now exist.
- **Environment:** D: is **NTFS**; `@phuquochub/{shared-types,utils}` are **real workspace symlinks**; runtime pinned to **Node v20.20.2 / npm 10.8.2**.
- **Build + startup:** `turbo run build --force` → **4/4, 0 cached**; artifacts complete (**153 src == 153 js**, `main.js`/`app.module.js`/`core/` present, no spec leakage); `.next` present; **production startup verified** — `/api/health` **200** (`data.status=ok`, database=up, redis=up), web `/` **200**; processes terminated, ports freed.

## 4. Conservatism (what was deliberately NOT done)

- **No gate VALUE advanced.** Following the PLACE-019 precedent, only comments contradicted by
  evidence were refreshed. `implementation` and `testing` are materially closer to `passed`
  (DB-backed e2e green; production startup verified) but are **held at `in_progress`** pending
  EXPLAIN/index-usage evidence (GAP-06 / F-15) and the open owner decisions. `deployment` stays
  `not_started`.
- **No owner product decision made.** GAP-05/10 remains the **sole outstanding release blocker**;
  F-24, F-34, `SearchResult.score`, and the PROVISIONAL Phú Quốc bbox stay OPEN.
- **READY_FOR_BUILD not asserted**; the Place workstream is **not** marked complete.
- **No history rewritten.** Prior task records (PLACE-016..019) and the superseded F: inspection are
  retained verbatim as history.

## 5. Verification (this task)

| Command | Result |
|---|---|
| `eslint 'src/**/*.ts' --max-warnings=0` | exit 0 |
| `tsc -p tsconfig.json --noEmit` | exit 0 |
| `jest` (full unit) | **210/210**, 29 suites — unchanged |
| `jest --config test/jest-e2e.json` | **22/22**, 5 suites — unchanged |
| all `docs/delivery/**/*.yaml` parse | PASS |
| `git diff --name-only` | only `docs/delivery/**` |

No application code changed, so the green unit + e2e totals prove **zero regression** rather than new behaviour.

## 6. State transition

`current.task` stays `none`; `status` stays `awaiting_task_authorization`. The gate that now governs
progress is an **owner product decision on GAP-05/10**, which no engineering task can supply.

## 7. Exact next authorized task

**None is auto-derivable.** The next step requires an **owner decision on GAP-05/10** (openapi
list-params contract vs. the offset `page/limit` implementation). Once adjudicated, a scoped
remediation task (in the PLACE-016/017 mould) can be authorized. Separately, the now-unblocked but
**non-blocking** engineering item is EXPLAIN evidence that the planner uses
`idx_places_status_active` (GAP-06 / F-15) — it may be authorized independently but does not gate release.

## 8. Non-claims

Recording F-2 and F-3 as RESOLVED does **not** assert READY_FOR_BUILD, does **not** mark the Place
workstream complete, and does **not** resolve any owner product decision. A green e2e run and a
booting service are runtime evidence for the certified session — not a release decision.
