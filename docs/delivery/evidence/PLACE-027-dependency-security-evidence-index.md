# PLACE-027 — Evidence Index (dependency security remediation, 2026-07-24)

Backs `docs/delivery/reports/PLACE-027-dependency-security-report.md`. All commands on the D:
checkout under pinned **Node v20.20.2 / npm 10.8.2**, Docker Desktop running throughout.

## Authority
| id | source | proves |
|---|---|---|
| S-1 | owner instruction 2026-07-24 — "execution of the next approved engineering task: PLACE-027" | activation authorized |
| S-2 | `decisions/OWNER-APPROVAL-SESSION-2026-07-24.md`, Eligible Candidate 2 | implements `OD2-11` (Approved) |
| S-3 | Precondition check (report §1) | all 5 preconditions satisfied |

## Fresh investigation (Phase 1, not memory)
| id | evidence | result |
|---|---|---|
| I-1 | `npm audit --omit=dev --json` (before) | 17 total: 1 critical, 6 high, 10 moderate, 0 low |
| I-2 | `npm audit --json` (before, incl. dev) | 33 total: 1 critical, 13 high, 16 moderate, 3 low |
| I-3 | `npm outdated` | "Wanted" == "Current" for every NestJS/Next package — confirms no non-major fix exists within current ranges |
| I-4 | `npm ls tar` | `bcrypt@5.1.1` → `@mapbox/node-pre-gyp@1.0.11` → `tar@6.2.1` — confirms transitive chain |
| I-5 | `npm view tar versions` | patched versions only exist at `7.5.14+` — a major bump from 6.x |
| I-6 | `npm ls file-type` | `@nestjs/common@10.4.22` → `file-type@20.4.1`; `@nestjs/common` 10.4.22 confirmed already the newest 10.x release |
| I-7 | `npm ls @angular-devkit/schematics` | depended on only by `@nestjs/cli`/`@nestjs/schematics` (dev-only NestJS 10.x tooling) |

## Classification (Phase 2)
| id | category | count | packages (see report for full list) |
|---|---|---|---|
| C-1 | Safe patch | 1 | `fast-uri` |
| C-2 | Safe minor | 0 | — |
| C-3 | Major (review) | 12 | NestJS 10→11 ecosystem (9 pkgs), Next 14→16 (2 pkgs), `tar` 6→7 |
| C-4 | Deferred | 20 | pure pass-through transitives of C-3's parents |
| C-5 | Accepted risk | 0 | — |

## Implementation (Phase 3)
| id | command | result |
|---|---|---|
| M-1 | `npm audit fix` (no `--force`) | exactly one change: `fast-uri` 3.1.3→3.1.4 |
| M-2 | `git diff --stat package.json apps/*/package.json packages/*/package.json` | **empty** — zero `package.json` files touched |
| M-3 | `git diff --stat package-lock.json` | 1 file, 3 insertions/3 deletions (the single `fast-uri` bump) |

## Verification ladder (Phase 4)
| id | command | result |
|---|---|---|
| V-1 | `npm ls --workspaces` | no required-dependency errors |
| V-2 | `eslint` (api full `src/**`) | exit 0 |
| V-3 | `tsc --noEmit` (api) | exit 0 |
| V-4 | `tsc --noEmit` (web) | exit 0 |
| V-5 | `next lint` (web) | "No ESLint warnings or errors" |
| V-6 | `jest` (full unit) | **221/221**, 30 suites — identical to PLACE-026 |
| V-7 | `jest --config test/jest-e2e.json` (full e2e) | **44/44**, 8 suites — identical to PLACE-026 |
| V-8 | `turbo run build --force` (tsbuildinfo purged) | 4/4, 0 cached; **153==153** artifacts |
| V-9 | `docker build -f apps/api/Dockerfile .` | succeeded with updated lockfile |
| V-10 | `docker build -f apps/web/Dockerfile .` | succeeded with updated lockfile |
| V-11 | `docker run` api image vs. real dev Postgres/Redis | `/api/health` 200, `database:up`, `redis:up (PONG)` |
| V-12 | `docker run` web image | `GET /` 200 |
| V-13 | test containers/images cleanup | confirmed removed; dev stack (`phuquoc-postgres/-redis/-minio`) confirmed healthy throughout |

## Security report (Phase 5, from real `npm audit` output)
| | Total | Critical | High | Moderate | Low |
|---|---|---|---|---|---|
| Before (prod) | 17 | 1 | 6 | 10 | 0 |
| After (prod) | 17 | 1 | 6 | 10 | 0 |
| Before (incl. dev) | 33 | 1 | 13 | 16 | 3 |
| After (incl. dev) | 32 | 1 | 12 | 16 | 3 |

## Runtime-unchanged proof
| id | evidence | result |
|---|---|---|
| P-1 | `git diff --stat` on all `package.json` files | empty — no direct dependency range touched |
| P-2 | unit + e2e totals | identical to PLACE-026 (221/44) |
| P-3 | `git diff --name-only` scope | `package-lock.json` + governance docs only — no app/API/schema/auth file |

## Not claimed
| id | item | disposition |
|---|---|---|
| NX-1 | NestJS 10→11 major upgrade | NOT performed — requires separate owner approval |
| NX-2 | Next.js 14→16 major upgrade | NOT performed — requires separate owner approval |
| NX-3 | `tar` 6→7 (via override or force) | NOT performed — genuine major bump, real compatibility risk to `bcrypt` install |
| NX-4 | Eligible Candidate 3, PLACE-028 | NOT started |
