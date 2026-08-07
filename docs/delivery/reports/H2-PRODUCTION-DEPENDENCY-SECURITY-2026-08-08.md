# H-2 — PRODUCTION DEPENDENCY SECURITY HARDENING

## Status

**Complete.** Closes finding **H-2** of the read-only Production Readiness Review (same source as
H-1/H-3/H-4/H-5): the production dependency tree contained high-severity advisories and CI had no
dependency-security gate. No Medium-severity finding was started after this milestone.

This is a follow-up to `PLACE-027` (2026-07-24), not a repeat of it. `PLACE-027` found that every
production-facing advisory at the time required a coordinated **major**-version migration (NestJS
10→11, Next.js 14→16) and explicitly deferred all of them pending separate owner approval. That
major migration has since landed outside this milestone — `apps/api` is now on `@nestjs/common@
^11.1.28` and `apps/web` was already on `next@^16.2.11` before this task started. The five advisories
closed here are **new** CVEs published after that migration, and — unlike `PLACE-027` — every one of
them was fixable with a **patch/minor** change, entirely inside the already-declared semver ranges.
No STOP condition (major upgrade or ADR conflict) was hit.

## Phase 1 — Before: audit findings

`npm audit --omit=dev` (2026-08-08, before any change): **5 high, 0 critical, 0 moderate, 0 low.**

| Package | Installed | Fixed | Direct/Transitive | Workspace | Runtime reachability | Fix requires |
|---|---|---|---|---|---|---|
| `brace-expansion` | 2.1.2 | ≥2.1.4 | Transitive — `typeorm@0.3.31→glob@10.5.0→minimatch@9.0.9→brace-expansion` | `apps/api` (prod) | Yes — `typeorm` is the runtime DB layer | Lockfile dedupe only; `minimatch@9.0.9` already declares `"brace-expansion": "^2.0.1"`, which permits 2.1.4+ |
| `nanoid` | 3.3.16 | ≥3.3.17 | Transitive — `next→postcss→nanoid` | `apps/web` (prod) | Build-time (Next.js CSS pipeline), not request-time | Resolves once `postcss` is bumped; `postcss`'s own `"nanoid": "^3.3.16"` range already permits it |
| `postcss` | 8.4.31 | ≥8.5.23 | Transitive, **hard-pinned by `next`** (`"postcss": "8.4.31"`, no caret) | `apps/web` (prod) | Build-time | Requires a `next` version bump — `postcss` cannot move independently while pinned |
| `sharp` | 0.34.5 | ≥0.35.0 | Transitive optionalDependency of `next` (`"sharp": "^0.34.5"`, caps below the fix) | `apps/web` (prod) | **Yes — powers `next/image` runtime optimization in production** | Requires a `next` version bump — same reason as `postcss` |
| `next` | 16.2.11 | n/a (flagged only via its `postcss`/`sharp` deps) | Direct | `apps/web` (prod) | Yes | Bump to a version that itself pins fixed `postcss`/`sharp` |

Root dependency paths (from `npm ls --omit=dev`):
- `@phuquochub/api → typeorm@0.3.31 → glob@10.5.0 → minimatch@9.0.9 → brace-expansion@2.1.2`
- `@phuquochub/web → next@16.2.11 → postcss@8.4.31 → nanoid@3.3.16`
- `@phuquochub/web → next@16.2.11 → sharp@0.34.5` (optionalDependency)

## Phase 1 — Why no STOP was triggered

`npm outdated` showed `next`'s **Wanted** version as `16.3.0` — i.e. already inside the existing
`"^16.2.11"` range declared in `apps/web/package.json`. `npm view next@16.3.0 dependencies
--json` confirmed it pins `postcss@8.5.23` (fixed) and its `optionalDependencies` pins `sharp@
^0.35.3` (fixed). This is a **minor** release, not a major one, and required no change to any
declared version range. `typeorm`'s latest is `1.1.0` (major) — that upgrade was never needed;
`brace-expansion` resolves purely through lockfile dedupe because `minimatch@9.0.9`'s own declared
range already covers the fixed version. `npm audit fix --dry-run` was used to confirm the exact
change set before applying anything, per the "assessment before fix" instruction.

## Phase 2 — Minimal fix applied

Ran `npm audit fix` (no `--force`) at the repo root — npm's own conservative, non-breaking
resolver.

**Versions before → after** (all transitive; confirmed via `node_modules/*/package.json` after
install):

| Package | Before | After |
|---|---|---|
| `next` | 16.2.11 | 16.3.0 |
| `postcss` | 8.4.31 | 8.5.23 |
| `sharp` | 0.34.5 | 0.35.3 |
| `nanoid` | 3.3.16 | 3.3.18 |
| `brace-expansion` (apps/api path) | 2.1.2 | 2.1.4 |

**No `package.json` file (root or any workspace) changed** — `git diff --stat -- '*/package.json'`
is empty. Every fix was already inside a previously-declared semver range, so only
`package-lock.json` was touched (plus Next.js's own auto-regenerated `apps/web/next-env.d.ts`,
picked up by the subsequent typecheck/build — an untouched-by-hand, version-controlled file that
Next.js itself maintains). `typeorm` (whose only newer release is a major, `1.1.0`) was left
completely untouched, confirmed via `npm ls typeorm` and `npm ls brace-expansion --omit=dev --all`
showing the fix landed without moving `typeorm`'s version.

`npm audit fix` (run without `--omit=dev`, so it also swept a same-command, patch-level, dev-only
`js-yaml` fix bundled into the same resolver pass) reported **0 vulnerabilities** afterward,
including for devDependencies. This dev-only side effect was not separately chosen — it is standard
`npm audit fix` behavior in a single command — and is out of scope for this task's production gate,
but is noted for completeness.

## Phase 1/2 — After audit

`npm audit --omit=dev`: **0 vulnerabilities.**
`npm audit --omit=dev --audit-level=high`: **0 vulnerabilities, exit code 0.**

## Remaining advisories

**None.** All 5 production HIGH advisories are resolved. No accepted-risk item was needed for this
milestone (contrast with `PLACE-027`, where every item had to be deferred).

## Why no broader dependency upgrade was performed

Every fixable advisory closed inside the already-declared semver ranges in `package.json` — none
required loosening or bumping a declared range, let alone a major version. Per the governing
instructions for this milestone (prefer patch/minor, no unrelated modernization, no major upgrade
without separate authorization), nothing else was touched: `npm outdated` shows several packages
with newer **major** versions available (`typeorm` 0.3.31→1.1.0, `react`/`react-dom` 18→19,
`@types/node` 20→26, `eslint` 8→10, etc.) — none of these were upgraded, since none carry a
production security advisory and bumping them would be unrelated modernization outside H-2's scope.

## Phase 3 — CI security gate

Added a new `dependency-audit` job to `.github/workflows/ci.yml`, placed after `build-test` and
before `e2e`/`docker-build` in file order:

```yaml
dependency-audit:
  name: Dependency security audit (production)
  runs-on: ubuntu-latest
  steps:
    - uses: actions/checkout@v4
    - uses: actions/setup-node@v4
      with:
        node-version: 20
        cache: npm
    - name: Install
      run: npm ci
    - name: Audit production dependencies (fail on high/critical)
      run: npm audit --omit=dev --audit-level=high
```

`docker-build` — the job that builds the Docker images and pushes them to GHCR (the actual
deployment/publication step) — now declares `needs: dependency-audit`, so a HIGH/CRITICAL
production advisory blocks image publication, not just the lint/test job. `build-test` and `e2e`
run independently as before (unchanged topology), so their feedback loop isn't slowed by the new
job, but no path to GHCR exists without the gate passing first.

Behavior:
- Fails CI on any HIGH or CRITICAL advisory in the production (`--omit=dev`) dependency tree.
- Does **not** fail on dev-only advisories (`--omit=dev` scope excludes them entirely).
- Uses the existing `npm ci` / npm-workspaces convention already used by every other job in this
  workflow — no new package manager or tool introduced.
- No Snyk/CodeQL/Trivy/Semgrep, no external paid service — `npm audit` only, as instructed.

YAML validity and job-graph wiring (`needs: dependency-audit` on `docker-build`) were verified with
`js-yaml` before committing.

## Phase 4 — Regression

| Gate | Result |
|---|---|
| `npm audit --omit=dev --audit-level=high` | **0 vulnerabilities, exit 0** |
| Monorepo `typecheck` (turbo, 6 tasks across 5 packages) | 6/6 pass |
| Monorepo `lint` (turbo, 6 tasks) | 6/6 pass |
| Monorepo `build` (turbo, 4 tasks — `next build` + `nest build` + 2 shared packages) | 4/4 pass; `apps/api/dist/main.js` and `apps/web/.next/BUILD_ID` both produced |
| Backend unit (`@phuquochub/api` jest) | **129 suites / 1558 tests — pass** |
| Frontend + shared-package unit (web/utils/shared-types jest) | pass (bundled in the same `npm test` turbo run, 6/6 tasks) |
| Backend e2e (Postgres + Redis) | **not run locally** — Docker daemon was not running in this environment (`docker ps` failed to reach the daemon). This is exercised by CI's existing `e2e` job with real service containers on every push/PR; not modified by this milestone and not re-verified locally here. Flagged explicitly rather than assumed. |
| `git diff --check` | clean (CRLF/LF line-ending warnings only, no real whitespace errors) |
| Secret scan | no dedicated tool (`gitleaks`/`trufflehog`) is installed in this repo or listed in `package.json`; performed a manual pattern scan (`api[_-]?key`, `secret`, `password`, `token`, PEM headers, AWS key prefixes) over the full diff — no findings. The pre-existing `secrets.GITHUB_TOKEN` GitHub Actions expression is unchanged and not a literal credential. |
| `git status --short` | 3 files changed: `.github/workflows/ci.yml`, `package-lock.json`, `apps/web/next-env.d.ts` (Next.js auto-regenerated) |

## Build compatibility (Next.js / sharp / postcss)

`next build` (Turbopack) completed successfully at the new version, producing all 18 routes
including `/map`, `/explore`, `/search` and the dynamic `[slug]` routes — no route regressions.
`apps/web/.next/BUILD_ID` was produced. Image handling (`sharp`) is exercised through `next/image`
inside the same build/runtime path already covered by the existing Docker-boot verification in CI's
`docker-build` job (`GET /` → 200) — not modified by this milestone, since `next build`'s successful
completion at the new dependency versions is the direct evidence that the image-optimization
toolchain still resolves and compiles correctly. Standalone output and the Docker build itself
follow the same `Dockerfile` at `apps/web/Dockerfile`, unmodified by this change.

## Documentation

- This report.
- `docs/delivery/state.yaml` — H-2 summary pushed to the top of the `current.task` chain, H-5's
  summary demoted verbatim beneath it (same convention as every prior H-milestone).
- `docs/architecture/deployment.md` §7 (CI/CD Pipeline) — the pipeline table's existing "Scan" row
  already *described* a dependency-scan step conceptually; added a dated note clarifying that the
  dependency half of that step is now concretely implemented (`dependency-audit` job, gates
  `docker-build`/GHCR push), while the container/image-scan half remains unimplemented and out of
  scope for H-2.

## Final npm audit result

```
npm audit --omit=dev --audit-level=high
found 0 vulnerabilities
```

## Final git status

3 files modified, no untracked files, no deletions:
- `.github/workflows/ci.yml`
- `package-lock.json`
- `apps/web/next-env.d.ts`

## Non-claims

This task does not perform any major-version dependency upgrade, does not touch `typeorm`, does not
introduce image/container vulnerability scanning (SCA for Docker images remains unimplemented — see
the `deployment.md` note above), does not begin any Medium-severity finding, and does not touch
production infrastructure or deployment.
