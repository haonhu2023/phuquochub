# PLACE-043 — Hostinger VPS Provisioning Verification and Production Access Readiness Report (2026-07-25)

## 1. Executive Summary

Continuing from PLACE-042 (completed, HEAD `9a3471b` at task start, clean tree, no authorized
`current.task`). The Owner issued explicit written authorization for PLACE-043: verify whether the
real Hostinger KVM VPS is provisioned, gather non-sensitive infrastructure facts, assess SSH
readiness, evaluate resource suitability, and produce a bootstrap checklist — without deploying
the application, without changing DNS, and without any real secret.

**No repository evidence exists anywhere that the real Hostinger VPS has ever been provisioned.**
Every prior mention (PLACE-037/038/039) is a Owner *decision* (Hostinger KVM VPS chosen as the
target) or a *placeholder*, never a confirmed, verified fact. This task could not change that,
because it requires information only the Owner's Hostinger Dashboard can provide, and Claude has
no access to that Dashboard (nor should it — see
[`PRODUCTION-ACCESS-AND-SECRET-BOUNDARIES.md`](../PRODUCTION-ACCESS-AND-SECRET-BOUNDARIES.md)).

**Everything completable from the repository alone was completed**: a full existing-assumption
inventory with an honest CONFIRMED/OWNER-STATED/INFERRED/PLACEHOLDER/UNVERIFIED/OUTDATED
classification (§3), an SSH access-readiness baseline (§4), a 3-tier resource-suitability
assessment grounded in this repository's actual `docker-compose.prod.yml` (§5), a full 24-stage
VPS bootstrap runbook (`HOSTINGER-VPS-BOOTSTRAP-RUNBOOK.md`), and an access/secret-boundaries
document (`PRODUCTION-ACCESS-AND-SECRET-BOUNDARIES.md`).

**PLACE-043 status: `blocked`** (this repository's schema has no dedicated "awaiting Owner input"
state; `blocked` is its closest match) — not `completed`, per this task's own explicit instruction
not to fabricate or assume provisioning status. See §11 for the exact, minimal, non-sensitive-only
request now needed from the Owner.

## 2. Phase 1 — Repository Truth (verified before any file was written)

| Fact | Value |
|---|---|
| Branch | `master` |
| HEAD at task start | `9a3471b` — "docs(delivery): complete PLACE-042 evidence and state" |
| `git status` | clean |
| `current.task` | `none`, `status: awaiting_task_authorization` |
| PLACE-042 | `status: completed`, `completed_at: 2026-07-25` |
| Existing PLACE task files | PLACE-001 through PLACE-042, no PLACE-043 (pre-existing gap at PLACE-033, unrelated) |

## 3. Existing Hostinger/Production Assumption Inventory

| Claim | Classification | Citation |
|---|---|---|
| Hostinger KVM VPS is the chosen deployment target | **OWNER-STATED** | PLACE-038 `owner_approved_decisions.deployment_provider`; reaffirmed PLACE-039/040 owner instructions |
| The VPS is 4 vCPU / 16 GB RAM / 200 GB NVMe | **INFERRED / PLACEHOLDER** — an *estimate*, not a confirmed spec of any real, purchased plan | PLACE-037 §10 explicitly labels this an estimate; PLACE-038's `authority.source` repeats it as "(estimates, per PLACE-037 §10)" |
| The Hostinger account currently has a VPS-tier plan (vs. shared hosting) | **UNVERIFIED** | PLACE-037 §7.5/§8 explicitly classifies this "unknown," not assumed compatible; PLACE-038/039/040/041/042 all repeat "verification of actual account status remains a pre-deployment check, not resolved" |
| The VPS has been purchased at all | **UNVERIFIED** | No task in this repository's history ever recorded a purchase confirmation; PLACE-038's own decision text says "upgrade if current account is not yet VPS-tier" — a conditional, not a confirmation either way |
| The VPS is currently running | **UNVERIFIED** | No status was ever recorded |
| Operating system: Ubuntu Server 24.04 LTS | **OWNER-STATED (target), UNVERIFIED (actual)** | PLACE-038 `owner_approved_decisions.operating_system` — a decision about what OS *should* be installed, not confirmation of what is |
| A public IPv4 address exists for this VPS | **UNVERIFIED** | No IPv4 value has ever appeared anywhere in this repository (grep-verified across `docs/`, `.env.example`, `docker-compose*.yml` — only placeholder tokens like `<VPS_IPV4>` exist, all newly introduced by this task itself) |
| `phuquochub.com` DNS is managed at Hostinger or an external provider | **UNVERIFIED** | `PRE-DEPLOYMENT-CHECKLIST.md` §1.2 item 8 already asked this question in PLACE-039; it has not yet been answered in this repository |
| `phuquochub.com` currently resolves anywhere | **UNVERIFIED** | No DNS record of any kind is described as existing anywhere in this repository |
| Domain layout: `phuquochub.com` root + `/api` path, no subdomain | **OWNER-STATED (confirmed decision, not a DNS-state fact)** | PLACE-038 `owner_approved_decisions.api_routing`, unchanged since |
| Budget: ~1-2 million VND/month | **OWNER-STATED** | PLACE-038/039/040, unchanged, not revisited by this task |
| SSH key-only access, no password login, `fail2ban` | **OWNER-STATED (target architecture), UNVERIFIED (implemented)** | `docs/architecture/deployment.md` line 109/202/375 — design intent from before any VPS existed; not yet implementable until Stage 2+ of the bootstrap runbook actually runs against a real VPS |
| UFW firewall allowing only 80/443 (+ SSH) | **OWNER-STATED (target), UNVERIFIED (implemented)** | Same source as above |
| Docker Compose topology (postgres/redis/minio/api/web/caddy) is production-ready | **CONFIRMED** — locally | `docker-compose.prod.yml` verified via `docker compose config --quiet` (this task, exit 0) and repeatedly booted/tested locally (PLACE-038/040/042) — confirmed *as a local artifact*, not yet confirmed running on any real VPS |
| No other VPS or service currently uses this IP/domain | **UNVERIFIED** | Cannot be checked without the Owner naming the actual IP/domain state in hPanel |
| Hostinger snapshot/backup support exists for the plan | **UNVERIFIED** | Never asked before this task; now explicitly requested in §11 |
| Any prior claim that the VPS "is ready" or "is provisioned" | **Does not exist** | No task file, report, or state.yaml entry in this repository has ever claimed the VPS is provisioned — the closest is PLACE-038's own explicit non-claim: "no real Hostinger/VPS provisioning" |

**No OUTDATED item was found** — every prior record about Hostinger already carries its own
correct "verification pending" caveat (PLACE-037 §31, repeated verbatim through PLACE-039/040/041/042);
nothing needed correcting for staleness.

## 4. SSH Access Readiness

| Item | Status | Detail |
|---|---|---|
| SSH user | **Design decision made, not yet real** | `HOSTINGER-VPS-BOOTSTRAP-RUNBOOK.md` Stage 4 creates `<DEPLOY_USER>`; no real VPS exists yet to create it on |
| SSH port | **Not yet decided** | Default (22) recommended unless the Owner has an operational reason to change it — this task does not change it without one (per its own instruction) |
| SSH key strategy | **Documented, not yet applied** | Public-key-only, Owner-supplied public key, `authorized_keys`-based (Runbook Stage 5) |
| Root login | **Design: disable after key access is verified** | Runbook Stage 8, explicitly sequenced *after* Stage 6's verification, to avoid a self-lockout |
| Password login | **Design: disable after key access is verified** | Same as above |
| `authorized_keys` | **Documented process, not yet applied** | Runbook Stage 5 |
| Host key verification | **Documented, not yet applied** | Runbook Stage 3 — explicit fingerprint comparison, never blind `yes` |
| Firewall | **Documented, not yet applied** | Runbook Stage 11 — UFW, SSH-before-enable ordering |
| Fail2ban | **Named in target architecture (`deployment.md`), not yet in the bootstrap runbook's own numbered stages** — a reasonable Stage-8-adjacent addition once a real VPS exists; not fabricated as "already configured" | `docs/architecture/deployment.md` line 202 |
| Least privilege | **Documented** | Runbook Stage 7 — group-based `sudo`, not blanket `NOPASSWD:ALL` |
| Sudo access | **Documented, not yet applied** | Runbook Stage 7 |
| Emergency console access | **Identified as the standing fallback throughout** | Hostinger's own hPanel web terminal / recovery console, referenced at every risky bootstrap stage (3, 8, 11) |

**No SSH public key has been supplied by the Owner in this session.** Per this task's own
instruction, only a public key may ever be requested — never a private key — and none is required
to complete the repository-side readiness work above.

## 5. Resource Suitability (grounded in this repository's actual `docker-compose.prod.yml`)

Services that must run simultaneously on the VPS (confirmed via direct read of
`docker-compose.prod.yml`, not generic advice): `postgres` (PostGIS 16-3.4), `redis` (7-alpine),
`minio` (unused by application code, PLACE-037, but still present unless the Owner chooses to
comment it out), `api` (NestJS), `web` (Next.js standalone), `caddy` (reverse proxy), plus a
one-shot `migrate` service (only runs during deploys, not continuously), Docker's own build-layer
cache, application/access logs (rotated per-service, PLACE-038: `max-size 10m, max-file 5` — a
bounded ceiling per service), and local backup dumps (`scripts/backup.sh`, pruned to a
daily-7/weekly-4/monthly-6 retention).

| Tier | vCPU | RAM | Storage | Rationale |
|---|---|---|---|---|
| **MINIMUM VIABLE** | 2 | 4 GB | 60 GB | Runs all 6 services at zero/near-zero real traffic (this project's actual current stage — PLACE-037's own repeated framing: "matches the project's actual zero-real-user current scale"). PostgreSQL+PostGIS and Next.js's build step are the two heaviest components at idle; 4 GB is tight but workable with the swap file from Runbook Stage 12 as a safety margin. Storage: OS (~5-8 GB) + Docker images (~2-3 GB across api/web/postgres/redis/minio/caddy) + Postgres data (small at this stage — 49 dev-seeded places) + log rotation ceilings (6 services × 50 MB max = 300 MB) + a few weeks of pruned backups. 60 GB leaves a comfortable margin over this. |
| **RECOMMENDED INITIAL PRODUCTION** | 4 | 16 GB | 200 GB | **This is the Owner-approved figure already recorded in PLACE-038** (`owner_approved_decisions.server_sizing`, citing PLACE-037 §10) — not re-derived here, only re-confirmed as reasonable against the actual service list above: comfortable headroom for concurrent Docker builds during a deploy (the `migrate`/`api`/`web` build stages run alongside the live stack momentarily), Postgres/PostGIS query-planning memory, and growth room before the next tier is needed. |
| **UPGRADE THRESHOLD** | when to move beyond the Recommended tier | Signals, not a fixed number: (1) `free -h` showing sustained swap usage under normal load (not just deploy-time spikes); (2) Postgres query latency degrading as real user data grows past the current 49-place dev-scale toward the ~10,000-place MVP target named in `docs/architecture/deployment.md` §1; (3) disk usage from backups/logs/Docker layers approaching 70-80% of the 200 GB tier. None of these signals currently exist (zero real production traffic) — this is a **watch-for**, not a current blocker. |

**Budget decision unchanged:** ~1-2 million VND/month (PLACE-038/039/040), not revisited by this
task. If the Recommended tier's actual Hostinger KVM pricing exceeds that ceiling once real
pricing is checked (Runbook Stage 1 / `PRE-DEPLOYMENT-CHECKLIST.md` §1.3), that is an Owner
decision to make (accept a smaller tier, adjust the budget, or both) — not something this task
resolves by picking one side.

**If the VPS turns out to already be provisioned but under-sized:** do not deploy; flag exactly
which of vCPU/RAM/storage falls short of the Minimum Viable tier and by how much, using the
Owner-supplied spec once available (§11).

## 6. Production Bootstrap Gap Analysis

| Item | Status | Detail |
|---|---|---|
| Supported Ubuntu LTS | **AWAITING OWNER** | Target decided (24.04 LTS); actual installed version unverified |
| System updates | **MISSING** (pre-bootstrap) | Runbook Stage 9, not yet run against any real VPS |
| Timezone/NTP | **MISSING** | Runbook Stage 10 |
| Deployment user | **MISSING** | Runbook Stage 4 |
| SSH key | **AWAITING OWNER** | Public key not yet supplied |
| Firewall | **MISSING** | Runbook Stage 11 |
| Swap | **MISSING** (conditional) | Runbook Stage 12, only if the Minimum Viable tier is used |
| Docker Engine | **MISSING** | Runbook Stage 13 |
| Docker Compose plugin | **MISSING** | Runbook Stage 14 |
| Git | **MISSING** | Needed to check out this repository onto the VPS; not yet in the runbook's own numbered stages as a distinct step — implicitly required before Stage 15's `<PRODUCTION_DIR>` can contain anything checked out from this repository; add as an explicit action alongside Stage 15 when a real VPS exists |
| Reverse proxy strategy | **READY (design)** | Caddy, already implemented and locally verified (PLACE-038); Runbook Stage 20 covers VPS-side confirmation only |
| TLS strategy | **READY (design), BLOCKED (real cert)** | Caddy automatic HTTPS design is complete; an actual certificate requires real DNS (Stage 21) first |
| Persistent directories | **MISSING** | Runbook Stage 15/16 |
| Production environment file location | **READY (design)** | Runbook Stage 17, matches the existing `.env.example`/compose placeholder convention |
| Backup directory | **MISSING** | Runbook Stage 15/19 |
| Log rotation | **READY (design)** | Already configured per-service in `docker-compose.prod.yml` (PLACE-038) — applies automatically once the stack runs on any host |
| Database storage | **READY (design)** | Named Docker volume (`pg_data_prod`), already correct in `docker-compose.prod.yml` |
| Object storage strategy | **PARTIAL (deliberate)** | MinIO present but unused by app code (Owner-approved deferral, PLACE-037 §6); R2 credentials still Owner-side (PLACE-039 §3) |
| Monitoring endpoint | **READY** | `/api/health`, already implemented and health-checked (PLACE-030/038) |
| Uptime monitoring | **AWAITING OWNER** | External account not yet created (PLACE-039 §3, unchanged) |
| Email alerting | **AWAITING OWNER** | Channel decided (email, PLACE-038), no sending mechanism configured yet (no feature currently requires it — PLACE-041 §7 confirmed) |
| DNS readiness | **AWAITING OWNER** | Provider/current-state unknown (§3) |
| Rollback directory/release structure | **READY (design)** | `scripts/rollback.sh`'s image-tag convention already implemented and rehearsed (PLACE-031/032/036/038) |
| Disk-space reserve | **READY (design)** | Covered by the Recommended tier's 200 GB margin (§5) |
| Recovery console | **AWAITING OWNER** | Hostinger's own hPanel feature — availability unconfirmed until the Owner checks (§11 item "backup/snapshot availability" implicitly covers this) |
| Snapshot availability | **AWAITING OWNER** | §11 |

## 7. Live VPS Verification (Phase 11)

**Not performed.** The Owner has not supplied a public IPv4 or a non-sensitive SSH username in
this session, and no local SSH key was confirmed available for this purpose. Per this task's own
instruction, live verification only proceeds once exactly that information is supplied — it was
not attempted, simulated, or guessed.

## 8. What PLACE-043 Proved vs. Did Not Prove

**Proved / produced:**
- A complete, evidence-based inventory distinguishing Owner *decisions* about Hostinger from
  confirmed *facts* about a real VPS — none of the latter exist yet.
- A resource-suitability analysis grounded in this repository's actual Docker Compose service
  list, not generic VPS sizing advice.
- A full 24-stage bootstrap runbook, safe by construction (no destructive command anywhere,
  correct SSH-hardening sequencing to avoid self-lockout).
- A clear, actionable access/secret boundary document.

**Did NOT prove:**
- Whether a real Hostinger VPS exists, is running, or has any particular specification.
- Whether `phuquochub.com`'s DNS is configured or where it is managed.
- Whether SSH access to a real VPS actually works (no VPS was reachable this session).
- Anything about a real, live server — every claim above is a repository-side design/verification
  artifact, explicitly not a confirmation of production infrastructure state.

## 9. Files Created or Modified

| File | Change |
|---|---|
| `docs/delivery/HOSTINGER-VPS-BOOTSTRAP-RUNBOOK.md` | New |
| `docs/delivery/PRODUCTION-ACCESS-AND-SECRET-BOUNDARIES.md` | New |
| `docs/delivery/tasks/PLACE-043.yaml` | New |
| `docs/delivery/reports/PLACE-043-hostinger-vps-readiness-report.md` | New (this file) |
| `docs/delivery/evidence/PLACE-043-hostinger-vps-readiness-evidence-index.md` | New |
| `docs/delivery/state.yaml` | Updated |
| `docs/delivery/workstreams/place.yaml` | Updated |

No application code, Dockerfile, Compose file, or script was touched. No real Hostinger/DNS/SSH
action was taken.

## 10. Not Claimed

- The Hostinger VPS is **not** claimed to be provisioned, running, or of any particular
  specification.
- `phuquochub.com`'s DNS state is **not** claimed known.
- No live SSH session against any real VPS occurred.
- No real secret, password, private key, or token was used or stored anywhere.
- No PLACE-044 created or started.

## 11. OWNER INPUT REQUIRED — NON-SENSITIVE HOSTINGER FACTS

| # | Fact needed |
|---|---|
| 1 | VPS plan |
| 2 | VPS status (Running / Stopped / Provisioning / Not purchased) |
| 3 | OS and version |
| 4 | Region/datacenter |
| 5 | Public IPv4 |
| 6 | vCPU count |
| 7 | RAM |
| 8 | Storage |
| 9 | DNS provider for `phuquochub.com` |
| 10 | Current nameservers |
| 11 | Backup/snapshot availability on this plan |

**Never send:** any password, private SSH key, API token, or recovery code — none of the above
requires them.
