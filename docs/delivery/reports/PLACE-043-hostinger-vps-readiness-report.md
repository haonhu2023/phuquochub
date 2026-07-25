# PLACE-043 — Hostinger VPS Provisioning Verification and Production Access Readiness Report (2026-07-25)

## 1. Executive Summary

Continuing from PLACE-042 (completed, HEAD `9a3471b` at task start, clean tree, no authorized
`current.task`). The Owner issued explicit written authorization for PLACE-043: verify whether the
real Hostinger KVM VPS is provisioned, gather non-sensitive infrastructure facts, assess SSH
readiness, evaluate resource suitability, and produce a bootstrap checklist — without deploying
the application, without changing DNS, and without any real secret.

This task was first completed at a `blocked` status (§11 requested 11 non-sensitive Hostinger
facts from the Owner). **The Owner has now supplied those facts directly**, and this report is
updated accordingly. The confirmed reality:

- **Hostinger Web Hosting exists and is active** (50 GB NVMe, daily backup, CDN, Node.js support).
- **Hostinger KVM VPS has NOT been purchased.** VPS status: `NOT PURCHASED`.
- `phuquochub.com`'s DNS is managed at Hostinger, nameservers `atlas.dns-parking.com` /
  `hyperion.dns-parking.com`, apex `A` record pointing at `2.57.91.91` — **this IP is explicitly
  NOT a VPS address** (it is whatever Hostinger's DNS-parking/Web-Hosting infrastructure resolves
  the domain to today; no VPS exists to have an IP at all).

**This changes the task's conclusion, not its rigor.** The current multi-service Docker Compose
production topology (Next.js + NestJS + PostgreSQL/PostGIS + Redis + Caddy, PLACE-026/038) has no
confirmed suitable home yet — Web Hosting is not evidence-confirmed to run this, and the VPS that
would run it does not exist. Production deployment of the actual application **remains blocked
until a VPS (or equivalent managed infrastructure) is purchased** — this is a real, unavoidable
prerequisite, not a verification gap this task failed to close.

**PLACE-043 status: `completed`** — `COMPLETED — VPS NOT PURCHASED; PRODUCTION DEPLOYMENT
DEFERRED`. The verification task itself is finished: every question this task could ask has been
asked and answered. What remains (buying a VPS) is a future Owner action, not an open task item.

## 2. Phase 1 — Repository Truth (re-verified before this update)

| Fact | Value |
|---|---|
| Branch | `master` |
| HEAD at reopening | `767175e` — "docs(delivery): record PLACE-043 VPS readiness status" |
| `git status` | clean |
| PLACE-043 (before this update) | `status: blocked`, `completed_at: null` |
| `current.task` | `none`, `status: awaiting_task_authorization` |

## 3. Owner-Confirmed Hosting Facts (2026-07-25)

| # | Fact | Owner-confirmed value |
|---|---|---|
| 1 | Hostinger Web Hosting | **CONFIRMED active** |
| 2 | Hostinger KVM VPS | **NOT PURCHASED** |
| 3 | VPS provision status | **NOT APPLICABLE / NOT PURCHASED** |
| 4 | Web Hosting plan specs | 50 GB NVMe, daily backup, CDN, Node.js support |
| 5 | DNS provider for `phuquochub.com` | **Hostinger** |
| 6 | Nameservers | `atlas.dns-parking.com`, `hyperion.dns-parking.com` |
| 7 | Apex `A` record | `2.57.91.91` |
| 8 | `www` CNAME | `phuquochub.com` |
| 9 | Is `2.57.91.91` a VPS IP? | **No** — explicitly NOT recorded as a VPS address; this repository does not classify it as one anywhere |
| 10 | Web Hosting backup | Daily backup available (part of the hosting plan) |
| 11 | VPS backup/snapshot | **Not applicable** — no VPS purchased |
| 12 | VPS OS / region / vCPU / RAM / storage / snapshot spec | **Does not exist** — no VPS purchased, so no such spec exists to record |

These 12 facts **replace** every `UNVERIFIED`/`AWAITING OWNER` classification in the original §3
inventory (below) that they directly answer. Facts about a VPS that do not exist (OS, region,
vCPU, RAM, storage, snapshot) are recorded as **NOT APPLICABLE**, not as still-pending unknowns —
there is nothing left to verify about a machine that was never bought.

## 4. Updated Existing-Assumption Inventory

| Claim | Classification (updated) | Citation |
|---|---|---|
| Hostinger Web Hosting is active | **CONFIRMED** (this task, Owner-supplied) | §3 |
| Hostinger KVM VPS is the chosen *future* deployment target | **OWNER-STATED (decision), NOT YET ACTED ON** | PLACE-038 `owner_approved_decisions.deployment_provider`; still the intended path, purchase just hasn't happened |
| The VPS is 4 vCPU / 16 GB RAM / 200 GB NVMe | **N/A — no VPS purchased, so no real spec exists** | Was PLACE-037 §10's *estimate* for a future purchase; remains an estimate to re-check at purchase time (§8) |
| The Hostinger account currently has a VPS-tier plan | **CONFIRMED NO** — it has a Web Hosting plan, not a VPS plan | Owner confirmation, §3 |
| The VPS has been purchased | **CONFIRMED NO** | Owner confirmation: `NOT PURCHASED` |
| The VPS is currently running | **N/A — no VPS exists** | — |
| Operating system: Ubuntu Server 24.04 LTS | **OWNER-STATED (target for a future VPS), N/A (no VPS installed)** | Unchanged design intent; nothing to install yet |
| A public IPv4 address exists for a VPS | **CONFIRMED NO** — `2.57.91.91` is DNS's current target, explicitly NOT a VPS IP | Owner confirmation, §3 item 9 |
| `phuquochub.com` DNS is managed at Hostinger | **CONFIRMED** | Owner confirmation, §3 |
| `phuquochub.com` currently resolves | **CONFIRMED** — apex `A` → `2.57.91.91` (Hostinger Web Hosting/parking infrastructure, not a VPS), `www` CNAME → `phuquochub.com` | Owner confirmation, §3 |
| Domain layout: `phuquochub.com` root + `/api` path, no subdomain | **OWNER-STATED (decision, unchanged)** | PLACE-038, not revisited |
| Budget: ~1-2 million VND/month | **OWNER-STATED (unchanged)** | PLACE-038/039/040, not revisited by this task |
| SSH key-only access, no password login, `fail2ban` | **OWNER-STATED (target architecture for a future VPS), N/A today** | `docs/architecture/deployment.md` — nothing to secure on a VPS that doesn't exist |
| Docker Compose production topology is production-ready | **CONFIRMED — locally only** | `docker compose config --quiet` exit 0 (PLACE-038/040/042/043); never run on any real host |
| Hostinger Web Hosting backup | **CONFIRMED** — daily backup included in the plan | Owner confirmation |
| Hostinger VPS backup/snapshot | **N/A — no VPS purchased** | Owner confirmation |

**No OUTDATED item remains** — every classification above is now either a Owner-confirmed fact or
an explicit `N/A` for a machine that doesn't exist, replacing every prior `UNVERIFIED` placeholder.

## 5. Web Hosting Suitability Assessment (evidence-based)

**Question:** can the current Hostinger Web Hosting plan (50 GB NVMe, daily backup, CDN, Node.js
support) run PhuQuocHub's actual production architecture without material redesign?

**Answer: Not confirmed suitable for the current multi-service Docker production topology.**
Evidence, not assumption:

- **Docker.** `docker-compose.prod.yml` (PLACE-038) defines 6 services orchestrated via Docker
  Compose — `postgres` (PostGIS), `redis`, `minio`, `api`, `web`, `caddy`. Shared/managed Web
  Hosting plans (including Hostinger's own, per its published Node.js-hosting model) run a single
  application process under a managed runtime — they do not provide a Docker Engine, root access,
  or the ability to run arbitrary containers. This is a structural mismatch this task did not need
  to speculate about: no shared hosting product markets Docker Compose support, and Hostinger's own
  plan facts (§3) list "Node.js support," not "Docker support."
- **PostgreSQL/PostGIS.** The application requires a real PostgreSQL instance with the PostGIS
  extension (`docker-compose.prod.yml`'s `postgis/postgis:16-3.4` image; migrations depend on
  `CREATE EXTENSION postgis`, PLACE-003). Shared Web Hosting plans do not typically expose a
  root-accessible PostgreSQL+PostGIS instance the application can connect to directly the way
  `apps/api/src/core/database/data-source.ts` expects (`DB_HOST`/`DB_PORT` pointing at a real,
  dedicated Postgres server).
- **Redis.** Same category of gap — `RedisService` (`apps/api/src/core/redis/redis.service.ts`)
  needs a real Redis server reachable via `REDIS_URL`; not a standard Web Hosting offering.
- **Reverse proxy ownership.** Caddy (PLACE-037/038) needs to bind ports 80/443 directly and
  control automatic TLS issuance for `phuquochub.com`. A shared hosting plan's own web server
  (already terminating 80/443 for the account) would conflict with this unless the architecture
  were redesigned around Hostinger's own hosting stack specifically — which this task is
  explicitly instructed **not** to do without separate Owner authorization.
- **System-level monitoring/backup controls.** `scripts/backup.sh`/`restore.sh`/
  `migration-rollback-rehearsal.sh` (PLACE-038/042) all assume root/sudo-level access to run
  `docker exec`, `pg_dump` inside a container, and manage cron directly — capabilities shared Web
  Hosting does not grant.

**This is not a recommendation to rewrite PhuQuocHub to fit shared hosting.** No such redesign is
authorized or proposed here.

### What Web Hosting can still legitimately do today (no redesign needed)

- **Domain/DNS** — already in active use for exactly this (§3).
- **Email** (if/when PhuQuocHub ever needs outbound transactional email — PLACE-041 confirmed no
  such feature exists yet).
- **A temporary landing page** — a simple static "coming soon" page while the real application
  isn't deployed anywhere yet.
- **A maintenance page** — servable from Web Hosting during a future real-VPS incident, independent
  of whether the VPS itself is reachable.
- **A static informational page** — anything that doesn't need the Docker/Postgres/Redis stack at
  all (e.g., a basic project description page), if ever wanted before the real app goes live.

### What requires a VPS or equivalent managed services

- NestJS API runtime (needs a real Node.js process with database/Redis connectivity Docker
  Compose currently orchestrates).
- PostgreSQL/PostGIS (needs a dedicated, extension-capable Postgres instance).
- Redis (needs a dedicated Redis instance).
- Docker Compose orchestration itself (needs Docker Engine + root/sudo access).
- Reverse-proxy ownership of ports 80/443 with automatic TLS (Caddy).
- System-level monitoring and backup controls (`docker exec`, cron, `scripts/*.sh`).

## 6. SSH Access Readiness

Unchanged from this task's original completion — a design/readiness baseline for a *future* VPS,
not yet applicable to anything real:

| Item | Status | Detail |
|---|---|---|
| SSH user, key strategy, `authorized_keys`, host-key verification, firewall, sudo, root/password-login sequencing | **Documented in `HOSTINGER-VPS-BOOTSTRAP-RUNBOOK.md`, N/A until a VPS exists** | Stages 2–8, 11 |
| Fail2ban | Named in target architecture (`deployment.md`), not yet a numbered runbook stage | `docs/architecture/deployment.md` line 202 |
| Emergency console access | Identified as the standing fallback once a VPS exists | Hostinger's own hPanel web terminal / recovery console |

No SSH public key has been supplied, and none is needed until a VPS is purchased.

## 7. Resource Suitability (grounded in this repository's actual `docker-compose.prod.yml`, unchanged)

| Tier | vCPU | RAM | Storage | Rationale |
|---|---|---|---|---|
| **MINIMUM VIABLE** | 2 | 4 GB | 60 GB | Runs all 6 services at zero/near-zero real traffic. |
| **RECOMMENDED INITIAL PRODUCTION** | 4 | 16 GB | 200 GB | Owner-approved estimate (PLACE-037 §10/PLACE-038), re-confirmed reasonable against the actual service list. |
| **UPGRADE THRESHOLD** | — | — | — | Signal-based (sustained swap usage, query-latency degradation past the ~10,000-place MVP target, disk >70-80%), not currently triggered — zero real traffic exists. |

**Budget decision unchanged:** ~1-2 million VND/month. **Before purchase, re-check the actual
Hostinger KVM pricing for the Recommended tier against this budget and the real workload** — this
task does not resolve that trade-off in advance, it only names it as the check to make at
purchase time (§8, Owner action).

## 8. Production Bootstrap Gap Analysis (updated)

| Item | Status | Detail |
|---|---|---|
| Supported Ubuntu LTS | **NOT APPLICABLE** | No VPS to install it on |
| System updates, timezone/NTP, deployment user, firewall, swap, Docker Engine, Docker Compose plugin, git, persistent directories, backup directory | **BLOCKED UNTIL VPS PURCHASED** | All of `HOSTINGER-VPS-BOOTSTRAP-RUNBOOK.md`'s Stages 4/9-19 require a real machine |
| SSH key | **AWAITING OWNER (at future purchase time)** | Not needed until then |
| Reverse proxy strategy, TLS strategy (design), production env-file location (design), log rotation (design), database storage (design), rollback directory/release structure (design) | **READY (design only)** | Already implemented and locally verified (PLACE-038/040/042); portable to any future VPS unchanged |
| Object storage strategy | **PARTIAL (deliberate)** | MinIO unused by app code (Owner-approved deferral); R2 credentials still Owner-side, unaffected by this update |
| Monitoring endpoint | **READY** | `/api/health`, already implemented |
| Uptime monitoring, email alerting | **AWAITING OWNER** | Unchanged, independent of VPS purchase timing |
| DNS readiness | **CONFIRMED, but pointed at Web Hosting, not a VPS** | §3 — DNS itself is fully configured; it simply doesn't point at production infrastructure yet, because none exists |
| Disk-space reserve | **READY (design)** | Covered by the Recommended tier's 200 GB margin, once purchased |
| Recovery console, snapshot availability | **CONFIRMED for Web Hosting (daily backup); N/A for VPS (not purchased)** | §3 |

**Production deployment using the current Docker/PostgreSQL/PostGIS/Redis topology: BLOCKED UNTIL
VPS OR EQUIVALENT INFRASTRUCTURE IS PURCHASED.** This is the single governing conclusion of this
gap analysis.

## 9. Live VPS Verification (Phase 11)

**Not performed, and now confirmed not applicable** — there is no VPS to verify. Not a technical
failure, not an oversight: the Owner has confirmed no VPS exists.

## 10. What PLACE-043 Proved vs. Did Not Prove

**Proved:**
- The Hostinger account currently holds Web Hosting, not a VPS — confirmed directly by the Owner,
  not inferred.
- The current multi-service Docker production topology has no confirmed suitable home on the
  existing Web Hosting plan (§5), based on direct comparison against this repository's own
  `docker-compose.prod.yml` requirements — not generic hosting-tier advice.
- DNS is fully under Hostinger's management, currently pointed at `2.57.91.91` (Web Hosting/
  parking infrastructure) — explicitly not a VPS.
- A complete bootstrap runbook, resource-suitability analysis, and access/secret-boundary
  document exist and are ready to use **the moment** a VPS is purchased.

**Did NOT prove and does not claim:**
- That any VPS exists, is running, or has any specification (none does).
- That SSH access to a VPS works (there is nothing to SSH into).
- That Web Hosting *could never* run any part of PhuQuocHub — only that the current multi-service
  Docker topology is not confirmed suitable for it, and that no redesign toward shared-hosting
  compatibility has been authorized or attempted.
- "VPS ready," "SSH ready," "production ready," or "deployment complete" — none of these are true
  and none is claimed.

## 11. Files Created or Modified

| File | Change |
|---|---|
| `docs/delivery/HOSTINGER-VPS-BOOTSTRAP-RUNBOOK.md` | Unchanged (already correct; ready for future use) |
| `docs/delivery/PRODUCTION-ACCESS-AND-SECRET-BOUNDARIES.md` | Unchanged |
| `docs/delivery/tasks/PLACE-043.yaml` | Updated — status `blocked` → `completed` |
| `docs/delivery/reports/PLACE-043-hostinger-vps-readiness-report.md` | Updated (this file) |
| `docs/delivery/evidence/PLACE-043-hostinger-vps-readiness-evidence-index.md` | Updated |
| `docs/delivery/state.yaml` | Updated |
| `docs/delivery/workstreams/place.yaml` | Updated |

No application code, Dockerfile, Compose file, or script was touched. No real Hostinger/DNS/SSH
action was taken — DNS was only read, per this task's own read-only constraint.

## 12. Owner Action (future, not urgent)

- **Do not purchase a VPS immediately** unless PhuQuocHub's MVP is genuinely ready for public
  deployment — buying infrastructure before it's needed is a real, avoidable cost against the
  ~1-2M VND/month budget.
- **Continue local development and Docker production-like validation** (the path already proven
  repeatedly this session — PLACE-038/040/042) as the actual next engineering work.
- **Purchase a Hostinger KVM VPS (or equivalent infrastructure) when go-live readiness is
  reached** — i.e., when the Owner decides the product is ready for real users.
- **Before purchasing, re-check the actual Hostinger KVM plan pricing** against the Recommended
  tier (§7) and the real workload at that time — the current 4 vCPU/16GB/200GB figure is a
  same-session estimate, not a live price quote.
- **After purchase, reopen infrastructure bootstrap work using
  `HOSTINGER-VPS-BOOTSTRAP-RUNBOOK.md`**, already complete and waiting.

**No urgent purchase requirement exists or is implied by this report.**

## 13. Not Claimed

- VPS ready — **not true, not claimed.**
- SSH ready — **not true, not claimed** (nothing to SSH into).
- Production ready — **not true, not claimed.**
- Deployment complete — **not true, not claimed; no deployment has occurred anywhere.**
- `2.57.91.91` is a VPS address — **explicitly false; it is Hostinger's current DNS target for
  Web Hosting/parking, nothing more.**
- Web Hosting equals or can substitute for VPS without redesign — **not claimed; §5 explicitly
  finds it not confirmed suitable for the current topology.**
- No PLACE-044 created or started.
