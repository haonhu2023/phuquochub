# PLACE-029 — Security Assessment (Before/After)

- **Date:** 2026-07-24
- **Scope:** Dependency vulnerability comparison and DB-credential hardening, resulting from Candidate A implementation.
- **Baseline source:** `docs/delivery/reports/PRODUCTION-READINESS-REASSESSMENT-V2-2026-07-24.md` Phase 4 — the same-day fresh audit taken immediately before this task began; no dependency changed in the repository between that baseline and this task's start.
- **After source:** Fresh `npm audit --omit=dev --json` / `npm audit --json`, run under the pinned toolchain in this session, post-implementation.

---

## Before vs. after

### Production dependencies (`npm audit --omit=dev`)

| Metric | Before | After | Change |
|---|---|---|---|
| Total | 18 | **15** | **−3** |
| Critical | 1 | **0** | **−1** |
| High | 7 | **5** | **−2** |
| Moderate | 10 | 10 | 0 |
| Low | 0 | 0 | 0 |

### All dependencies, including dev-only (`npm audit`)

| Metric | Before | After | Change |
|---|---|---|---|
| Total | 33 | **30** | **−3** |
| Critical | 1 | **0** | **−1** |
| High | 13 | **11** | **−2** |
| Moderate | 16 | 16 | 0 |
| Low | 3 | 3 | 0 |

**Dev-only findings (derived, unchanged):** 15 before, 15 after (0 critical, 6 high, 6 moderate, 3 low) — confirms zero devDependency was touched by this task, consistent with its bcrypt-only scope.

### What was removed

| Package | Severity | Why it's gone |
|---|---|---|
| `tar` | Critical | Was transitive via `bcrypt@5.1.1` → `@mapbox/node-pre-gyp@1.0.11` → `tar@6.2.1`. `bcrypt@6.0.0` removes `node-pre-gyp` entirely (switches to `prebuildify`), so `tar` no longer appears anywhere in the dependency tree — confirmed by `npm ls tar --all` returning empty. |
| `@mapbox/node-pre-gyp` | High | Same removal — `bcrypt@6.0.0` has zero dependency on it. |
| `bcrypt` | High (flagged for its dependency, not its own code) | The audit entry existed only because of the `node-pre-gyp`/`tar` chain beneath it. With that chain gone, `bcrypt` no longer appears in the audit output at all. |

None of these three was mitigated, suppressed, or deferred — all three packages (in their vulnerable form) are **physically absent** from `node_modules` and `package-lock.json` after this task.

---

## Remaining findings (15 production, all pre-existing, none introduced by this task)

Every remaining finding requires a NestJS 10→11 or Next.js 14→16 major-version migration to close — confirmed by `npm outdated` (Wanted==Current for every affected package's 10.x/14.x line) and by direct `npm view` range inspection, both performed in the prior reassessment and unchanged by this task (this task touched zero NestJS/Next package).

| Package | Severity | Why unresolved | Migration required | Production impact | Compensating controls |
|---|---|---|---|---|---|
| `@nestjs/platform-express` | High | Patched only in the 11.x line | NestJS 10→11 | Runtime — the HTTP server for every request | RBAC, input validation (`ValidationPipe`), rate limiting, CORS allow-list — all live-verified (PLACE-028); no demonstrated exploit against this codebase's actual usage |
| `lodash` | High | Patched only via `@nestjs/config@4.0.4` (NestJS 11 line) | NestJS 10→11 | Loaded at process boot for config merging; vulnerable functions (`_.template`/`_.unset`/`_.omit`) never invoked with user-controlled input in this codebase — config keys come from env vars, not requests | Same as above; config values are operator-controlled, not request-controlled |
| `multer` | High | Patched only in the NestJS 11 line (transitive via `platform-express`) | NestJS 10→11 | Present in the dependency tree but **no reachable code path** — zero `FileInterceptor`/`@UploadedFile` usage anywhere (`grep -rln` confirms) | No upload feature exists to exercise this package at all |
| `next` | High | Patched only in the 16.x line | Next.js 14→16 | Runtime — the entire web server | No comparable hardening layer on the web app itself, but it serves no privileged operations directly — all writes route through the API's own hardened layer |
| `postcss` | High | Patched only via the Next.js 16 line (transitive) | Next.js 14→16 | **Build-time only** — CSS compiled once during `next build`, never reprocessed per request | Not reachable at runtime by any request |
| `@nestjs/core` | Moderate | Patched only in the 11.x line | NestJS 10→11 | Runtime — framework core, active on every request | Same as `platform-express` row |
| `@nestjs/config` | Moderate | Patched only in the 11.x line (`4.0.4`) | NestJS 10→11 | Runtime, boot-time config load only | Config values operator-controlled, not request-controlled |
| `@nestjs/terminus` | Moderate | Patched only in the 11.x line | NestJS 10→11 | Runtime, but only serves `/api/health` — minimal functional surface | Health endpoint returns no sensitive data, exempt from rate limiting by design (liveness probe) |
| `@nestjs/typeorm` | Moderate | Patched only in the 11.x line (TypeORM itself does **not** need to change) | NestJS 10→11 | Runtime — every DB query goes through this integration layer | Parameterized queries throughout (TypeORM's query builder / repository methods), no raw string concatenation found in prior audits |
| `body-parser` | Moderate | Patched only via the NestJS 11 line (transitive) | NestJS 10→11 | Runtime — parses every POST/PATCH body | `ValidationPipe` + DTO whitelisting rejects unexpected shapes before business logic runs |
| `express` | Moderate | Patched only via the NestJS 11 line (transitive) | NestJS 10→11 | Runtime — foundational middleware for every request | Same layered defenses as above |
| `file-type` | Moderate | `@nestjs/common` exact-pins this; patched only via the NestJS 11 line | NestJS 10→11 | Present but **no reachable code path** — zero `FileTypeValidator`/`ParseFilePipe` usage anywhere | No upload feature exists to exercise this package |
| `qs` | Moderate | Patched only via the NestJS 11 line (transitive via `express`) | NestJS 10→11 | Runtime — parses every request's query string | `ValidationPipe` validates/transforms query DTOs before use; no known-vulnerable parsing pattern reachable through documented query params |
| `uuid` | Moderate | Patched only via the NestJS 11 line (transitive via `@nestjs/typeorm`) | NestJS 10→11 | Runtime, but only for server-generated entity IDs — not attacker-controlled input | IDs are never derived from request input |
| `@nestjs/common` | Moderate | Patched only in the 11.x line | NestJS 10→11 | Runtime — framework core, used everywhere | Same as `platform-express`/`core` rows |

**None of the 15 remaining findings blocks staging or restricted beta**, per the same reachability analysis already performed in the reassessment and independently re-confirmed here (no dependency changed that would alter this conclusion — this task touched only `bcrypt`). All 15 are, at most, "recommended before public production launch," per the PLACE-029 Candidate Selection report's Phase 5 dependency-security decision (NestJS: MIGRATE BEFORE PUBLIC LAUNCH; Next.js: MIGRATE BEFORE PUBLIC LAUNCH).

---

## DB-credential hardening — security effect

**Before:** `DB_HOST`/`DB_USER`/`DB_PASSWORD`/`DB_NAME` all silently fell back to known dev values (`localhost`/`phuquoc`/`phuquoc`/`phuquochub`) in every environment, including production. A misconfigured production deploy — e.g. a missing environment variable in a deploy script — would connect using these known credentials rather than failing loudly. This is not an `npm audit`-tracked CVE; it is a configuration-hygiene finding (R-06 / `PRB-007` in the Production Readiness Backlog), open since the very first production-readiness assessment.

**After:** Verified live (evidence V-16/V-17 in the evidence index) — a production boot with `DB_PASSWORD` missing, or explicitly set to an empty string, crashes immediately with a named Joi validation error, before any database connection is attempted. Non-production behavior is unchanged.

**Production impact of leaving it unresolved:** Low-probability, high-severity — this is a misconfiguration-masking gap, not an actively exploitable network-reachable vulnerability. Its closure removes a standing configuration-hygiene risk rather than a demonstrated attack surface.

**Compensating controls before this task:** None specific — the JWT-secret and CORS-origin fail-fast precedents existed, but DB credentials were the one config category left un-hardened.

---

## Summary

This task closed the single critical-severity and two of seven high-severity production dependency findings, plus one standing configuration-hygiene gap open since the first production-readiness assessment — all without touching any framework version, API contract, or database schema. The remaining 15 production findings are unchanged in count or character from the pre-task baseline; their closure requires the NestJS 10→11 and/or Next.js 14→16 migrations, both of which remain Owner decisions per the PLACE-029 Candidate Selection report.
