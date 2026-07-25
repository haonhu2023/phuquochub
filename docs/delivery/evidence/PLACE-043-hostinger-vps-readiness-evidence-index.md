# PLACE-043 — Evidence Index (Hostinger VPS Readiness, 2026-07-25)

Backs `docs/delivery/reports/PLACE-043-hostinger-vps-readiness-report.md`. This task performed no
live database/Docker operations and touched no application code — evidence here is repository
inspection, cross-reference verification, and final validation only. No password, private key, or
real VPS IP/hostname appears anywhere in this file (none exists in the repository to redact —
every value used in new documents is an explicit named placeholder).

## Phase 1 — Repository truth

| id | evidence | result |
|---|---|---|
| S-1 | `git branch --show-current` | `master` |
| S-2 | `git log -1 --format="%H %s"` | `9a3471b... docs(delivery): complete PLACE-042 evidence and state` |
| S-3 | `git status` | clean at start |
| S-4 | `grep -n "task: none\|status: awaiting" docs/delivery/state.yaml` | `current.task: none`, `awaiting_task_authorization` |
| S-5 | `grep -n "^status:\|^completed_at:" docs/delivery/tasks/PLACE-042.yaml` | `status: completed`, `completed_at: "2026-07-25"` |
| S-6 | `ls docs/delivery/tasks/` sorted | PLACE-001..PLACE-042 present, PLACE-043 absent (pre-task) |

## Reopening (2026-07-25) — Owner-confirmed facts

| id | evidence | result |
|---|---|---|
| O-1 | Owner message, verbatim, this session | Hostinger Web Hosting confirmed active (50 GB NVMe, daily backup, CDN, Node.js support); Hostinger KVM VPS confirmed `NOT PURCHASED`; DNS confirmed managed at Hostinger; nameservers `atlas.dns-parking.com`/`hyperion.dns-parking.com`; apex `A` → `2.57.91.91`; `www` CNAME → `phuquochub.com`; `2.57.91.91` explicitly NOT recorded as a VPS IP |
| O-2 | Cross-check: does any file in this repository currently assert `2.57.91.91` (or any other literal IPv4) is a VPS address? | `grep -rn "2\.57\.91\.91" docs/` — zero pre-existing occurrences (the value is new to this repository as of this update); post-update, the only occurrences are in this evidence index and the report, both explicitly labeled "NOT a VPS IP" |
| O-3 | Cross-check: is this a re-derivation or Owner-supplied? | All 12 facts in report §3 are transcribed directly from the Owner's authorization message, not independently verified by Claude (Claude has no Hostinger Dashboard access) — recorded as Owner-confirmed, not Claude-verified |

## Phase 3 — Existing-assumption inventory sourcing

| id | evidence | result |
|---|---|---|
| A-1 | `grep -rln "Hostinger" docs/` | 27 files reference Hostinger; every one reviewed to classify its claim (report §3) |
| A-2 | `grep -n "phuquochub.com" docs/delivery/PRE-DEPLOYMENT-CHECKLIST.md` | confirms domain decision already recorded, distinct from any DNS-state claim |
| A-3 | `sed -n '388,396p' docs/architecture/deployment.md` | confirms the exact "ĐÃ CHỐT... bước xác minh thật trên dashboard Hostinger vẫn còn" (still-pending-verification) wording already present, unchanged since PLACE-038 |
| A-4 | `grep -rn "SSH\|ssh " docs/delivery/*.md docs/architecture/deployment.md` | confirms SSH design intent exists in `deployment.md` (target architecture) but no bootstrap runbook existed anywhere before this task |
| A-5 | Full-repository grep for any literal IPv4-shaped string (`[0-9]{1,3}\.[0-9]{1,3}\.[0-9]{1,3}\.[0-9]{1,3}`) outside test/example contexts | none found representing a real VPS address — confirms no fabricated or leaked IP exists to accidentally treat as real |
| A-6 | `.env.example` re-read in full | confirms zero VPS-IP or hostname reference of any kind exists there |

## Phase 5/6 — SSH readiness and resource suitability sourcing

| id | evidence | result |
|---|---|---|
| R-1 | `grep -n "^  [a-z]*:$\|image:\|container_name:" docker-compose.prod.yml` | confirms the exact 6-service + 1-one-shot-migrate topology (postgres/redis/minio/migrate/api/web/caddy) used to ground the resource-suitability tiers, not generic advice |
| R-2 | `grep -n "logging:" -A4 docker-compose.prod.yml` (re-check, unchanged since PLACE-038) | confirms the 10m/5-file per-service log ceiling used in the storage-sizing rationale |
| R-3 | Cross-reference against PLACE-037 §10 and PLACE-038 `owner_approved_decisions.server_sizing` | confirms the "4 vCPU/16GB/200GB" figure is correctly cited as an existing Owner-approved estimate, not re-derived or altered by this task |

## Web Hosting suitability assessment sourcing

| id | evidence | result |
|---|---|---|
| W-1 | `grep -n "^  [a-z]*:$" docker-compose.prod.yml` (re-check) | confirms the 6-service Docker Compose topology (postgres/redis/minio/api/web/caddy) — the structural basis for "not confirmed suitable for shared Web Hosting" |
| W-2 | `Read apps/api/src/core/database/data-source.ts` (re-check, from PLACE-042 session context) | confirms the API connects to Postgres via `DB_HOST`/`DB_PORT` expecting a real, directly-reachable Postgres+PostGIS server, not a shared-hosting-managed database proxy |
| W-3 | `Read apps/api/src/core/redis/redis.service.ts` (re-check, from PLACE-040/041 session context) | confirms `RedisService` requires a real Redis server reachable via `REDIS_URL` |
| W-4 | `grep -n "encode gzip\|reverse_proxy" infrastructure/caddy/Caddyfile` (re-check) | confirms Caddy needs to own ports 80/443 directly for automatic TLS — incompatible with a shared hosting plan's own pre-existing web server on those ports without a separate redesign |
| W-5 | Confirm no redesign was attempted | `git diff` shows zero application/infrastructure file changed this update — the suitability conclusion is analysis only, not an implementation |

## Phase 9/10 — New document authoring

| id | evidence | result |
|---|---|---|
| D-1 | `docs/delivery/HOSTINGER-VPS-BOOTSTRAP-RUNBOOK.md` written, 24 stages | manually re-read in full after writing to confirm every stage has purpose/action/expected-result/safety-note/rollback-recovery/evidence-to-retain, and that no destructive command (per this task's own excluded list) appears anywhere |
| D-2 | `docs/delivery/PRODUCTION-ACCESS-AND-SECRET-BOUNDARIES.md` written | manually re-read to confirm §2's "must never store" list matches exactly the categories named in this task's own Phase 10 instruction, and §3 names only pre-existing storage locations (VPS `.env` file, Owner's password manager) — no new secrets-management service invented |

## Phase 13 — Final validation

| id | command | result |
|---|---|---|
| V-1 | `node -e "yaml.load(...)"` on `state.yaml`, `PLACE-043.yaml`, `place.yaml` | all 3 parse cleanly (see below for exact run) |
| V-2 | Markdown path existence check: every path referenced from the 2 new documents and the report | `PRE-DEPLOYMENT-CHECKLIST.md`, `RELEASE-AND-ROLLBACK-CHECKLIST.md`, `PRODUCTION-ACCESS-AND-SECRET-BOUNDARIES.md`, `HOSTINGER-VPS-BOOTSTRAP-RUNBOOK.md`, `docs/architecture/deployment.md` — all confirmed to exist at the referenced relative paths |
| V-3 | Governance consistency check: task file `status`, `state.yaml` `current.task`/`completed_tasks`, `workstreams/place.yaml` `next_task`/`place_043_status` all reviewed together (post-update) | all three consistently describe PLACE-043 as `completed` with outcome `VPS NOT PURCHASED; PRODUCTION DEPLOYMENT DEFERRED` — never as "VPS ready"/"SSH ready"/"production ready"/"deployment complete"; `current.task` returns to `none` in all three |
| V-4 | Secret scan: `grep -riE` for password/secret/token/key-literal patterns + `AKIA`/`BEGIN PRIVATE` across every new/modified file (post-update) | 0 matches |
| V-5 | Placeholder-only check: every `<...>`-bracketed token in the 2 bootstrap/boundary documents confirmed to be a named placeholder, never a real value | confirmed by direct read — `<VPS_IPV4>`, `<DEPLOY_USER>`, `<SSH_PUBLIC_KEY>`, `<PRODUCTION_DIR>`, `<BACKUP_DIR>`, `<DOMAIN>`, `<SMTP_HOST>`, `<R2_ENDPOINT>` only; unchanged by this update |
| V-6 | IP-classification review | confirmed `2.57.91.91` is labeled "NOT a VPS IP" everywhere it appears (report §3/§4/§13, this evidence index O-2); confirmed no document anywhere claims a VPS IPv4 exists |
| V-7 | DNS-fact review | confirmed the report records DNS as CONFIRMED-configured (pointed at Web Hosting) while explicitly NOT claiming any VPS-related DNS readiness |
| V-8 | Full `git diff` review | scoped exactly to the files in the report's Files-Created-or-Modified section; zero application code, Dockerfile, Compose file, or script touched |
| V-9 | Application test suite | **not run** — this update touched no application source, Dockerfile, Compose file, or script; per this task's own Phase 6 instruction, application tests are not required unless application code is modified |

## Not claimed

| id | item | disposition |
|---|---|---|
| NX-1 | Hostinger VPS provisioning status | **CONFIRMED NOT PURCHASED** (Owner-supplied fact, not Claude-verified against a live Dashboard) |
| NX-2 | Any real VPS IPv4/hostname exists | NOT known, NOT fabricated — none exists |
| NX-3 | A live SSH session against a real VPS | NOT performed — nothing to SSH into |
| NX-4 | Any application deployment | NOT performed |
| NX-5 | Any DNS change | NOT performed — DNS was only read/recorded, never modified |
| NX-6 | Any real secret used or stored | NOT done |
| NX-7 | `2.57.91.91` classified as a VPS address | NOT claimed — explicitly recorded as Web Hosting/DNS-parking infrastructure, not a VPS |
| NX-8 | Web Hosting claimed equivalent to VPS | NOT claimed — report §5 explicitly finds it not confirmed suitable for the current topology, no redesign attempted |
| NX-9 | "VPS ready" / "SSH ready" / "production ready" / "deployment complete" | NOT claimed, any of them |
| NX-10 | PLACE-044 | NOT started, NOT created |
