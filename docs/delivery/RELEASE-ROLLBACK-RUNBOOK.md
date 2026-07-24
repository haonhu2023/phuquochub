# PhuQuocHub — Release & Rollback Runbook

- **Date:** 2026-07-24 (PLACE-031)
- **Scope:** How to release a new API image and how to roll it back. Distinct from [`ENVIRONMENT-SETUP-RUNBOOK.md`](./ENVIRONMENT-SETUP-RUNBOOK.md), which is a local dev-machine environment-relocation guide (Node install, `F:`→`D:` copy) and has nothing to do with release/rollback.
- **Design basis:** This runbook does not invent a new mechanism — it documents and locally rehearses the rollback approach already designed in [`docs/architecture/deployment.md` §9](../architecture/deployment.md): *"Rollback: deploy lại image tag trước (immutable) + migration forward-fix; smoke fail → tự rollback"* (redeploy the previous immutable image tag; smoke-test failure triggers an automatic rollback).
- **What this runbook does NOT cover:** a real staging/production target. No VPS, domain, TLS, or container registry exists in this repository or session (per every prior PLACE task's own non-claims). Every step below is written against the tools that *do* exist today — local Docker, the existing `Dockerfile`s, and the real dev Postgres/Redis — and is directly reusable once a real deploy target exists, since the mechanism (build → tag → boot → health-check → keep-or-revert) is identical either way.

---

## 1. Pre-release checklist

Before building a release image:

1. Working tree is clean (`git status --short` empty) and the commit to release is known (`git rev-parse --short HEAD`).
2. Full verification ladder is green: `npm run lint`, `npm run typecheck` (api + web), `jest` (full unit), `jest --config test/jest-e2e.json` (full e2e, requires the real dev Postgres/Redis running).
3. `npm audit --omit=dev` reviewed — no new critical/high finding introduced since the last release (compare against the most recent PLACE task's security assessment).
4. Clean production build: `rm apps/api/tsconfig.build.tsbuildinfo && npx turbo run build --force` — confirms real artifacts (`dist/main.js`, `.next/BUILD_ID`), not a stale-cache false positive (see the tsbuildinfo hazard documented in `PRODUCTION-READINESS-REASSESSMENT-V2-2026-07-24.md` Phase 2).
5. Required production environment variables are known and available for the target: `DB_HOST/PORT/USER/PASSWORD/NAME`, `REDIS_HOST/PORT/URL`, `JWT_ACCESS_SECRET`/`JWT_REFRESH_SECRET` (≥16 chars), `CORS_ALLOWED_ORIGINS` (required in production — fail-fast if missing, per PLACE-028). None of these are ever committed to the repository.

## 2. Deploy procedure

Using the existing multi-stage `Dockerfile`s (no `docker-compose.prod.yml` change required for this procedure — it operates on plain `docker build`/`docker run` with an explicit, immutable tag, matching how a real CI/CD pipeline would tag by commit SHA or release version):

```bash
# Build, tagged by the release identifier (a real pipeline would use the commit SHA or a version tag)
docker build -f apps/api/Dockerfile -t phuquochub-api:<RELEASE_TAG> .
docker build -f apps/web/Dockerfile -t phuquochub-web:<RELEASE_TAG> .

# Run the new release
docker run -d --name phuquochub-api --network <target-network> \
  -e NODE_ENV=production \
  -e DB_HOST=<...> -e DB_PORT=5432 -e DB_USER=<...> -e DB_PASSWORD=<...> -e DB_NAME=<...> \
  -e REDIS_HOST=<...> -e REDIS_PORT=6379 -e REDIS_URL=<...> \
  -e JWT_ACCESS_SECRET=<...> -e JWT_REFRESH_SECRET=<...> \
  -e CORS_ALLOWED_ORIGINS=<real domain(s)> \
  -p 4000:4000 \
  phuquochub-api:<RELEASE_TAG>
```

Database migrations (if any are pending for this release) run **before** traffic is directed at the new container: `npm run migration:run` (per `apps/api/package.json`), following the "expand → migrate → contract" backward-compatible pattern already named in `deployment.md` §9.

## 3. Health verification (smoke test)

```bash
curl -sS http://<host>:4000/api/health
```

Pass criteria: HTTP `200`, `data.database.status: "up"`, `data.redis.status: "up"`. A `503` or connection failure means **do not shift traffic to this release** — proceed to §4 (Rollback).

As of PLACE-030, every response also carries an `X-Request-Id` header and a matching `meta.requestId` in the body — useful for correlating this smoke-test call with the corresponding structured log line (`docker logs <container> | grep <the-request-id>`) if anything looks wrong.

## 4. Rollback procedure

The rollback unit is the **image tag**, exactly as designed in `deployment.md` §9. Because the database and Redis are external to the container (not baked into the image), rolling the API container back to a prior tag does **not** require touching data — confirmed by direct rehearsal (§5 below): a user created while the *new* release was running remained fully queryable and able to log in after rolling back to the *previous* release.

```bash
# Stop the failed/unwanted release
docker rm -f phuquochub-api

# Redeploy the previous known-good tag
docker run -d --name phuquochub-api --network <target-network> \
  -e NODE_ENV=production \
  -e DB_HOST=<...> [... same environment as §2, unchanged ...] \
  -p 4000:4000 \
  phuquochub-api:<PREVIOUS_RELEASE_TAG>

# Re-verify health (§3) — must pass before considering the rollback complete
curl -sS http://<host>:4000/api/health
```

If the rollback itself fails health verification, the fault is not the application release — check the database/Redis connectivity and credentials first (this exact class of failure is what PLACE-029's fail-fast validation is designed to surface loudly at boot, not silently at request time).

## 5. Local rehearsal record (PLACE-031, executed and verified)

No real staging/production target exists yet, so the mechanism above was rehearsed **locally**, against the real dev Postgres/Redis, using two distinct image tags built from the same reviewed commit (`c82634e`) to represent a "current release" (`release-N`) and a "next release" (`release-N1`):

| Step | Command (abbreviated) | Result |
|---|---|---|
| Baseline row counts recorded | `SELECT count(*) FROM migrations/places/users` | `20` / `49` / `68` |
| Build `release-N` | `docker build -t phuquochub-api:release-N .` | succeeded |
| Boot `release-N` | `docker run ... phuquochub-api:release-N` | `Nest application successfully started` |
| Health-check `release-N` | `curl /api/health` | `200`, `database:up`, `redis:up`, `X-Request-Id` present |
| Auth round-trip on `release-N` | register → login (correct) → login (wrong) | `201` → `200` → `401` |
| Structured logs on `release-N` | `docker logs` | `[HTTP] {"correlationId":...}` lines present for every request, correct correlation IDs |
| Build `release-N1` (simulated next release) | `docker build -t phuquochub-api:release-N1 .` | succeeded |
| Boot `release-N1` | `docker run ... phuquochub-api:release-N1` | health `200` |
| **Rollback**: stop `release-N1`, redeploy `release-N` | `docker rm -f ...; docker run ... phuquochub-api:release-N` | rolled-back container confirmed running `phuquochub-api:release-N` (`docker inspect --format '{{.Config.Image}}'`) |
| Post-rollback health | `curl /api/health` | `200`, `database:up`, `redis:up` |
| **Data continuity across rollback** | login with the user created *while `release-N1` was running* | `200` — the user, created under a different container instance, was fully usable after the rollback, confirming state lives in Postgres/Redis, not the container |
| DB-credential fail-fast re-confirmed | boot `release-N` with `DB_PASSWORD` unset | `Config validation error: "DB_PASSWORD" is required` — PLACE-029 guarantee unaffected by this rehearsal |
| Cleanup | delete test user; `docker rm -f`; `docker rmi` both tags | `DELETE 1`; containers/images removed |
| Post-cleanup row counts | same query as baseline | `20` / `49` / `68` — **identical to baseline** |

Full command-level evidence: `docs/delivery/evidence/PLACE-031-release-rollback-readiness-evidence-index.md`.

## 6. What this runbook does not yet cover

- **A real target host, domain, TLS, or container registry** — none exists in this repository/session (see Phase 7 of `PRODUCTION-READINESS-REASSESSMENT-V2-2026-07-24.md`). The mechanism above is directly reusable against a real host once one is provisioned; only the `<host>`/`<target-network>` placeholders change.
- **Blue-green / zero-downtime cutover** — `deployment.md` §9 designs this for later; `OD2-9` (Owner-approved) explicitly chose a maintenance-window approach for the first several releases, with blue-green added once the basic pipeline is proven reliable.
- **Automated smoke-test-triggered rollback** — today this is a manual procedure (as documented above); wiring it into CI/CD's deploy job is a future task, not attempted here.
- **Database rollback / migration-failure recovery** — this runbook covers *application* rollback only. A failed migration needs its own forward-fix or restore-from-backup procedure (backup/restore validation remains a separate, externally-gated item per the production-readiness backlog).
