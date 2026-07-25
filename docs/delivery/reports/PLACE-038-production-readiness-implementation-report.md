# PLACE-038 — Production Readiness Implementation (Repository-Controlled Infrastructure Preparation)

- **Date:** 2026-07-25
- **Authority:** Owner explicit authorization — "PLACE-038 Authorization", supplying all 5 conditions PLACE-037 left open (Hostinger KVM VPS pending plan verification; `phuquochub.com` domain, same-domain `/api` path; single VPS + Docker Compose Topology A; Ubuntu 24.04 LTS; 4 vCPU/16GB/200GB; Caddy automatic HTTPS; infra-native monitoring + one uptime check; email notification channel; daily-7/weekly-4/monthly-6 backup retention; Cloudflare R2 offsite destination; no staging; ~1–2 million VND/month budget). **External deployment explicitly NOT authorized** — repository-controlled infrastructure preparation only.
- **Repository:** `D:\Projects\PhuQuocHub` (branch `master`)

---

## Preconditions

| Check | Result |
|---|---|
| PLACE-037 completed | ✅ gate result `READY WITH CONDITIONS`, all 5 conditions resolved by direct Owner authorization |
| `current.task: none` at start | ✅ |
| Working tree clean at start | ✅ (HEAD `c93963c`) |
| No git remotes | ✅ nothing to push regardless |

---

## Scope executed

Exactly PLACE-037 §27's proposed implementation-task scope, using the Owner-approved decisions as authoritative input: production Docker Compose adjustments, Caddy reverse-proxy configuration, deployment/backup/restore/rollback/offsite-sync scripts, Dockerfile health-check and file-ownership consistency fixes, environment-template additions, and documentation reconciliation. **Zero product feature, UI, business-logic, or schema change.** All verification performed entirely locally — no DNS, no real VPS, no Hostinger/Cloudflare/R2 connection, no public exposure.

---

## Real defects found and fixed

This task's own local-verification requirement (build + boot the actual stack, not just review the config) surfaced **two genuine, previously-undiscovered defects** — neither hypothetical, both reproduced and fixed with evidence, matching this session's established discipline of never claiming untested infrastructure config works.

### Defect 1 — `NEXT_PUBLIC_API_URL`/`NEXT_PUBLIC_MAP_TILE_URL` were build-time-only, but only ever set at runtime

**Root cause:** Next.js inlines `NEXT_PUBLIC_*` environment variables into the compiled bundle at **build time** (both client and server-side SSR chunks — confirmed by inspecting compiled output directly, not assumed). `docker-compose.prod.yml` previously set these only as a container-runtime `environment:` value, which is read *after* the image is already built — **it had zero effect**.

**Proof:** `docker run --rm phuquochub-web:place036-stabilization sh -c "grep -o 'localhost:4000' apps/web/.next/static/chunks/*.js"` found the old default hardcoded in the already-built image, regardless of the runtime override `docker-compose.prod.yml` supplied.

**Fix:** `apps/web/Dockerfile` now accepts `ARG NEXT_PUBLIC_API_URL` / `ARG NEXT_PUBLIC_MAP_TILE_URL` (defaulting to the existing local-dev values, so an unmodified `docker build` behaves identically to before), set as `ENV` immediately before `next build`. `docker-compose.prod.yml`'s `web` service now passes these via `build.args`, defaulting to the Owner-approved `https://phuquochub.com/api`.

**Re-verified:** built the image with an explicit `--build-arg NEXT_PUBLIC_API_URL=https://phuquochub.com/api` — grepped both the client (`static/chunks`) and server (`server/chunks/ssr`) compiled output: `phuquochub.com/api` present throughout, zero `localhost:4000/api` occurrences.

### Defect 2 — `postgres`'s WAL-archiving `command:` crashed the container on boot

**Root cause:** the original (PLACE-026) `command: >` YAML folded-scalar form joins all lines with spaces into one string; Docker Compose then shell-word-splits that string into argv. `-c archive_command=sh /opt/wal-archive.sh %p %f` contains unquoted spaces in its *value*, so word-splitting broke it into separate, invalid argv entries. `postgres` received `/opt/wal-archive.sh` as a bare, unrecognized argument and refused to start, printing `invalid argument: "/opt/wal-archive.sh"` and exiting — repeatedly, in a restart loop.

**This is a pre-existing defect dating to PLACE-026**, never previously caught because no prior task actually booted `docker-compose.prod.yml`'s `postgres` service through this exact compose-file code path with WAL archiving enabled end-to-end; PLACE-026's own verification used a differently-invoked isolated container for that specific check.

**Fix:** converted `command:` to the unambiguous YAML **list** form — one argv element per list item, no shell word-splitting involved at all.

**Re-verified:** full stack boot after the fix — `postgres` reports `healthy`, WAL archiving flags active, zero crash-loop.

---

## Changes made

### `apps/web/Dockerfile`
- `ARG`/`ENV` for `NEXT_PUBLIC_API_URL`/`NEXT_PUBLIC_MAP_TILE_URL` (Defect 1 fix).
- `HEALTHCHECK` instruction (Node-based, no new package needed — the alpine base has no curl/wget).

### `apps/api/Dockerfile`
- `HEALTHCHECK` instruction against `/api/health`.
- `--chown=node:node` added to the runtime-stage `COPY --from=build` lines, defensively, for consistency with PLACE-036's proven-necessary web fix — no direct evidence the API writes to its own filesystem at runtime, but no evidence it's safe either; this removes the open question at zero cost.

### `docker-compose.prod.yml`
- Explicit `name: phuquochub-prod` (deterministic project/network naming for the scripts).
- `postgres`: WAL-archiving `command:` converted to list form (Defect 2 fix); host-port publishing removed (Topology A private-networking); `logging:` rotation block added.
- New `migrate` service: reuses the Dockerfile's intermediate `build` stage (full TS source + `ts-node`, unlike the lean `runtime` stage the `api` service uses) to run `typeorm-ts-node-commonjs migration:run` on demand, reachable to `postgres` by service name — necessary once `postgres`'s port is no longer published to the host.
- `redis`: `--requirepass` added (closes the gap PLACE-037 flagged); host-port publishing removed; `logging:` block added.
- `minio`: host-port publishing removed; `logging:` block added; unchanged otherwise (still unused by application code, deferred per PLACE-037 §6).
- `api`: `REDIS_URL` now embeds the password; `CORS_ALLOWED_ORIGINS` defaults to `https://phuquochub.com`; `TRUST_PROXY_HOPS` defaults to `1` (Caddy now sits in front); host-port publishing removed; `logging:` block added; image tag parameterized (`API_IMAGE_TAG`) for `scripts/deploy.sh`/`scripts/rollback.sh`.
- `web`: `NEXT_PUBLIC_*` moved to `build.args` (Defect 1 fix); host-port publishing removed; `logging:` block added; image tag parameterized (`WEB_IMAGE_TAG`).
- New `caddy` service: the stack's **only** public-facing service (80/443), routes to `web`/`api` by internal service name.

### `infrastructure/caddy/Caddyfile` (new)
Routes `phuquochub.com` `/api/*` → `api:4000`, everything else → `web:3000`; automatic HTTPS; gzip; access logging with rotation. Also listens on `:8080` (a documented, supported Caddy multi-address pattern) purely for local verification without needing real DNS/TLS — the identical routing logic is exercised on both addresses.

### `scripts/` (new)
`deploy.sh` (build, migrate, smoke-test, cutover — PLACE-037 §23 steps 5–11), `backup.sh` (nightly `pg_dump` + daily-7/weekly-4/monthly-6 retention), `restore.sh` (destructive, confirmation-gated, pg_dump-based restore), `rollback.sh` (image-tag swap + health re-verification, mirroring every manual rollback rehearsal this session), `sync-offsite.sh` (R2 sync via `rclone`, safely no-op without credentials).

### `.env.example`
Added `REDIS_PASSWORD` and `R2_*` placeholders; updated comments to reflect the approved `phuquochub.com` domain and the build-arg-vs-runtime-env distinction for `NEXT_PUBLIC_*` vars.

### `docs/architecture/deployment.md`
Reconciled §header status notes and §15's decision list to reflect what PLACE-037 (decisions) and PLACE-038 (implementation) actually closed, following this repository's own established pattern of keeping documented status honest against verified reality.

### `.gitignore`
Added `backups/` — real database dumps must never enter Git.

---

## Local verification (full detail in the evidence index)

- `docker compose -f docker-compose.prod.yml config --quiet` — valid; confirmed only `caddy` publishes host ports.
- Full stack build (`api`, `web`, `migrate`, plus pulling `caddy:2-alpine`) — succeeded.
- Full stack boot — after the two defect fixes, all 6 containers report `healthy` (`postgres`, `redis`, `minio`, `api`, `web`; `caddy` has no native healthcheck, boots and serves correctly).
- Redis authentication genuinely enforced: unauthenticated `redis-cli ping` → `NOAUTH Authentication required`; authenticated → `PONG`; API's `RedisHealthIndicator` reports `up`.
- Migrations: `docker compose run --rm migrate` against the fresh, empty database — all 20 migrations applied cleanly, confirmed via `SELECT count(*) FROM migrations` = 20, `SELECT count(*) FROM places` = 49 (matches every other verification this session).
- Caddy routing, verified two independent ways: (1) `caddy validate` confirms syntactic/semantic validity including the automatic-HTTPS logic; (2) live requests through Caddy's local `:8080` test address — `/` → `200` (web), `/api/health` → `200` with correct JSON (api).
- Web→API data-fetching mechanism verified independently (rebuilt web pointed directly at `api:4000` by internal service name, since testing the full public-domain hairpin path would require real DNS this repository does not have): `/places/dinh-cau` rendered the real seeded title (`Dinh Cậu · PhuQuocHub`), zero fetch errors in web logs. **Caught and corrected my own test-setup mistake along the way**: an initial attempt pointed the web build at `http://localhost:8080/api`, which cannot work from inside the web container (`localhost` there is the web container's own loopback, not Caddy's) — logs showed `ECONNREFUSED`, the fallback title rendered instead of real data; re-diagnosed and fixed the test, not the implementation.
- `scripts/backup.sh` — actually run against the live local stack (not just syntax-checked): produced a valid, non-empty gzip SQL dump.
- `scripts/restore.sh` — actually run (destructive, confirmation-gated) against the same disposable local stack: dropped and restored the database; `places`=49, `migrations`=20 confirmed identical afterward.
- `scripts/rollback.sh` — actually run against two tagged images: image-tag swap + health re-verification both succeeded.
- `scripts/sync-offsite.sh` — **not executed against any real R2 endpoint** (no credentials exist in this repository/session, per instruction); its safe no-op path (missing-credential early exit) was the only path exercised.
- Full monorepo regression after all changes: lint/typecheck/unit (web 17/17, api 251/251) all pass, forced/fresh; e2e 59/59. **Zero application-source behavior change** beyond the two Dockerfiles' own build/runtime mechanics — confirmed identical totals to every prior PLACE task's baseline.
- Cleanup: full local test stack torn down (`docker compose down -v`), all disposable test images/tags removed, local `backups/` test artifacts removed, dev stack (`phuquoc-postgres`/`-redis`/`-minio`) confirmed unaffected and healthy throughout.

---

## Acceptance criteria disposition

| ID | Criterion | Result |
|---|---|---|
| AC1 | `NEXT_PUBLIC_*` build-time defect fixed and verified | ✅ verified via direct bundle inspection, both client and server chunks |
| AC2 | Both Dockerfiles' `HEALTHCHECK` working | ✅ `docker ps` shows `healthy` for both after boot |
| AC3 | No direct host-port publishing except Caddy | ✅ confirmed via `docker compose config` |
| AC4 | Redis password enforced, API authenticates, health check passes | ✅ `NOAUTH` proven, authenticated `PONG` proven, `/api/health` reports `redis: up` |
| AC5 | Caddy routes `/`→web and `/api`→api, verified locally | ✅ both `caddy validate` and live local requests |
| AC6 | `wal-archive.sh` R2 path present, safely gated, not executed against real R2 | ✅ (implemented as a separate `sync-offsite.sh` script rather than inline in `wal-archive.sh` itself — a deliberate, documented architectural improvement: keeping the synchronous `archive_command` path fast/local-only, decoupling the offsite sync into an async, cron-driven step, since no S3-capable tool exists in the stock `postgis/postgis` image without adding new image layers) |
| AC7 | Deploy/backup/restore/rollback scripts exist, internally consistent, not run against real infrastructure | ✅ all 4 scripts + the new `sync-offsite.sh`; `backup`/`restore`/`rollback` actually executed against disposable local data; `deploy.sh` verified via its constituent mechanisms (`migrate` service, build-arg wiring) rather than end-to-end (it targets a real VPS's git checkout, which doesn't exist here) |
| AC8 | Full local regression unaffected | ✅ lint/typecheck/unit/e2e all pass, identical totals to baseline |
| AC9 | Zero DNS/cloud/purchase/push/secret-value-committed | ✅ |
| AC10 | Delivery evidence complete, state updated, tree clean, PLACE-039 not created | ✅ (this report + evidence index; see state updates below) |

---

## Risks and remaining gaps

- **Hostinger plan verification remains an Owner-side, real-world step** — not resolvable from this repository (unchanged from PLACE-037 §31).
- **`scripts/sync-offsite.sh` has never run against a real R2 bucket** — by design, since no credentials exist in this session; its safe no-op path was the only one exercised.
- **`scripts/deploy.sh`'s full sequence has never run end-to-end against a real VPS** — its constituent parts (image build with build-args, the `migrate` service, the smoke-test health check, the cutover `up -d`) were each verified individually against the local stack; the script itself assumes a real git checkout and a real `docker-compose.prod.yml`-backed environment already running, which is exactly the VPS scenario this task cannot create.
- **`scripts/restore.sh`'s WAL-based PITR path is deliberately not scripted** — only the simpler, deterministic `pg_dump`-based restore is automated; a real PITR restore requires situation-specific target-time judgment (documented in the script's own header, not silently omitted).
- **No `migration:revert` rehearsal was performed** — carried forward as an open item from PLACE-037 §12/§28, still appropriate to defer to the actual pre-launch implementation/rehearsal work, not this repository-preparation task.

None of these block declaring this task's own scope complete — they are honestly-labeled boundaries of what a repository-controlled, no-real-infrastructure task can verify, not defects.

---

## Recommended next step

Per PLACE-037 §31 and this task's own Owner authorization, the concrete next step is the Owner completing the **real-world verification items**: confirming the Hostinger VPS plan (or provisioning it), then the first actual infrastructure implementation task (provisioning the VPS, pointing real DNS at it, obtaining real R2 credentials, and running this repository's now-implemented `docker-compose.prod.yml`/`scripts/deploy.sh` against it for the first time) — explicitly **not** created or authorized by this task. No PLACE-039 is created here, per instruction.
