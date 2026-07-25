# PhuQuocHub — Production Access and Secret Boundaries

**Created:** 2026-07-25 (PLACE-043). Defines exactly what this repository (and any agent working
in it, including Claude) may know about production infrastructure, and what must never appear
here under any circumstance. This is a boundary document, not an inventory of actual values — see
[`PRE-DEPLOYMENT-CHECKLIST.md`](PRE-DEPLOYMENT-CHECKLIST.md) §2 for the named list of which
variables need real values, and [`HOSTINGER-VPS-BOOTSTRAP-RUNBOOK.md`](HOSTINGER-VPS-BOOTSTRAP-RUNBOOK.md)
Stage 17/18 for where those real values actually get created and stored.

## 1. May be known to this repository / Claude

| Item | Example | Why it's safe |
|---|---|---|
| Public IPv4 (and IPv6, if any) | `<VPS_IPV4>` | Publicly resolvable/discoverable by anyone once DNS points at it; not a credential |
| VPS specification | plan name, vCPU/RAM/storage | Non-sensitive infrastructure metadata |
| OS version | `Ubuntu Server 24.04 LTS` | Public, needed for compatibility decisions |
| Region/datacenter | e.g. Singapore | Public, affects latency planning only |
| Production domain | `phuquochub.com` | Already public (DNS is inherently public) |
| DNS provider | Hostinger / Cloudflare / other | Needed to know where to make DNS changes; not a credential itself |
| Public SSH key | the *public* half of the Owner's keypair | By design meant to be shared — that's what "public key" means |
| Non-sensitive usernames | `<DEPLOY_USER>` | A username alone grants no access |
| Public service ports | `80`, `443`, SSH port if non-default | Visible to anyone who scans the host anyway |
| Public hostname | e.g. `phuquochub.com`, or a VPS-assigned hostname | Public by nature |

## 2. Must NEVER be stored in this repository

| Item | Why | Where it belongs instead |
|---|---|---|
| Root password / any VPS login password | Full system compromise if leaked via git history (which is permanent) | Owner's password manager only |
| Private SSH key (any half of any keypair) | Grants direct VPS access | Owner's local machine / password manager; never transmitted to Claude |
| `DB_PASSWORD` | Full database access | `<PRODUCTION_DIR>/.env` on the VPS only (Stage 17/18) |
| `REDIS_PASSWORD` | Cache/session access | Same as above |
| `JWT_ACCESS_SECRET` / `JWT_REFRESH_SECRET` | Forging valid user sessions | Same as above |
| SMTP password (`<SMTP_HOST>` credential, if/when email sending is added) | Sending mail as PhuQuocHub, or credential reuse elsewhere | Same as above, or a dedicated secrets manager if one is ever adopted |
| Cloudflare API token | DNS/CDN control | Owner's password manager |
| Hostinger API token | Full account/VPS control | Owner's password manager |
| R2 access key / secret key (`<R2_ENDPOINT>` credentials) | Object-storage account access | Same as `.env` above |
| Backup encryption key (if backups are ever encrypted) | Without it, backups are useless; with it exposed, so is the data they protect | Owner's password manager, never alongside the backups themselves |
| Any recovery code (2FA backup codes, Hostinger account recovery, etc.) | Account-takeover risk | Owner's password manager only |
| Any full connection string containing a password (`postgresql://user:PASSWORD@host/db`) | Same risk as the password alone | Never logged, never committed — even in evidence files (see PLACE-042's own redaction discipline) |

## 3. Where real production secrets should actually live

This repository does **not** invent a new secret-management service for this project — it already
has established, working locations:

1. **`<PRODUCTION_DIR>/.env` on the VPS itself** (outside Git, `chmod 600`, owned by
   `<DEPLOY_USER>`) — this is where `docker-compose.prod.yml` already expects every real
   `DB_PASSWORD`/`REDIS_PASSWORD`/`JWT_*`/`R2_*` value to come from (PLACE-038/039/040's own
   placeholder convention assumes exactly this file exists and is filled in for real at deploy
   time).
2. **The Owner's own password manager** — for anything a human needs to remember or re-enter
   (Hostinger login, Cloudflare login, the master copy of every value also in `.env`, in case the
   VPS is ever rebuilt from scratch).
3. **Hostinger's own account security features** (2FA, account recovery) — for the Hostinger
   account itself; this is Owner-side, not something this repository manages.

If a dedicated secrets manager (Vault, Doppler, a cloud provider's secret store, etc.) is ever
adopted, that would be a new, explicitly Owner-authorized decision — not something this task
invents or assumes.

## 4. Practical rule of thumb

Before writing *anything* into this repository (a file, a commit message, an evidence index, a
report), ask: **"Would this value, if leaked via `git log` forever, let someone log into
something?"** If yes, it does not belong here — not even redacted-looking placeholders that are
actually real values, and not even in a file that will supposedly be deleted later (Git history is
effectively permanent once pushed; this repository currently has no remote, PLACE-001 through
PLACE-043, but the same discipline applies regardless).
