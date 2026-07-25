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
| V-3 | Governance consistency check: task file `status`, `state.yaml` `current.task`/`completed_tasks`, `workstreams/place.yaml` `next_task`/`place_043_status` all reviewed together | all three consistently describe PLACE-043 as `blocked`, pending Owner input, never as `completed`; `current.task` returns to `none` in all three |
| V-4 | Secret scan: `grep -riE` for password/secret/token/key-literal patterns + `AKIA`/`BEGIN PRIVATE` across every new/modified file | 0 matches |
| V-5 | Placeholder-only check: every `<...>`-bracketed token in the 2 new documents confirmed to be a named placeholder, never a real value | confirmed by direct read — `<VPS_IPV4>`, `<DEPLOY_USER>`, `<SSH_PUBLIC_KEY>`, `<PRODUCTION_DIR>`, `<BACKUP_DIR>`, `<DOMAIN>`, `<SMTP_HOST>`, `<R2_ENDPOINT>` only |
| V-6 | Fake-IP-as-confirmed check | confirmed no `<VPS_IPV4>` placeholder or any other value anywhere is presented as a confirmed real address — report §3 explicitly marks the actual IP as `UNVERIFIED` |
| V-7 | Full `git diff` review | scoped exactly to the files in the report's Files-Created-or-Modified section |
| V-8 | Application test suite | **not run** — this task touched no application source, Dockerfile, Compose file, or script; per this task's own Phase 13 instruction, no full frontend/backend suite re-run is required for documentation/governance-only changes |

## Not claimed

| id | item | disposition |
|---|---|---|
| NX-1 | Hostinger VPS provisioning status | NOT confirmed — remains `UNVERIFIED`/`AWAITING_OWNER_VERIFICATION` |
| NX-2 | Any real IPv4/hostname/DNS state | NOT known, NOT fabricated |
| NX-3 | A live SSH session against a real VPS | NOT performed |
| NX-4 | Any application deployment | NOT performed |
| NX-5 | Any DNS change | NOT performed |
| NX-6 | Any real secret used or stored | NOT done |
| NX-7 | PLACE-044 | NOT started, NOT created |
