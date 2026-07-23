# PLACE-013 — Evidence Index (build hygiene F-12 / F-23, 2026-07-22)

Backs `docs/delivery/reports/PLACE-013-build-hygiene-report.md`. Concise references only.

## State / task authority
| id | category | source | result | proves | limitations |
|---|---|---|---|---|---|
| S-1 | state | `state.yaml` `current` | `task: PLACE-013`, `status: ready` at preflight | state-authorized | — |
| S-2 | task authority | `tasks/PLACE-013.yaml` | 7 ACs, 4 validation commands, 3 stop conditions | scope/criteria authority | — |

## Dependency
| id | category | source | result | proves | limitations |
|---|---|---|---|---|---|
| DEP-1 | dependency | `evidence/PLACE-012-boundary-typing-evidence-index.md` VO-1..VO-6 | build + re-materialize, 92/92 unmodified, api+web tsc exit 0 | PLACE-012 complete on executed evidence | — |

## F-12 — verification of pre-existing work
| id | category | source / command | result | proves | limitations |
|---|---|---|---|---|---|
| H-1 | build | `ls migrations/` | **20 files, all real migrations**; no `.spec.ts` | AC2 | — |
| H-2 | build | `ls migrations/__tests__/` | 3 specs incl. `1720001500000-InitAuditLogs.spec.ts` | the file was **already moved** — by a background task started by the user, not by this session | attribution matters: this task verified, it did not perform |
| H-3 | build | `head` of the moved spec | `import { InitAuditLogs1720001500000 } from '../1720001500000-InitAuditLogs';` | the relative import was correctly adjusted | — |
| H-4 | migration | `data-source.ts:22` | `migrations: [join(__dirname, 'migrations/*.{ts,js}')]` | the glob does **not** match subdirectories → `__tests__/` is the correct fix, not a workaround | — |
| H-5 | test | `npx jest migrations` | **11/11 pass, 3 suites** | AC3 — identical count to before the move, so nothing was lost in relocation | — |
| H-6 | migration | timestamp prefix scan | `1720001500000` now prefixes exactly one file in `migrations/` | AC7 — the duplicate prefix is gone as a side effect | — |

## F-23 — stale `dist/`
| id | category | source / command | result | proves | limitations |
|---|---|---|---|---|---|
| D-1 | build | `.gitignore:7` | `dist/` | the repository's own convention treats it as untracked, disposable output | `.gitignore` exists although there is no `.git` to enforce it |
| D-2 | build | `grep -c getCardBySlug dist/…/places.repository.js` | **1** | it was genuinely stale — still contained a method PLACE-007 removed from source | — |
| D-3 | build | `grep "dist/" package.json` | `"start"` and `"start:prod"` → `node dist/main.js` | the only dependents; neither runnable here (no Postgres/Redis) | — |
| D-4 | build | file count | 279 files, 2.5 MB | scale of the artifact | — |
| D-5 | build | `npx tsc -p tsconfig.build.json --outDir <scratchpad>/distprobe2` | **exit 0**, `main.js` produced | **regenerability proven in this environment** — the deciding evidence, obtained WITHOUT touching `dist/` and WITHOUT running `nest build` (which the task forbade) | `tsc` compilation, not the full Nest build pipeline |
| D-6 | build | `Remove-Item -Recurse -Force dist` | `dist REMOVED` | AC5 — decided on D-1..D-5, not on preference | irreversible without rebuild; D-5 is what made it safe |

## Validation output — executed 2026-07-22
| id | category | command | cwd | exit | result | classification |
|---|---|---|---|---|---|---|
| VO-1 | test | `npx jest migrations` (pre-removal) | `apps/api` | **0** | 11/11, 3 suites | F-12 verification |
| VO-2 | build | regenerability probe (D-5) | `apps/api` | **0** | `main.js` produced in scratchpad | probes deleted afterwards |
| VO-3 | test | `npx jest migrations` (post-removal) | `apps/api` | **0** | **11/11, 3 suites** | removing `dist/` broke nothing |
| VO-4 | test | `npx jest places` | `apps/api` | **0** | **92/92, 7 suites** | — |
| VO-5 | lint | `npx eslint "src/core/database/migrations/**/*.ts" --max-warnings=0` | `apps/api` | **0** | clean | — |
| VO-6 | type-check | `npx tsc -p tsconfig.json --noEmit` | `apps/api` | **0** | clean | toolchain works from `src/`, as it should |

## Not executed / not claimed
| id | category | item | result | limitations |
|---|---|---|---|---|
| NX-1 | build | the F-12 file move itself | **NOT PERFORMED BY THIS TASK** | pre-existing work by a user-started background task; verified only (H-2) |
| NX-2 | build | `nest build` | NOT RUN | forbidden by the task; D-5 used `tsc -p tsconfig.build.json` instead — validates compilation, not the full Nest pipeline |
| NX-3 | build | `npm start` / `start:prod` | NOT RUN | `dist/` is now absent; they require `npm run build` first — recorded as `not_verified` and as F-31 |
| NX-4 | integration | database / e2e | NOT RUN | Docker absent |
| NX-5 | state | `git diff` | UNAVAILABLE | F-3 |

## Findings carried
| id | category | source | result | limitations |
|---|---|---|---|---|
| F-31 | build | `package.json:9-10` | no `prestart` hook, so `npm start` on a clean tree fails on a missing `dist/` instead of building | pre-existing; more visible after the deletion; one-line fix but a workflow decision |
| **F-12**, **F-23** | — | this task | **RESOLVED** (F-12 by verified pre-existing work) | — |

## State correction
| id | category | source | result | limitations |
|---|---|---|---|---|
| SC-1 | state | `state.yaml` `verification_environment.can_run_build` | `unverified` → `verified_via_tsc`, on D-5's evidence | scoped to `tsc`; a full `nest build` remains unrun |
