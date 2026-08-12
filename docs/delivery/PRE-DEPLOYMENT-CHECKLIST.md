# PhuQuocHub — Pre-Deployment Checklist (Hostinger VPS Preflight + Secrets/Environment Go-Live Inventory)

**Created:** 2026-07-25 (PLACE-039). **Status:** consolidates decisions already recorded in
[`PLACE-037`](reports/PLACE-037-production-deployment-monitoring-decision-gate-2026-07-25.md) and
implemented (repository-controlled only) in
[`PLACE-038`](reports/PLACE-038-production-readiness-implementation-report.md). This document
does not decide anything new — it is the operational go/no-go gate the Owner uses before running
`scripts/deploy.sh` against real infrastructure for the first time.

**See also:** [`RELEASE-AND-ROLLBACK-CHECKLIST.md`](RELEASE-AND-ROLLBACK-CHECKLIST.md) (PLACE-040)
— the operator checklist for what to do *during* an actual release, rollback, or backup/restore,
once everything in this document is answered.

**Nothing in this document requires or requests a password, private key, or any credential value.**
Where a real secret is needed, this document names the environment variable only — the Owner
supplies the actual value directly into a real (untracked) `.env`/deploy-time environment, never
into this repository.

---

## 0. Decisions already locked (re-confirmed 2026-07-25, unchanged from PLACE-037/038)

| Decision | Value | Recorded at |
|---|---|---|
| Deployment provider | Hostinger **KVM VPS** (upgrade if current account is not yet VPS-tier) | PLACE-037 §25, PLACE-038 `owner_approved_decisions` |
| Topology | Single VPS, Docker Compose, web+API+Postgres/PostGIS+Redis on the VPS; object storage deferred | PLACE-037 §9, implemented PLACE-038 |
| Monthly budget | ~1–2 million VND | PLACE-038 `owner_approved_decisions.monthly_budget` |
| Production domain | `phuquochub.com` | PLACE-038 `owner_approved_decisions.production_domain` |
| API routing | `https://phuquochub.com/api` — same-domain `/api` path, **no** `api.` subdomain | PLACE-038 `owner_approved_decisions.api_routing` |
| Notification channel | Email | PLACE-038 `owner_approved_decisions.notification_channel` |
| Staging environment | **Not deployed for the first release.** Verification path is local build/boot + the Docker production-like stack (proven in PLACE-038) + a controlled first production deployment. **This is an explicit MVP decision**, to be revisited once production has been stable for a period the Owner judges sufficient — see §4. | PLACE-038 `owner_approved_decisions.staging`; reaffirmed 2026-07-25 |
| Backup retention | Daily 7 / Weekly 4 / Monthly 6 | PLACE-037 §11, PLACE-038 |
| Offsite backup destination | Cloudflare R2 | PLACE-038 |

None of the above is re-decided by this checklist. If any value above ever needs to change, that is
a new Owner decision, not an edit to this file.

---

## 1. Hostinger VPS preflight (Owner action required before any real deploy)

**Why this is still open:** PLACE-037 explicitly classified Hostinger compatibility as `unknown`
— an account may exist without it being a VPS-tier plan with Docker/root access. PLACE-038
implemented the *target* Topology A entirely locally; it did not and could not verify the
*actual* Hostinger account, because doing so requires the Owner's own dashboard access. This is
the single remaining fact every other rollout step depends on (PLACE-037 §25).

### 1.1 Where to look

1. Log in to the **Hostinger hPanel** (https://hpanel.hostinger.com — the same account already
   used for `phuquochub.com`, if the domain is already registered there).
2. Go to **VPS** in the left-hand menu (not "Hosting" / "Websites" — those are shared-hosting
   products and do **not** give Docker/root access).
3. If a VPS is listed there, open it and go to its **Overview** tab.
4. If nothing appears under **VPS**, the current account does not yet have a VPS-tier product —
   see §1.3.

### 1.2 Facts to report back (all non-sensitive — no password, no SSH key, no API token)

| # | Fact | Where to find it in hPanel | Why it matters |
|---|---|---|---|
| 1 | VPS plan/package name (e.g. "KVM 2", "KVM 4") | VPS → Overview | Determines vCPU/RAM/storage vs. PLACE-037 §10's 4 vCPU/16GB/200GB estimate |
| 2 | Current status (running / stopped / not provisioned) | VPS → Overview | Confirms the VPS actually exists and is active |
| 3 | Operating system installed | VPS → Overview → OS | Must be Ubuntu Server 24.04 LTS per the approved decision, or state what it actually is |
| 4 | Public IPv4 address | VPS → Overview → IP Address | Needed to point DNS at the server (§1.4) — **the IP itself is not sensitive**, but do not share SSH credentials alongside it |
| 5 | Datacenter / region | VPS → Overview | Latency to Phú Quốc/Vietnam users (PLACE-037 §25) |
| 6 | vCPU / RAM / storage actually provisioned | VPS → Overview → Resources | Compare against PLACE-037 §10's estimate; resize if short |
| 7 | Root/SSH access available | VPS → Overview (usually shown as "Root access: yes") | Docker requires root or a user in the `docker` group; shared hosting never offers this |
| 8 | Where `phuquochub.com`'s DNS is currently managed | Domains → `phuquochub.com` → DNS / Nameservers (may be Hostinger's own DNS or an external provider, e.g. Cloudflare) | Determines where the future A/AAAA record for §1.4 gets created |

**Do not send:** the VPS root password, any SSH private key, any API token, or hPanel login
credentials. None of those are needed to answer the 8 facts above.

### 1.3 If no VPS exists yet on the current account

This is a **pre-deployment prerequisite**, not something this repository can resolve. Per the
already-approved decision (§0), the action is: upgrade/purchase a Hostinger **KVM VPS** plan
sized at or near 4 vCPU / 16 GB RAM / 200 GB NVMe (PLACE-037 §10 estimate; the Owner's actual
budget of ~1–2 million VND/month, §0, may map to a smaller KVM tier — confirm current Hostinger
KVM pricing against that ceiling before purchasing). This purchase step must be performed by the
Owner directly in hPanel; it is a financial transaction this repository/agent cannot and must not
perform.

### 1.4 Not yet done, deliberately (do not attempt until §1.2/§1.3 are answered)

- Creating the DNS `A`/`AAAA` record pointing `phuquochub.com` at the VPS's public IPv4.
- Any SSH connection to the VPS.
- Running `scripts/deploy.sh` (it assumes a provisioned, reachable VPS with Docker installed).

---

## 2. Production secrets & environment variable go-live inventory

Every variable below currently holds an **obvious placeholder** value in `.env.example` and/or
`docker-compose.prod.yml` (values like `change-me-...`). None of them may be deployed as-is. This
table is the checklist to run through immediately before the first real
`docker compose -f docker-compose.prod.yml up` on the actual VPS — it does not itself set any
value, and no real value is ever to be committed to this repository.

| Variable | Current placeholder (repository) | Must be replaced with | Consumed by |
|---|---|---|---|
| `DB_PASSWORD` | `change-me-db-password` (compose default) | A strong, generated password, set only in the real deploy-time environment (not in git) | `postgres`, `api`, `migrate` services |
| `REDIS_PASSWORD` | `change-me-redis-password-min-16-chars` | A strong, generated password ≥16 chars | `redis`, `api` (embedded into `REDIS_URL`) |
| `REDIS_URL` | must embed the real `REDIS_PASSWORD` above | **PLACE-040: now fail-fast enforced** — `apps/api/src/core/config/env.validation.ts` requires `REDIS_URL` in production (previously it silently fell back to the unauthenticated `redis://localhost:6379` dev default if unset, unlike `DB_HOST`/`CORS_ALLOWED_ORIGINS`, which already had this protection) | `api` (`RedisService` reads this exclusively) |
| `JWT_ACCESS_SECRET` | `change-me-access-secret-min-16-chars` | A strong, random secret ≥16 chars, distinct from `JWT_REFRESH_SECRET` | `api` (access-token signing) |
| `JWT_REFRESH_SECRET` | `change-me-refresh-secret-min-16-chars` | A strong, random secret ≥16 chars, distinct from `JWT_ACCESS_SECRET` | `api` (refresh-token signing) |
| `R2_ACCOUNT_ID` | empty (sync disabled when empty — safe default) | Real Cloudflare R2 account ID | `wal-archive.sh` / `sync-offsite.sh` (offsite backup) |
| `R2_ACCESS_KEY_ID` | empty | Real R2 access key | same |
| `R2_SECRET_ACCESS_KEY` | empty | Real R2 secret key | same |
| `R2_BUCKET` | empty | Real R2 bucket name (create it in the Cloudflare dashboard first) | same |
| `NEXT_PUBLIC_API_URL` | already correctly set to `https://phuquochub.com/api` (compose default) | No change needed — confirm it stays this value at build time | `web` image (baked in at `docker build`, not overridable at runtime — see PLACE-038 defect #1) |
| `NEXT_PUBLIC_MAP_TILE_URL` | already correctly set to the public OSM tile URL | No change needed unless a paid/private tile provider is chosen later | `web` image (also build-time-baked) |
| `CORS_ALLOWED_ORIGINS` | already correctly set to `https://phuquochub.com` | No change needed unless a second real production origin is added | `api` (fail-fast in production if unset) |
| `TRUST_PROXY_HOPS` | already correctly set to `1` (Caddy in front) | No change needed unless the real proxy topology changes | `api` (correct client-IP resolution for rate limiting) |

**Rule:** if a value in the "current placeholder" column still contains the literal text
`change-me` at real-deploy time, deployment must not proceed — this is the exact signal the
placeholder convention was designed to make impossible to miss.

**Not yet configured anywhere (Owner-side accounts, not repository values):**
- An external uptime-monitor account (PLACE-037 §16 Option E) — free-tier, e.g. UptimeRobot or
  similar; the specific provider is an Owner choice, not fixed by this repository.
- Email delivery for the notification channel itself (§0) — confirm which email address(es)
  receive alerts; no email-sending credential exists in this repository today.

---

## 3. Outstanding pre-deployment prerequisites (summary, cross-referenced)

| # | Item | Status | Blocked on |
|---|---|---|---|
| 1 | Hostinger VPS provisioning verified/purchased | **NOT VERIFIED** — no dashboard evidence exists in this repository | Owner (§1) |
| 2 | Real DNS record for `phuquochub.com` → VPS IP | NOT CREATED | Item 1 (need the IP first) |
| 3 | Real Cloudflare R2 bucket + credentials | NOT CREATED | Owner (Cloudflare account action) |
| 4 | External uptime-monitor account | NOT CREATED | Owner (account signup) |
| 5 | Real secret values generated for `DB_PASSWORD`/`REDIS_PASSWORD`/`JWT_*` | NOT GENERATED | Owner or operator, at real-deploy time only |
| 6 | `migration:revert` rehearsal | **NOT PERFORMED** — flagged open since PLACE-037 §12 and PLACE-038 evidence (NX-5); not attempted by PLACE-039 either because this session's Docker engine was unreachable (see PLACE-039 evidence index) | A working local or VPS Docker environment |
| 7 | Real rollback rehearsal against the actual provisioned VPS (not just local Docker) | NOT PERFORMED | Item 1 |
| 8 | First real `scripts/deploy.sh` run | NOT PERFORMED | Items 1–5 |

None of items 1–8 can be performed or simulated from within this repository session. No item is
marked complete without direct evidence (dashboard screenshot/output, command output, or an
explicit Owner statement quoted in a future task's evidence index).

---

## 3a. First operator bootstrap (post-deploy, before the site can be operated)

**Added 2026-08-12 (Operator Bootstrap & Editorial Place Content).** A freshly migrated database
has roles but **no privileged user**: `SeedRbac` creates no `user_roles` row, and the only
role-granting endpoint (`POST /users/{id}/roles`) itself requires `Role.Assign`. Until this
sequence is run, nobody can approve business claims, moderate media, or publish photos — every
owner upload stays `pending` forever. **No hand-written production SQL is required.**

Run this **after** `migrate` succeeds and the API container is healthy:

| # | Step | Command / action |
|---|---|---|
| 1 | Deploy + migrate as usual | `scripts/deploy.sh` (unchanged) |
| 2 | The intended operator registers **through the normal signup form** on the live site | web UI — they choose their own password; nothing here ever sees, sets, or transmits it |
| 3 | Set the bootstrap target in the deploy-time environment (never committed) | `BOOTSTRAP_OPERATOR_EMAIL=<the address used in step 2>` |
| 4 | Run the bootstrap command inside the API container | `npm run operator:bootstrap` |
| 5 | Verify the output | expect `role: administrator` and `outcome: granted` |
| 6 | Unset `BOOTSTRAP_OPERATOR_EMAIL` | it has no standing purpose after step 5 |
| 7 | The operator logs out and logs back in | the new role is only reflected in a fresh session |
| 8 | Verify access | the dashboard now shows **Biên tập nội dung địa điểm** and **Hàng chờ kiểm duyệt** |

Notes that matter operationally:

- **Idempotent.** Re-running step 4 is safe and expected (retry after a network blip, re-running the
  whole deploy script). It reports `outcome: already_assigned` and writes nothing.
- **Fails loudly, never silently.** Unknown email → error telling you to register first; unknown
  role → error naming `SeedRbac`; disallowed role → error listing the allowed set.
- **`administrator` is the default and the right choice.** It is the least-privileged role that
  breaks the deadlock: it holds `Role.Assign` (so every *subsequent* teammate is granted through
  the application, with an audit trail and a named actor — not by re-running this script) and
  inherits `moderator` → `contributor`. **`super_administrator` cannot be bootstrapped by this
  command at all** — its `*` wildcard is never granted from a shell; grant it in-app from an
  existing administrator if it is ever genuinely needed.
- **Two accounts are required to publish editorial photos.** The self-moderation invariant (INV-12,
  `ModerationService.decideMedia`) forbids anyone approving media they uploaded themselves, and
  this milestone deliberately does **not** carve out an exception. Bootstrap a second account for
  the editor — `BOOTSTRAP_OPERATOR_EMAIL=<editor address> BOOTSTRAP_OPERATOR_ROLE=contributor
  npm run operator:bootstrap` — so that operator A uploads and operator B approves.
- Every grant made by this command is written to `audit_logs` as `role.assigned` with
  `context.source = 'operator-bootstrap-script'`, so a shell-issued privilege change is never
  invisible.

---

## 4. Staging — MVP decision, explicitly revisitable

Recorded here for visibility, not as a new decision: no staging environment exists for the first
release (§0). This was chosen because `docs/architecture/deployment.md`'s own four-environment
target design (§3–4 of that document) is disproportionate to a zero-real-user first launch — the
same principle PLACE-037 applied throughout. The substitute verification path is: local build/boot
(routine) → the Docker production-like stack proven in PLACE-038 → a single, carefully observed
production deployment (PLACE-037 §23's rollout sequence). **Revisit trigger:** once production has
been live and stable for a period the Owner judges sufficient (no fixed duration is fabricated
here), introduce a real staging environment before any subsequent higher-risk change (e.g. a
destructive migration) is deployed.
