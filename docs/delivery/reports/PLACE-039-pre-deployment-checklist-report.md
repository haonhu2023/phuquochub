# PLACE-039 — Pre-Deployment Checklist Report (2026-07-25)

## 1. Executive Summary

The Owner supplied 5 restated decisions this session (Hostinger KVM VPS as target pending
real-account verification; ~1–2M VND/month budget; `phuquochub.com` / `https://phuquochub.com/api`
domain layout; email notification channel; no staging for the first release, as an explicit MVP
decision) and asked for repository truth to be re-established, PLACE-037 to be closed correctly,
and the next authorized task to be identified and executed if locally possible.

**Finding: PLACE-037 and PLACE-038 were already completed** (HEAD `13539a1` at task start,
`master` branch, clean working tree) and all 5 restated decisions were found to be **byte-for-byte
consistent** with what PLACE-037's decision gate recommended and PLACE-038's
`owner_approved_decisions` already recorded and implemented (repository-controlled only — no real
infrastructure). Nothing about PLACE-037's closure needed correcting; there was no drift to
reconcile.

This task's actual scope is therefore the next genuinely open, locally-executable gap: a single
consolidated **Pre-Deployment Checklist** (`docs/delivery/PRE-DEPLOYMENT-CHECKLIST.md`) covering
(a) the exact Hostinger hPanel facts the Owner must confirm before any real deploy, and (b) which
production secrets/environment values still hold placeholders and must be replaced before
`scripts/deploy.sh` is ever run for real. No application code, Dockerfile, Compose file, or script
was touched — PLACE-038 already implemented all of those correctly.

## 2. Phase 1 — Repository Truth (verified before any file was written)

| Fact | Value |
|---|---|
| Branch | `master` |
| HEAD at task start | `13539a1` — "docs(delivery): PLACE-038 report, evidence index, state updates" |
| `git status` | clean |
| `docs/delivery/tasks/PLACE-037.yaml` | `status: completed`, `completed_at: 2026-07-25`, gate result `READY WITH CONDITIONS` |
| `docs/delivery/tasks/PLACE-038.yaml` | `status: completed`, `completed_at: 2026-07-25`, implements PLACE-037's Topology A, repository-controlled only |
| `docs/delivery/state.yaml` `current.task` | `none` |
| `docs/delivery/state.yaml` `next_action.status` | `awaiting_task_authorization` |
| `docs/delivery/state.yaml` `next_action.pending_owner_decision` | Names Hostinger VPS verification/provisioning as remaining step 1 of 5 Owner-side real-world actions |
| `docs/architecture/deployment.md` §15 | Already reconciled by PLACE-038: domain/staging/topology lines marked "ĐÃ CHỐT" (already decided), explicitly citing PLACE-037 §31 for the still-open Hostinger dashboard verification |
| `.env.example` / `docker-compose.prod.yml` | Already contain PLACE-038's placeholder conventions (`change-me-...`) for `DB_PASSWORD`/`REDIS_PASSWORD`/`JWT_*`, empty `R2_*`, and already-correct `NEXT_PUBLIC_*`/`CORS_ALLOWED_ORIGINS`/`TRUST_PROXY_HOPS` values |

No BUILD_00x legacy report, no conversational memory, and no assumption was used in place of the
above — every fact above was read directly from the repository at task start.

## 3. Phase 2 — PLACE-037 Closure Assessment

PLACE-037's 5 blocking Owner conditions (deployment provider, budget, domain, notification
channel, staging) were cross-checked one by one against the Owner's restated decisions this
session:

| Condition | PLACE-037/038 recorded value | Owner's restated value (this session) | Match |
|---|---|---|---|
| Deployment provider | Hostinger KVM VPS, "verification of actual account status remains a pre-deployment check, not resolved by this task" | Hostinger KVM VPS; must verify via Hostinger Dashboard before real deploy; treat as pre-deployment prerequisite if not yet provisioned | **Identical** |
| Budget | ~1–2 million VND/month | ~1–2 million VND/month | **Identical** |
| Domain/API path | `phuquochub.com`, `https://phuquochub.com/api`, no subdomain unless technically forced | Same | **Identical** |
| Notification channel | Email | Email | **Identical** |
| Staging | "Not required for initial release" | Not deployed in first release; local + Docker production-like + controlled production verification only; explicit MVP decision, revisit after production stabilizes | **Identical** (this session adds the explicit "MVP, revisit later" framing, which is compatible with and now made more explicit in the checklist §4) |

**Conclusion:** PLACE-037 does not need to be reopened, re-decided, or re-closed — it already is
closed, correctly, with the same decisions. The distinction the Owner asked to be preserved
("Owner chose Hostinger" vs. "VPS is actually provisioned") was **already** honored by PLACE-038's
own wording (`"verification of actual account status remains a pre-deployment check, not resolved
by this task"`) and is now additionally reinforced with a concrete action checklist (§1 of the new
document) rather than only a sentence.

No task/report/evidence file for PLACE-037 or PLACE-038 was edited — their content remains
accurate and is not restated as if newly true.

## 4. Phase 3 — Next Authorized Task Determination

`state.yaml`'s own `next_action.objective` for PLACE-038 states: *"Deriving another task without
explicit owner authorization is NOT permitted."* The Owner's message this session is exactly that
authorization — it explicitly instructs assessment of open gaps and execution of whatever is
locally possible, prioritized toward production MVP.

Candidates considered from the Owner's suggested list, checked against actual repository gaps:

- **Reverse proxy / Docker Compose production definition / TLS prep** — already implemented and
  verified (PLACE-038). Re-doing this would duplicate completed work. **Rejected.**
- **Database backup/restore readiness** — `backup.sh`/`restore.sh` already written and *actually
  executed* against disposable local data in PLACE-038. The one remaining sub-gap,
  `migration:revert`, was explicitly flagged open by both PLACE-037 §12 and PLACE-038's evidence
  index (`NX-5`). Investigated as a candidate for this task (§5.1) — **found blocked this session**
  (Docker engine unreachable), carried forward rather than faked.
- **Deployment runbook / rollback linkage** — `scripts/deploy.sh`/`rollback.sh` already exist and
  were verified in PLACE-038; a *real* rollback rehearsal against an actual VPS is blocked on VPS
  provisioning (Owner-side), not an engineering gap. **Not selected** — nothing locally executable
  remains here beyond what PLACE-038 already did.
- **Hostinger VPS preflight checklist** — genuinely open. PLACE-037/038 recorded that account
  verification remains unresolved, but no document existed giving the Owner concrete, bounded,
  non-sensitive dashboard steps. **Selected.**
- **Production environment variable and secret inventory** — `.env.example` already carries
  placeholder values and comments, but no standalone go-live checklist consolidated which values
  are still placeholders and must change before a real deploy. **Selected**, folded into the same
  document rather than a separate one, since both items serve the identical "go/no-go before first
  real deploy" purpose and splitting them would duplicate the same cross-references twice.

Work explicitly **not** duplicated: Caddy config, Compose topology, HEALTHCHECK, Redis auth,
backup/restore/rollback scripts, `.env.example` placeholders themselves, and `deployment.md`
reconciliation — all already done in PLACE-038 and left untouched.

## 5. Phase 4 — Work Executed

### 5.1 Docker-engine availability check (before deciding the migration:revert question)

```
$ docker version --format '{{.Server.Version}}'
failed to connect to the docker API at npipe:////./pipe/dockerDesktopLinuxEngine: ...
$ docker ps
failed to connect to the docker API at npipe:////./pipe/dockerDesktopLinuxEngine: ...
```
```
PS> Get-Process -Name "*Docker*"
(no output — no matching process)
PS> Test-Path "C:\Program Files\Docker\Docker\Docker Desktop.exe"
False
```

This session's Docker engine is not reachable, and no Docker Desktop installation was found at the
standard path. This is a materially different local capability than `state.yaml`'s
`verification_environment.docker: installed_and_running`, which reflects a **prior** session. The
already-flagged `migration:revert` rehearsal (PLACE-037 §12, PLACE-038 evidence `NX-5`) therefore
remains genuinely blocked this session — it was not attempted, and is not claimed done. Recorded in
`docs/delivery/PRE-DEPLOYMENT-CHECKLIST.md` §3 item 6.

### 5.2 Checklist authored

`docs/delivery/PRE-DEPLOYMENT-CHECKLIST.md` written with 4 sections: re-confirmed Owner decisions
(§0), Hostinger VPS preflight (§1), secrets/environment go-live inventory (§2, built directly from
grepping `.env.example` and `docker-compose.prod.yml` for every `change-me-*`/empty placeholder),
outstanding-prerequisites summary (§3), and the staging MVP framing (§4).

### 5.3 Governance updates

`docs/delivery/tasks/PLACE-039.yaml` created; `docs/delivery/state.yaml` and
`docs/delivery/workstreams/place.yaml` updated to record PLACE-039 completion and return
`current.task` to `none`.

## 6. Files Created or Modified

| File | Change |
|---|---|
| `docs/delivery/PRE-DEPLOYMENT-CHECKLIST.md` | New |
| `docs/delivery/tasks/PLACE-039.yaml` | New |
| `docs/delivery/reports/PLACE-039-pre-deployment-checklist-report.md` | New (this file) |
| `docs/delivery/evidence/PLACE-039-pre-deployment-checklist-evidence-index.md` | New |
| `docs/delivery/state.yaml` | Updated: `current.task` stays `none`, `completed_tasks` gains PLACE-039, `next_action` refreshed |
| `docs/delivery/workstreams/place.yaml` | Updated: `place_039_status` added, `next_task` comment refreshed |

No `apps/`, `packages/`, `docker-compose*.yml`, `Dockerfile`, or `scripts/*.sh` file was touched.

## 7. Verification

This task changed documentation and delivery-governance files only. Per this repository's own
`docs/delivery/README.md` guidance, a full lint/typecheck/unit/e2e re-run is not required for a
documentation-and-governance-only change, and none was performed. Verification actually performed:

| Check | Result |
|---|---|
| `git status` before starting | clean |
| Every `.env.example`/`docker-compose.prod.yml` variable named in the new checklist | cross-checked against the actual file contents via `grep`, not from memory |
| Owner's 5 restated decisions vs. PLACE-037/038 records | line-by-line diff, see §3 table |
| New checklist document | manually re-read to confirm zero real secret value appears anywhere |
| `git diff` after all edits | reviewed; limited to the 6 files in §6 |

## 8. Not Claimed

- No real Hostinger VPS provisioning, login, or purchase.
- No real DNS record for `phuquochub.com`.
- No real Cloudflare R2 bucket or credential.
- No real uptime-monitor account.
- No `migration:revert` rehearsal (Docker engine unreachable this session; carried forward).
- No real rollback rehearsal against actual infrastructure.
- No application code, Dockerfile, Compose, or script change.
- No PLACE-040 created or started.
