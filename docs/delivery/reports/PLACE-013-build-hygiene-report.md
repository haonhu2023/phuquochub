# PLACE-013 — Execution Report (build hygiene: F-12, F-23)

> Workstream: place · Task: PLACE-013 · Type: release-readiness remediation · Date: 2026-07-22
> Authority: `docs/delivery/state.yaml`, `docs/delivery/tasks/PLACE-013.yaml`
> Result: **COMPLETED.** AC1–AC6 (mandatory) PASS, AC7 (optional) PASS.

## 1. Executive Summary
Both build-hygiene findings are closed.

**F-12 was already fixed before this task ran** — `1720001500000-InitAuditLogs.spec.ts` now sits
in `migrations/__tests__/` with a corrected import. That work came from a background task
spun off during PLACE-003, not from this session, and this task **verified** it rather than
claiming it: `migrations/` contains only real migrations, and the suite passes with the same
11/11 count as before the move.

**F-23 was resolved here.** `apps/api/dist/` — 279 stale files still containing code PLACE-007
removed — was deleted, but only after its regenerability was **proven** rather than assumed:
`tsc -p tsconfig.build.json` was run into a scratchpad directory, exiting 0 and producing
`main.js`, without touching `dist/` itself.

## 2. Task Identity and Authority
| item | value |
|---|---|
| Task | PLACE-013 — "Place build-hygiene remediation (F-12, F-23)" |
| Type | `release-readiness remediation` |
| Authorized by | `state.yaml` — `current.task: PLACE-013`, was `ready` |
| depends_on | PLACE-012 (completed 2026-07-22) |

## 3. Dependency Verification
PLACE-012 completed on executed evidence: shared-types rebuilt and re-materialized, `jest places`
92/92 with mapper and DTO specs unmodified, api + web `tsc` exit 0
(`evidence/PLACE-012-boundary-typing-evidence-index.md` VO-1..VO-6).

## 4. Starting Repository State
Not a git repository — branch/commit/diff unknown, not fabricated. Node v24.18.0 portable.
`apps/api/dist/` present with 279 files.

## 5. F-12 — misplaced migration spec (AC1, AC2, AC3, AC7)
### 5.1 What was found
The file had **already been relocated**. `migrations/__tests__/` contains three specs
(`…InitAuditLogs`, `…InitSources`, `…AddPlacesStatusPartialIndex`) and the InitAuditLogs spec's
first line reads `import { InitAuditLogs1720001500000 } from '../1720001500000-InitAuditLogs';`
— the corrected relative path.

This was done by a background task suggested during PLACE-003 and started by the user, outside
this session. **It is recorded as pre-existing work, not as this task's output.**

### 5.2 Verification performed
| check | result |
|---|---|
| `migrations/` listing | **20 files, all real migrations** — no `.spec.ts` remains (AC2) |
| `__tests__/` listing | 3 specs, including the relocated one |
| import in the moved file | `'../1720001500000-InitAuditLogs'` — resolves |
| `data-source.ts:22` glob | `migrations: [join(__dirname, 'migrations/*.{ts,js}')]` — does **not** match subdirectories, which is exactly why `__tests__/` is the fix |
| migration suite | **11/11 pass, 3 suites** — the same count as before the move (AC3) |
| duplicate timestamp | **gone** — `1720001500000` now prefixes exactly one file in `migrations/` (AC7) |

The unchanged 11/11 count is the meaningful check: a different number would have meant something
was lost rather than relocated.

### 5.3 Consequence
TypeORM can no longer load a test file as a migration. The defect that
`__tests__/1720001700000-InitSources.spec.ts:5-8` warned about — naming this very file — no
longer exists.

## 6. F-23 — stale `dist/` (AC5)
### 6.1 Evidence gathered before acting
| question | evidence | answer |
|---|---|---|
| Is it tracked build output? | `.gitignore:7` → `dist/` | **No** — the repository's own convention treats it as disposable |
| Was it actually stale? | `grep getCardBySlug dist/…/places.repository.js` → 1 hit | **Yes** — it still contained a method PLACE-007 removed from source |
| What depends on it? | `package.json:9-10` → `"start": "node dist/main.js"`, `"start:prod"` | two scripts, neither runnable here (no Postgres/Redis) |
| Size | 279 files, 2.5 MB | — |
| Is it regenerable **in this environment**? | see §6.2 | **Yes, proven** |

### 6.2 Regenerability proven, not assumed
`state.yaml` recorded `can_run_build: unverified`, and with no version control a deletion is not
recoverable — so "it's just build output" was not good enough. The task also forbade running
`nest build` to regenerate `dist/`, since that would swap one unverified artifact for another.

Resolution: compile to a **scratchpad** directory instead, leaving `dist/` untouched:

```
npx tsc -p tsconfig.build.json --outDir <scratchpad>/distprobe2   → exit 0, main.js produced
```

That is direct evidence the artifact is reproducible from source here, without modifying the
repository. The probe directories were deleted afterwards.

### 6.3 Decision
**Removed.** With regenerability proven, deletion loses nothing that is not derivable from
`src/`, and the two `start` scripts depend on *a* `dist`, not on *this* one — running them
against a stale build would have served code that no longer matches source, which is a worse
failure mode than a missing directory (silently wrong versus obviously absent).

`state.yaml`'s `can_run_build: unverified` is corrected to `verified_via_tsc` as part of this
task, since the probe is exactly that evidence.

## 7. Files Modified
| path | class | reason | validation | rollback |
|---|---|---|---|---|
| `apps/api/dist/` (279 files) | generated | stale build output removed (F-23) | jest + tsc all green after removal | `cd apps/api && npm run build` |
| `docs/delivery/state.yaml` | documentation | `can_run_build` corrected on the probe's evidence; task transition | js-yaml parse | revert file |
| `docs/delivery/workstreams/place.yaml` | documentation | findings register | js-yaml parse | revert file |

**No source file was modified by this task.** No migration, no `data-source.ts`, no test
assertion, no application code (AC4). The F-12 file move was pre-existing.

## 8. Domain / Persistence / API / Contract Impact
None. No migration, entity, schema, route, DTO or contract touched. Removing compiled output and
relocating a test file change no behaviour whatsoever.

## 9. Consumer Compatibility
| Consumer | Path | R/W | Contract or behavior | Required change | Validation | Status |
|---|---|---|---|---|---|---|
| migration suite | `core/database/migrations/__tests__` | n/a | unchanged assertions | none | jest 11/11 | compatible_without_change (tested) |
| TypeORM CLI | `data-source.ts` | n/a | glob now matches only migrations | none | listing + jest | compatible_without_change |
| places module | `apps/api/src/modules/places` | n/a | untouched | none | jest 92/92 | compatible_without_change (tested) |
| `npm start` / `start:prod` | `apps/api/package.json:9-10` | n/a | require `dist/` | **run `npm run build` first** | not run (no DB here) | **not_verified** — documented, see §6.3 |

## 10. Tests
None added, none modified, none removed. This task moved no assertion — it verified a
pre-existing move and deleted build output.

## 11. Validation Commands and Results
| # | command | cwd | exit | result |
|---|---|---|---|---|
| 1 | `npx jest migrations` (before dist removal) | `apps/api` | **0** | **11/11 pass, 3 suites** — F-12 verification |
| 2 | `npx tsc -p tsconfig.build.json --outDir <scratchpad>` | `apps/api` | **0** | `main.js` produced — regenerability proof |
| 3 | `npx jest migrations` (after dist removal) | `apps/api` | **0** | **11/11 pass, 3 suites** |
| 4 | `npx jest places` | `apps/api` | **0** | **92/92 pass, 7 suites** |
| 5 | `npx eslint "src/core/database/migrations/**/*.ts" --max-warnings=0` | `apps/api` | **0** | clean |
| 6 | `npx tsc -p tsconfig.json --noEmit` | `apps/api` | **0** | clean |

All four declared `validation_commands` executed, plus the regenerability probe. No failures, so
no failure classification was required. Commands 3–6 confirm that removing `dist/` broke
nothing: the toolchain works from `src/`, as it should.

## 12. Security Review
Marginally positive. A stale compiled artifact in the working tree is a small hazard: it can be
executed (`npm start` serves `dist/main.js`) and would run code that no longer matches source —
including, until now, a repository method deliberately removed in PLACE-007 for being an
unfiltered slug reader. That divergence is gone.

No authentication, authorization, validation, query or serialization behaviour changed.

## 13. Performance / Observability Review
No runtime change. 2.5 MB of dead artifact removed from the working tree — relevant only to disk
use on a constrained FAT32 volume, not to application performance. No observability surface
touched.

## 14. Rollback or Recovery Review
`cd apps/api && npm run build` regenerates `dist/`, and §6.2 proves the compilation succeeds in
this environment. If the F-12 move ever needs reverting, restore the spec to `migrations/` and
change its import back to `'./1720001500000-InitAuditLogs'` — though doing so would reintroduce
the defect.

## 15. Deviations From the Approved Task
1. **F-12 was found already resolved.** The task was written expecting to perform the move; it
   verified it instead. Reported as pre-existing work rather than claimed — that distinction is
   the point.
2. **A build probe was run**, which the task did not anticipate. It respects the constraint that
   mattered (`dist/` untouched, `nest build` not run) while replacing a judgement call about
   regenerability with evidence. Recorded rather than absorbed.
3. `state.yaml`'s `can_run_build` was corrected, since this task produced the evidence that flag
   had been waiting for.

## 16. Remaining Findings
| id | finding | evidence | disposition |
|---|---|---|---|
| F-31 | `apps/api/package.json` has no `prestart` hook, so `npm start` after a clean checkout fails on a missing `dist/` rather than building first. Pre-existing and unrelated to the deletion, but more visible now. | `package.json:9-10` | backlog — one-line change, but a build-workflow decision |

**F-12 and F-23 are RESOLVED by this task** (F-12 by verified pre-existing work). F-1 … F-11,
F-13 … F-17, F-21, F-24, F-26 … F-30 remain as classified.

## 17. Acceptance-Criteria Evaluation
| # | Criterion | Mandatory | Result | Evidence |
|---|---|---|---|---|
| AC1 | Spec lives in `__tests__/` and its import resolves | yes | **PASS** | §5.2 — verified, pre-existing |
| AC2 | `migrations/` contains only real migrations, verified by listing | yes | **PASS** | §5.2 — 20 files, no spec |
| AC3 | Same test count; no assertion added/removed/altered | yes | **PASS** | §11 cmds 1, 3 — 11/11 both times |
| AC4 | No migration, `data-source.ts` or other production file modified | yes | **PASS** | §7 change register |
| AC5 | `dist/` disposition decided on evidence and stated | yes | **PASS** | §6 — removed, with regenerability proven |
| AC6 | jest ×2, eslint, tsc all exit 0 | yes | **PASS** | §11 cmds 3–6 |
| AC7 | Duplicate `1720001500000` prefix confirmed gone | **no** | **PASS** | §5.2 |

All six mandatory criteria **PASS**. The optional criterion also passes.

## 18. Delivery-State Transition
Applied: `current.task: PLACE-014`, `status: ready`. `verification_environment.can_run_build`
corrected from `unverified` to `verified_via_tsc`. No gate upgraded — build hygiene moves no
release gate.

## 19. Selected PLACE-014 Task
Deliberately **not** pre-specified in detail: PLACE-013's `next_candidate_task` left it to be
derived from what is actually true now, and what is true is that the NON_BLOCKING backlog
reachable in this environment is nearly exhausted. What remains is either analysis-shaped (F-16,
F-26, F-28), structural-design-shaped (F-30), cosmetic (F-29, F-31), or one of the five
BLOCKS_RELEASE items — every one of which needs Docker, version control, or an absent owner.

See `docs/delivery/tasks/PLACE-014.yaml` for the derivation.

## 20. Explicit Non-Claims
This report does **not** claim any unverified: **production deployment, production migration
application, production backfill completion, complete external consumer migration, complete
cache propagation, complete search reindexing, complete event propagation, canary success,
hypercare completion, production stabilization, compatibility retirement readiness, or legacy
schema cleanup readiness.**

Specifically not claimed: **this task did not perform the F-12 file move** — it verified work
already present in the tree. `nest build` was **not** run; regenerability was proven with `tsc -p
tsconfig.build.json` into a scratchpad, which validates compilation but is not identical to the
Nest build pipeline. `npm start` was not executed and remains `not_verified`. No database, e2e,
telemetry, or git branch/commit/diff.
