# PLACE-027 — Dependency Security Remediation (Eligible PLACE Candidate 2 / OD2-11)

- **Task:** PLACE-027 (`docs/delivery/tasks/PLACE-027.yaml`)
- **Type:** security_hardening
- **Date:** 2026-07-24
- **Outcome:** **COMPLETED** — safe (non-major) remediation applied; every remaining vulnerability requires a major-version bump and is reported, not performed, pending a separate owner decision
- **Authority:** Owner explicit authorization 2026-07-24, Eligible PLACE Candidate 2 (`OD2-11`, Approved)
- **Important scope note:** `OD2-11`'s own recommended option favored a full migration accepting major bumps. This task's explicit authorization was **narrower**: safe patch/minor only, stop and report on anything major. That narrower instruction was followed exactly.

## 1. Preconditions verified

| Precondition | Result |
|---|---|
| PLACE-026 completed successfully | ✅ |
| Candidate 2 approved by the Owner Approval Set | ✅ `OWNER-APPROVAL-SESSION-2026-07-24.md` |
| PLACE-027 authorized | ✅ owner instruction, this turn |
| No active PLACE task | ✅ `state.yaml.current.task: none` |
| Working tree clean | ✅ `git status --short` empty at task start |

## 2. Phase 1 — Evidence-based inventory (fresh `npm audit`, not memory)

**Before (production dependencies, `npm audit --omit=dev`): 17 total — 1 critical, 6 high, 10 moderate, 0 low.**
**Before (including devDependencies, `npm audit`): 33 total — 1 critical, 13 high, 16 moderate, 3 low.**

| Package | Version (installed) | Severity | Direct/Transitive | Workspace | Runtime impact | Exploitability | Recommended upgrade path |
|---|---|---|---|---|---|---|---|
| `tar` | 6.2.1 | Critical | Transitive (via `bcrypt`→`@mapbox/node-pre-gyp`) | apps/api (runtime dep chain, but only exercised at `bcrypt` native-module *install* time, not at request-serving runtime) | Low at runtime (install-time only); arbitrary file write via hardlink/symlink path traversal if ever invoked against untrusted archives | Requires an attacker-controlled tar archive at install time — not reachable via the running HTTP API | Needs `tar` 6.x→7.x (**major**), which is only available via a newer `@mapbox/node-pre-gyp` (no such release accepts it within `bcrypt@5.1.1`'s current chain) |
| `@mapbox/node-pre-gyp` | 1.0.11 | High | Transitive (via `bcrypt`) | apps/api | Same as `tar` — install-time only | Same as `tar` | Rides along once `tar`'s major bump path exists |
| `@nestjs/platform-express` | 10.4.22 | High | Direct | apps/api | **Yes** — this is the actual HTTP-serving Express adapter | Public-facing; the underlying issues (in `body-parser`/`express`/`multer`/`qs`) are request-parsing DoS/injection classes | `@nestjs/platform-express@11.1.28` (**major**, NestJS 10→11) |
| `lodash` | (bundled by `@nestjs/config`) | High | Transitive | apps/api | Low — used only in `@nestjs/config`'s internal merging, not exposed to request input directly | Low | `@nestjs/config@4.0.4` (**major**, NestJS config 3→4) |
| `multer` | (bundled by `@nestjs/platform-express`) | High | Transitive | apps/api | Yes — file-upload middleware, DoS class | Public-facing if upload endpoints are used | `@nestjs/platform-express@11.1.28` (**major**) |
| `next` | 14.2.35 | High | Direct | apps/web | **Yes** — the web server itself | Public-facing; DoS via Image Optimizer config, HTTP request smuggling in rewrites | `next@16.2.11` (**major**, Next 14→16) |
| `postcss` | (bundled by `next`) | High | Transitive | apps/web | Build-time only (CSS processing) | Low (build-time, not request-time) | `next@16.2.11` (**major**) |
| `@nestjs/common` | 10.4.22 | Moderate | Direct | apps/api | Yes — core framework | Indirect (via `file-type`) | `@nestjs/common@11.x` (**major**) — 10.4.22 is already the newest 10.x release; no non-major fix exists |
| `@nestjs/config` | 3.3.0 | Moderate | Direct | apps/api | Low | Indirect (via `lodash`) | `@nestjs/config@4.0.4` (**major**) |
| `@nestjs/core` | 10.4.22 | Moderate | Direct | apps/api | Yes — core framework | Injection-class issue in output handling | `@nestjs/core@11.1.28` (**major**) |
| `@nestjs/terminus` | 10.3.0 | Moderate | Direct | apps/api | Health-check module only | Low | `@nestjs/terminus@11.1.1` (**major**) |
| `@nestjs/typeorm` | 10.0.2 | Moderate | Direct | apps/api | Yes — DB integration layer | Indirect (via `uuid`) | `@nestjs/typeorm@11.0.3` (**major**) |
| `body-parser` | (bundled) | Moderate | Transitive | apps/api | Yes — request body parsing | DoS via silently-disabled size limit | `@nestjs/platform-express@11.1.28` (**major**) |
| `express` | (bundled) | Moderate | Transitive | apps/api | Yes — HTTP layer | DoS via `qs` | `@nestjs/platform-express@11.1.28` (**major**) |
| `file-type` | 20.4.1 | Moderate | Transitive (via `@nestjs/common`) | apps/api | Low | DoS on malformed input | `@nestjs/common@11.x` (**major**) |
| `qs` | (bundled) | Moderate | Transitive | apps/api | Yes — query-string parsing | DoS | `@nestjs/platform-express@11.1.28` (**major**) |
| `uuid` | (bundled) | Moderate | Transitive (via `@nestjs/typeorm`) | apps/api | Low — only if `buf` param used, which this codebase does not do | Low | `@nestjs/typeorm@11.0.3` (**major**) |
| `@nestjs/cli`, `@nestjs/schematics`, `@nestjs/testing` | 10.x | High/Moderate | Direct (dev) | apps/api (dev only) | None — build/test tooling, never shipped | None (dev-only, not deployed) | NestJS 11.x tooling line (**major**) |
| `eslint-config-next` | 14.2.35 | High | Direct (dev) | apps/web (dev only) | None | None | `16.2.11` (**major**, tied to `next`) |
| `glob`, `picomatch`, `tmp`, `@angular-devkit/core`, `@angular-devkit/schematics`, `@angular-devkit/schematics-cli`, `ajv`, `external-editor`, `inquirer`, `webpack`, `@next/eslint-plugin-next` | various | High/Moderate/Low | Transitive (dev tooling only) | dev only | None — never shipped | None | Ride along once their respective major-version parents (`@nestjs/cli`/`next`) bump |
| `fast-uri` | 3.1.3 | High | Transitive (dev tooling, via `ajv`) | dev only | None | None | **3.1.4 — safe patch, within range** |

## 3. Phase 2 — Classification

| Category | Packages | Count |
|---|---|---|
| **1. Safe patch update** | `fast-uri` 3.1.3→3.1.4 | 1 |
| **2. Safe minor update** | *(none found)* | 0 |
| **3. Major update requiring compatibility review** | `@nestjs/common`, `@nestjs/core`, `@nestjs/platform-express`, `@nestjs/config`, `@nestjs/terminus`, `@nestjs/typeorm`, `@nestjs/cli`, `@nestjs/schematics`, `@nestjs/testing` (coordinated NestJS 10→11 ecosystem bump); `next`, `eslint-config-next` (coordinated Next.js 14→16 bump); `tar` (6→7, transitive but genuinely major with real compatibility risk to `bcrypt`'s native-module install step — `npm audit fix` itself declined to apply this without `--force`) | 12 |
| **4. Deferred** | `multer`, `body-parser`, `express`, `qs`, `uuid`, `lodash`, `file-type`, `postcss`, `@next/eslint-plugin-next`, `@mapbox/node-pre-gyp`, `glob`, `picomatch`, `tmp`, `@angular-devkit/core`, `@angular-devkit/schematics`, `@angular-devkit/schematics-cli`, `ajv`, `external-editor`, `inquirer`, `webpack` — pure pass-through transitives with no independent fix path; each resolves automatically once its category-3 parent's major bump lands | 20 |
| **5. Accepted risk** | *(none)* — every remaining item has a clear remediation path (a scoped major-version task), so none was classified as a permanent accepted risk | 0 |

**Why each classification:**
- **Category 1 (`fast-uri`):** `npm audit fix` (non-force — npm's own conservative, non-breaking resolver) applied this automatically. Dev-only transitive dependency, zero runtime exposure, zero compatibility risk.
- **Category 3 (major):** For every NestJS package, `npm outdated` confirms **"Wanted" already equals "Current"** — the existing `^10.4.x`/`^3.x` semver ranges in `apps/api/package.json` have no room for a non-major fix; the patched versions exist only in the 11.x major line. Same for `next` (14.x→16.x). `tar` is included here even though it's transitive: `npm audit fix` (non-force) explicitly declined to bump it, and `npm audit fix --force` reports it would require accepting `@nestjs/typeorm@11.0.3` as a side effect anyway — confirming there is no independent, low-risk path to close it today.
- **Category 4 (deferred):** These packages have zero standalone remediation — they are not directly depended upon by this project and their vulnerable version is dictated entirely by their category-3 parent. Listing them as a separate "major" action would double-count the same underlying decision.
- **Category 5 (accepted risk):** Not used. Every item has an identified, scoped remediation path (the NestJS/Next major-version migration); none was judged permanently unfixable or not worth fixing.

## 4. Phase 3 — Implementation

Ran `npm audit fix` (no `--force`) — npm's own boundary for "safe, non-breaking" fixes. Result: **exactly one change**, `fast-uri` 3.1.3 → 3.1.4, in `package-lock.json` only. **No `package.json` file (root or any workspace) was modified.** No new library was introduced. No package was removed.

Per the explicit stop condition — *"If a major version is required, stop and report"* — none of the 12 category-3 items were applied. This is reported here, not performed.

## 5. Phase 4 — Verification

| Check | Result |
|---|---|
| `npm ls --workspaces` (integrity) | ✅ no required-dependency errors |
| Full lint (api + web) | ✅ exit 0 both |
| Full typecheck (api + web) | ✅ exit 0 both |
| Full unit | ✅ **221/221**, 30 suites — identical to PLACE-026 baseline |
| Full API e2e | ✅ **44/44**, 8 suites — identical to PLACE-026 baseline |
| Clean build (`turbo --force`, tsbuildinfo purged) | ✅ 4/4, 0 cached; artifacts **153==153** |
| Docker build (api) | ✅ rebuilt successfully with the updated lockfile |
| Docker build (web) | ✅ rebuilt successfully with the updated lockfile |
| Docker boot + health (api) | ✅ real container run against real dev Postgres/Redis — `/api/health` 200, `database:up`, `redis:up (PONG)` |
| Docker boot + serve (web) | ✅ real container run — `GET /` 200 |

Identical unit/e2e totals to PLACE-026 prove the one lockfile change introduced zero behavioral regression.

## 6. Phase 5 — Security report

| | Total | Critical | High | Moderate | Low |
|---|---|---|---|---|---|
| **Before (prod only)** | 17 | 1 | 6 | 10 | 0 |
| **After (prod only)** | 17 | 1 | 6 | 10 | 0 |
| **Before (incl. dev)** | 33 | 1 | 13 | 16 | 3 |
| **After (incl. dev)** | 32 | 1 | 12 | 16 | 3 |

**Why the production-dependency count is unchanged (17→17):** every production-facing vulnerability's real fix requires a major version bump (the NestJS 10→11 ecosystem or Next.js 14→16), which this task's explicit authorization does not permit without a separate owner decision. `fast-uri` — the one change that was safe to apply — is a dev-only dependency and does not appear in the `--omit=dev` count.

**Why every remaining item stays open:**
- **1 critical (`tar`):** genuine major-version requirement (6.x→7.x) on a transitive dependency; `npm`'s own non-force resolver confirmed no safe path exists today. Install-time-only exposure (used by `bcrypt`'s native-module fetch), not reachable via the running HTTP API.
- **6 high / 10 moderate (prod):** all trace back to the two coordinated major-version decisions (NestJS 10→11, Next 14→16) already surfaced in `docs/delivery/decisions/OWNER-DECISION-PACKAGE-V2-2026-07-24.md`'s `OD2-11` and awaiting a separate, explicit approval to execute per this task's own constraint.
- **12 additional dev-only high/moderate/low:** pure build/test tooling (never shipped in the production image), riding along with the same NestJS/Next major-version decisions.

## 7. Docker verification detail

Both images were rebuilt from the updated `package-lock.json` and independently verified:
- `phuquochub-api:place027` — built, then run against the real `phuquoc-postgres`/`phuquoc-redis` containers on the existing Docker network; `/api/health` → 200.
- `phuquochub-web:place027` — built, then run; `GET /` → 200.
- Both test images and containers were removed after verification; the dev stack (`phuquoc-postgres`, `phuquoc-redis`, `phuquoc-minio`) was confirmed healthy and untouched throughout.

## 8. Remaining risks

- **1 critical + 18 high/moderate/low vulnerabilities remain**, all gated on a coordinated major-version migration (NestJS 10→11, Next.js 14→16) that requires separate, explicit owner approval before it can be attempted — this task's own authorization does not permit performing it.
- The critical (`tar`) and several high items sit on the request-serving path (`@nestjs/platform-express`, `next` itself) and represent the genuine residual production risk until that migration is approved and executed.
- No CI change was needed for this task (the one dependency bump required no workflow adjustment).

## 9. Non-claims

This task does not perform any major-version dependency upgrade, does not implement Eligible Candidate 3, and does not begin PLACE-028. The critical and most high-severity vulnerabilities remain open, by design, pending a separate owner decision to authorize the NestJS/Next major-version migration.
